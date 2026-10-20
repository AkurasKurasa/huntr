// Huntr extension service worker.
// Works through a queue of applications one at a time: opens the job in a tab,
// runs the site's filler on every page load of that tab, and reports progress
// back to the Huntr tab that asked.

const ADAPTERS = [
  { name: 'OnlineJobs.ph', match: /(^|\.)onlinejobs\.ph$/i, files: ['adapters/common.js', 'adapters/onlinejobs.js'] },
  { name: 'JobStreet', match: /(^|\.)jobstreet\.com(\.ph)?$/i, files: ['adapters/common.js', 'adapters/jobstreet.js'] }
];
const JOB_TIMEOUT_MS = 6 * 60 * 1000; // give up on one job after 6 minutes
const MAX_LOADS = 12; // page loads per job before we stop trying
const TERMINAL = new Set(['submitted', 'error', 'cancelled', 'unsupported', 'timeout']);

const store = chrome.storage.session;

async function getState() {
  const { queue = [], current = null } = await store.get(['queue', 'current']);
  return { queue, current };
}
const setState = (s) => store.set(s);

function adapterFor(url) {
  try {
    const host = new URL(url).hostname;
    return ADAPTERS.find((a) => a.match.test(host)) || null;
  } catch {
    return null;
  }
}

async function report(appTabId, id, status, detail, questions = null) {
  if (appTabId == null) return;
  try {
    await chrome.tabs.sendMessage(appTabId, { type: 'RESULT', id, status, detail, questions });
  } catch {
    /* Huntr tab was closed — the next sync will catch up */
  }
}

async function startNext() {
  const { queue, current } = await getState();
  if (current) return; // busy
  const job = queue.shift();
  if (!job) {
    await setState({ queue: [], current: null });
    return;
  }
  const url = job.applyUrl || job.sourceUrl;
  const adapter = adapterFor(url);
  if (!adapter) {
    await setState({ queue, current: null });
    await report(job.appTabId, job.id, 'unsupported', 'Huntr can only send on OnlineJobs.ph and JobStreet for now.');
    return startNext();
  }
  // Quiet mode: the job opens in a background tab, so you stay on Huntr.
  const tab = await chrome.tabs.create({ url, active: !job.quiet });
  await setState({ queue, current: { job, tabId: tab.id, loads: 0, startedAt: Date.now(), stage: 'opening' } });
  await report(job.appTabId, job.id, 'opening', job.quiet ? 'Sending in the background…' : `Opening the job on ${adapter.name}…`);
}

async function finish(status, detail) {
  const { queue, current } = await getState();
  if (!current) return;
  await report(current.job.appTabId, current.job.id, status, detail);
  await setState({ queue, current: null });
  // Quiet mode: close the job's tab once it's sent and put you back on Huntr if you were looking at it.
  if (current.job.quiet && status === 'submitted') {
    try {
      const tab = await chrome.tabs.get(current.tabId);
      await chrome.tabs.remove(current.tabId);
      if (tab.active && current.job.appTabId != null) await chrome.tabs.update(current.job.appTabId, { active: true });
    } catch {
      /* already closed */
    }
  }
  // small pause between applications so we never hammer the site
  setTimeout(startNext, 2500);
}

async function injectInto(tabId) {
  if (readingTabs.has(tabId)) return;
  const { current } = await getState();
  if (!current || current.tabId !== tabId) return;
  if (Date.now() - current.startedAt > JOB_TIMEOUT_MS) return finish('timeout', 'Took too long — finish it in the open tab, then mark it as submitted in Huntr.');
  current.loads += 1;
  if (current.loads > MAX_LOADS) return finish('error', 'The page kept reloading without reaching the application form.');
  await setState({ current });

  const tab = await chrome.tabs.get(tabId);
  const adapter = adapterFor(tab.url || '');
  if (!adapter) return; // e.g. a Google login page in between — wait for the next load
  const autoSubmit = !!current.job.quiet;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: adapter.files });
    await chrome.tabs.sendMessage(tabId, { type: 'FILL', job: current.job, stage: current.stage, autoSubmit });
  } catch (err) {
    console.warn('[huntr] inject failed', err);
  }
}

// ---------------------------------------------------------------------------
// Reading a job page in your browser, for sites that block Huntr's server (JobStreet answers it with 403).
// Opens the job in a background tab, waits for it to load, takes the page's HTML, closes the tab.
// Only for the job sites the extension supports — the same ones you allowed it to access.
// ---------------------------------------------------------------------------
const CHALLENGE = /just a moment|attention required|checking your browser|verify you are human/i;

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const stop = setTimeout(() => done(false), timeoutMs);
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === 'complete') done(true);
    };
    function done(v) {
      clearTimeout(stop);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(v);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done(true)).catch(() => done(false));
  });
}

