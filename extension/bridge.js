// Runs inside the Huntr web app's tab. Passes messages between the page and the extension.
// Page -> extension: window.postMessage({ source: 'huntr-app', type: 'APPLY' | 'PING', ... })
// Extension -> page: window.postMessage({ source: 'huntr-ext', type: 'READY' | 'RESULT', ... })
(() => {
  const version = chrome.runtime.getManifest().version;

  async function announce() {
    let autoSubmit = true; // "Send in the background" (on by default) also presses Send for you
    try {
      ({ quiet: autoSubmit = true } = await chrome.storage.local.get('quiet'));
    } catch {
      /* extension reloaded — ignore */
    }
    window.postMessage({ source: 'huntr-ext', type: 'READY', version, autoSubmit }, window.location.origin);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'huntr-app') return;
    const msg = event.data;
    if (msg.type === 'PING') announce();
    if (msg.type === 'READ_PAGE' && typeof msg.url === 'string' && msg.reqId) {
      chrome.runtime.sendMessage({ type: 'READ_PAGE', url: msg.url })
        .then((r) => window.postMessage({ source: 'huntr-ext', type: 'PAGE', reqId: msg.reqId, ...(r || { ok: false, error: 'No answer from the extension.' }) }, window.location.origin))
        .catch((err) => window.postMessage({ source: 'huntr-ext', type: 'PAGE', reqId: msg.reqId, ok: false, error: err.message || 'The extension was updated — reload this page.' }, window.location.origin));
    }
    if (msg.type === 'ANSWERS' && msg.id && msg.answers && typeof msg.answers === 'object') {
      chrome.runtime.sendMessage({ type: 'ANSWERS', id: msg.id, answers: msg.answers }).catch(() => {});
    }
    if (msg.type === 'APPLY' && Array.isArray(msg.jobs)) {
      chrome.runtime.sendMessage({ type: 'APPLY', jobs: msg.jobs }).catch(() => {
        window.postMessage({ source: 'huntr-ext', type: 'RESULT', id: msg.jobs[0]?.id, status: 'error', detail: 'The Huntr extension was updated — reload this page and try again.' }, window.location.origin);
      });
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'RESULT') {
      window.postMessage({ source: 'huntr-ext', type: 'RESULT', id: msg.id, status: msg.status, detail: msg.detail || '', questions: msg.questions || null }, window.location.origin);
    }
    if (msg?.type === 'SETTINGS') announce();
  });

  announce();
  document.addEventListener('DOMContentLoaded', announce);
})();
