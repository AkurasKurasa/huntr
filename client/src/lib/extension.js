import { useEffect, useRef, useState } from 'react';

/** Sites the Huntr extension can send on. */
export const EXTENSION_SITES = [
  { key: 'onlinejobs', name: 'OnlineJobs.ph', match: /(^|\.)onlinejobs\.ph$/i },
  { key: 'jobstreet', name: 'JobStreet', match: /(^|\.)jobstreet\.com(\.ph)?$/i }
];

const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
};

/** The extension-supported site a link is on, if any. */
export const extensionSiteForUrl = (url) => EXTENSION_SITES.find((s) => s.match.test(hostOf(/^https?:/i.test(url) ? url : `https://${url}`))) || null;

/** The extension-supported site an application belongs to, if any. */
export function extensionSiteFor(app) {
  if (!app || app.method !== 'site') return null;
  const host = hostOf(app.source_url) || hostOf(app.apply_url);
  return EXTENSION_SITES.find((s) => s.match.test(host)) || null;
}

/** What the extension needs to send one application. */
export function toExtensionJob(app, answers = {}) {
  return {
    id: app.id,
    site: extensionSiteFor(app)?.key,
    // Always start from the job page itself: OnlineJobs.ph's "apply" links point to its login page for guests.
    applyUrl: app.source_url,
    sourceUrl: app.source_url,
    subject: app.subject || `Application for ${app.title}`,
    message: app.body || '',
    title: app.title,
    company: app.company,
    answers // your saved answers to employer questions
  };
}

/**
 * Talks to the Huntr browser extension (if installed) through window messages.
 * onResult({ id, status, detail }) fires as each application progresses.
 */
export function useHuntrExtension(onResult) {
  const [ext, setExt] = useState({ installed: false, version: null, autoSubmit: false });
  const cb = useRef(onResult);
  cb.current = onResult;
  const pending = useRef(new Map()); // READ_PAGE requests waiting for the extension

  useEffect(() => {
    const onMessage = (e) => {
      if (e.source !== window || e.data?.source !== 'huntr-ext') return;
      if (e.data.type === 'READY') setExt({ installed: true, version: e.data.version, autoSubmit: !!e.data.autoSubmit });
      if (e.data.type === 'RESULT') cb.current?.(e.data);
      if (e.data.type === 'PAGE' && pending.current.has(e.data.reqId)) {
        pending.current.get(e.data.reqId)(e.data);
        pending.current.delete(e.data.reqId);
      }
    };
    window.addEventListener('message', onMessage);
    const ping = () => window.postMessage({ source: 'huntr-app', type: 'PING' }, window.location.origin);
    ping();
    // Keep asking for a while (Firefox can start the bridge late), and again whenever the tab regains focus.
    let tries = 0;
    const retry = setInterval(() => (++tries > 15 ? clearInterval(retry) : ping()), 1000);
    window.addEventListener('focus', ping);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', ping);
      clearInterval(retry);
    };
  }, []);

  const send = (apps, answers = {}) => window.postMessage({ source: 'huntr-app', type: 'APPLY', jobs: apps.map((a) => toExtensionJob(a, answers)) }, window.location.origin);
  /** Load a job page in your own browser (for sites that block Huntr's server). Resolves { ok, html, finalUrl, error }. */
  const readPage = (url) =>
    new Promise((resolve) => {
      const reqId = Math.random().toString(36).slice(2);
      pending.current.set(reqId, resolve);
      window.postMessage({ source: 'huntr-app', type: 'READ_PAGE', reqId, url }, window.location.origin);
      setTimeout(() => pending.current.has(reqId) && (pending.current.delete(reqId), resolve({ ok: false, error: 'The extension didn’t answer in time.' })), 60000);
    });

  /** Hand answers to employer questions (by question key) to the tab that asked. */
  const answer = (id, answers) => window.postMessage({ source: 'huntr-app', type: 'ANSWERS', id, answers }, window.location.origin);
  return { ...ext, send, answer, readPage };
}

/** Friendly label + dot colour for an extension status. */
export const EXT_STATUS = {
  queued: { text: 'Waiting to send', dot: 'var(--blue)' },
  opening: { text: 'Opening the job site…', dot: 'var(--blue)' },
  applying: { text: 'Opening the form…', dot: 'var(--blue)' },
  'needs-login': { text: 'Log in to the job site', dot: 'var(--amber)' },
  filled: { text: 'Filled — press Send', dot: 'var(--amber)' },
  submitting: { text: 'Sending…', dot: 'var(--blue)' },
  verifying: { text: 'Confirming…', dot: 'var(--blue)' },
  questions: { text: 'Employer questions — answer them', dot: 'var(--amber)' },
  submitted: { text: 'Sent', dot: 'var(--green)' },
  cancelled: { text: 'Skipped', dot: 'var(--faint)' },
  timeout: { text: 'Timed out', dot: '#8A2643' },
  unsupported: { text: 'Site not supported yet', dot: '#8A2643' },
  error: { text: 'Couldn’t send', dot: '#8A2643' }
};