async function readPage(url) {
  if (!adapterFor(url)) throw new Error('Huntr only reads pages from the job sites it supports.');
  const tab = await chrome.tabs.create({ url, active: false });
  readingTabs.add(tab.id);
  try {
    if (!(await waitForLoad(tab.id, 30000))) throw new Error('The page took too long to load.');
    // Give the page a moment to render, and wait out a "checking your browser" screen if one shows.
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({ title: document.title, text: (document.body?.innerText || '').length }) });
      if (!CHALLENGE.test(result.title) && result.text > 400) break;
    }
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const doc = document.documentElement.cloneNode(true);
        // Keep structured data; drop scripts, styles and images' inline data to keep it small.
        doc.querySelectorAll('script:not([type="application/ld+json"]), style, noscript, svg, iframe, link[rel="stylesheet"]').forEach((n) => n.remove());
        return { html: '<!doctype html>' + doc.outerHTML, finalUrl: location.href, title: document.title };
      }
    });
    if (CHALLENGE.test(result.title)) throw new Error('The site wants you to confirm you\'re human — open the link once in this browser, then try again.');
    return result;
  } finally {
    readingTabs.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
const readingTabs = new Set();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'READ_PAGE') {
      try {
        const page = await readPage(String(msg.url));
        sendResponse({ ok: true, ...page });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
      return;
    }

    if (msg?.type === 'APPLY') {
      const appTabId = sender.tab?.id;
      const { quiet = true } = await chrome.storage.local.get('quiet');
      let { queue, current } = await getState();
      // Pressing Send again on the job that's in progress (e.g. stuck after an older version) starts it over.
      if (current && msg.jobs.some((j) => j?.id === current.job.id)) {
        const oldTab = current.tabId;
        current = null;
        await setState({ current: null });
        chrome.tabs.remove(oldTab).catch(() => {});
      }
      const known = new Set([...queue.map((j) => j.id), current?.job?.id]);
      const fresh = msg.jobs.filter((j) => j?.id && !known.has(j.id)).map((j) => ({ ...j, appTabId, quiet }));
      await setState({ queue: [...queue, ...fresh], current });
      for (const j of fresh) await report(appTabId, j.id, 'queued', 'Waiting in line…');
      await startNext();
      sendResponse({ ok: true, queued: fresh.length });
      return;
    }

    if (msg?.type === 'ADAPTER') {
      const { current } = await getState();
      if (!current || sender.tab?.id !== current.tabId || current.done) return sendResponse({ ok: false });
      if (TERMINAL.has(msg.status)) {
        current.done = true; // ignore anything that arrives after the job is finished
        await setState({ current });
      }
      if (TERMINAL.has(msg.status)) {
        await finish(msg.status, msg.detail);
      } else {
        current.stage = msg.status;
        await setState({ current });
        if (msg.status === 'questions') current.startedAt = Date.now(); // you may take a while to answer
        await setState({ current });
        await report(current.job.appTabId, current.job.id, msg.status, msg.detail, msg.questions || null);
        // Quiet mode only shows you the tab when it needs you: log in, captcha, or a form Huntr can't send.
        if (current.job.quiet && (msg.status === 'needs-login' || msg.status === 'filled')) await showTab(current.tabId);
      }
      sendResponse({ ok: true });
      return;
    }

    // Answers to employer questions, typed in Huntr — hand them to the job's tab.
    if (msg?.type === 'ANSWERS') {
      const { current } = await getState();
      if (!current || current.job.id !== msg.id) return sendResponse({ ok: false });
      current.startedAt = Date.now();
      await setState({ current });
      chrome.tabs.sendMessage(current.tabId, { type: 'ANSWERS', answers: msg.answers }).catch(() => {});
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === 'CANCEL_ALL') {
      const { queue, current } = await getState();
      for (const j of queue) await report(j.appTabId, j.id, 'cancelled', 'Cancelled.');
      await setState({ queue: [] });
      if (current) await finish('cancelled', 'Cancelled.');
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === 'STATUS') {
      const s = await getState();
      sendResponse({ queued: s.queue.length, current: s.current ? { title: s.current.job.title, stage: s.current.stage } : null });
    }
  })();
  return true; // keep the channel open for the async reply
});

async function showTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    /* tab gone */
  }
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') injectInto(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { current } = await getState();
  if (current?.tabId === tabId) {
    const sent = current.stage === 'submitting';
    await finish(sent ? 'error' : 'cancelled', sent ? 'The tab was closed while sending — check the job site to see if it went through.' : 'You closed the tab, so this one was skipped.');
  }
});

// Tell open Huntr tabs when the background-sending setting changes.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.quiet) return;
  const tabs = await chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*', 'https://akuraskurasa.github.io/*'] });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'SETTINGS' }).catch(() => {});
});

// ---------------------------------------------------------------------------
// Site access. Firefox doesn't grant an add-on's site access automatically, so
// on install (and whenever it's missing) we show a page with an "Allow access" button.
// ---------------------------------------------------------------------------
const NEEDED = { origins: chrome.runtime.getManifest().host_permissions };

async function hasAccess() {
  try {
    return await chrome.permissions.contains(NEEDED);
  } catch {
    return true;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  if (!(await hasAccess())) chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

// After access is granted, reload open Huntr tabs so the connection starts working right away.
chrome.permissions.onAdded?.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ['http://localhost/*', 'http://127.0.0.1/*', 'https://akuraskurasa.github.io/*'] });
  for (const t of tabs) chrome.tabs.reload(t.id).catch(() => {});
});
