import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav.jsx';
import Logo from '../components/Logo.jsx';
import { useHuntrExtension } from '../lib/extension.js';
import { api } from '../lib/api.js';
import { signInWithGoogle } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

const ZIP = `${import.meta.env.BASE_URL}huntr-extension.zip`;
const VERSION = '0.1.0';
// Set this once the extension is on the Chrome Web Store — then setup becomes a single "Add to Chrome" click.
const STORE_URL = import.meta.env.VITE_EXTENSION_STORE_URL || '';
// Firefox: put the Mozilla-signed file at client/public/huntr.xpi and Setup offers a one-click "Add to Firefox".
const XPI = `${import.meta.env.BASE_URL}huntr.xpi`;
const IS_FIREFOX = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

/** True when the signed Firefox file is actually being served (not the app's fallback page). */
function useXpiAvailable() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!IS_FIREFOX) return;
    fetch(XPI, { method: 'HEAD' })
      .then((r) => setOk(r.ok && !/text\/html/i.test(r.headers.get('content-type') || '')))
      .catch(() => setOk(false));
  }, []);
  return ok;
}

function CopyChip({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chip mono"
      style={{ cursor: 'pointer' }}
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      aria-label={`Copy ${text}`}
    >
      {done ? 'Copied ✓' : text}
    </button>
  );
}

/** One button that always does the next missing setup step. */
function Setup({ ext, xpi }) {
  const { session } = useAuth();
  const [gmail, setGmail] = useState(null);
  const [profileDone, setProfileDone] = useState(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (!session) return;
    api('/gmail/status').then(setGmail).catch(() => setGmail({ configured: false, connected: false }));
    api('/profile').then(({ profile }) => setProfileDone(Boolean(profile?.full_name && (profile?.skills || []).length))).catch(() => setProfileDone(false));
  }, [session]);

  const steps = [
    { key: 'ext', label: 'Huntr extension', done: ext.installed, hint: ext.installed ? `Installed${ext.version ? ` · v${ext.version}` : ''}` : 'Sends your OnlineJobs.ph applications' },
    { key: 'oj', label: 'OnlineJobs.ph login', done: null, hint: 'Stay logged in to OnlineJobs.ph in this browser' },
    { key: 'gmail', label: 'Gmail', done: gmail?.connected ?? false, hint: gmail?.configured === false ? 'Not set up on the server yet' : gmail?.connected ? 'Connected' : 'Sends jobs that ask for an email' },
    { key: 'profile', label: 'Your details', done: profileDone ?? false, hint: profileDone ? 'Name and skills saved' : 'Name, skills and resume for your drafts' }
  ];
  const next = !ext.installed ? 'ext' : !session ? 'login' : !profileDone ? 'profile' : gmail && !gmail.connected && gmail.configured !== false ? 'gmail' : null;

  function go() {
    if (next === 'ext') {
      if (IS_FIREFOX && xpi) window.location.href = XPI; // Firefox shows its own "Add Huntr?" prompt
      else if (IS_FIREFOX) {
        const a = document.createElement('a');
        a.href = ZIP;
        a.download = 'huntr-extension.zip';
        a.click();
        setShowSteps(true);
      } else if (STORE_URL) window.open(STORE_URL, '_blank', 'noopener');
      else {
        const a = document.createElement('a');
        a.href = ZIP;
        a.download = 'huntr-extension.zip';
        a.click();
        setShowSteps(true);
      }
    } else if (next === 'login') window.location.hash = '#/auth';
    else if (next === 'profile') window.location.hash = '#/profile';
    else if (next === 'gmail') signInWithGoogle('/extension');
  }

  const label = { ext: IS_FIREFOX ? (xpi ? 'Add to Firefox' : 'Set up the extension') : STORE_URL ? 'Add Huntr to Chrome' : 'Set up the extension', login: 'Log in to Huntr', profile: 'Fill in your details', gmail: 'Connect Gmail' }[next];

  return (
    <section className="card setup" aria-labelledby="setup-title">
      <div className="setup__top">
        <div>
          <div className="eyebrow">Setup</div>
          <h2 id="setup-title">{next ? 'Get Huntr sending for you' : 'You’re all set'}</h2>
          <p className="muted">{next ? 'One button — it always takes you to the next thing that’s missing.' : 'Paste job links on Apply and press Send all.'}</p>
        </div>
        {next ? (
          <button type="button" className="btn btn--primary setup__btn" onClick={go}>{label}</button>
        ) : (
          <Link to="/apply" className="btn btn--primary setup__btn">Go to Apply</Link>
        )}
      </div>
      <ol className="setup__list">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? 'is-done' : s.key === next ? 'is-next' : ''}>
            <span className="setup__mark" aria-hidden="true">{s.done ? '✓' : s.done === null ? '•' : ''}</span>
            <span><strong>{s.label}</strong><span className="muted"> — {s.hint}</span></span>
            {s.key === 'oj' && <a className="link" href="https://www.onlinejobs.ph/login" target="_blank" rel="noreferrer" style={{ marginLeft: 'auto' }}>Open OnlineJobs.ph ↗</a>}
          </li>
        ))}
      </ol>
      {showSteps && !ext.installed && (
        <div className="note" style={{ margin: '0 18px 18px' }}>
          <strong>Downloaded.</strong> {IS_FIREFOX ? 'Until the signed Firefox version is uploaded, load it with the steps below' : 'Chrome only allows one-click installs from the Chrome Web Store, so finish with the 4 quick steps below'} — this box turns green by itself once it's installed.
        </div>
      )}
    </section>
  );
}

export default function Extension() {
  const ext = useHuntrExtension();
  const xpi = useXpiAvailable();
  // Re-check every few seconds so "Installed ✓" appears without a manual reload.
  useEffect(() => {
    if (ext.installed) return undefined;
    const t = setInterval(() => window.postMessage({ source: 'huntr-app', type: 'PING' }, window.location.origin), 3000);
    return () => clearInterval(t);
  }, [ext.installed]);

  return (
    <>
      <header className="page-header">
        <div className="container"><Nav tone="light" /></div>
      </header>
      <main className="container main" style={{ paddingTop: 48, maxWidth: 900 }}>
        <section className="ext-hero">
          <span className="ext-hero__badge" aria-hidden="true"><Logo size={44} color="#fff" /></span>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="eyebrow">Browser extension</div>
            <h1 style={{ margin: '10px 0 8px', fontSize: 38, fontWeight: 600, letterSpacing: '-0.035em' }}>{IS_FIREFOX ? 'Huntr for Firefox' : 'Huntr browser extension'}</h1>
            <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
              Lets Huntr send your applications on job sites that only accept them from a logged-in member — straight from your own browser, so Huntr never needs your passwords.
            </p>
          </div>
          <div className="ext-hero__cta">
            {ext.installed ? (
              <span className="btn btn--ok" role="status">✓ Installed{ext.version ? ` · v${ext.version}` : ''}</span>
            ) : IS_FIREFOX && xpi ? (
              <a className="btn btn--primary" href={XPI}>Add to Firefox</a>
            ) : (
              <a className="btn btn--primary" href={ZIP} download>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
                Download extension
              </a>
            )}
            <span className="muted" style={{ fontSize: 12 }}>v{VERSION} · Chrome, Edge, Brave, Firefox</span>
          </div>
        </section>

        <Setup ext={ext} xpi={xpi} />

        <div className="grid-2">
          <div className="panel">
            <h2 className="label-caps">Works on</h2>
            <ul className="ext-sites">
              <li><img src="https://www.google.com/s2/favicons?domain=onlinejobs.ph&sz=64" alt="" width="18" height="18" /> OnlineJobs.ph <span className="tag tag--email">READY</span></li>
              <li><img src="https://www.google.com/s2/favicons?domain=indeed.com&sz=64" alt="" width="18" height="18" /> Indeed <span className="tag tag--site">SOON</span></li>
              <li><img src="https://www.google.com/s2/favicons?domain=jobstreet.com&sz=64" alt="" width="18" height="18" /> JobStreet <span className="tag tag--site">SOON</span></li>
            </ul>
          </div>
          <div className="panel">
            <h2 className="label-caps">What it does</h2>
            <ol className="steps">
              <li><span className="check">1</span><span>You press <strong>Send</strong> in Huntr.</span></li>
              <li><span className="check">2</span><span>It opens the job in your browser and clicks Apply.</span></li>
              <li><span className="check">3</span><span>It fills in your drafted message and sends it in a background tab, so you stay on Huntr.</span></li>
              <li><span className="check">4</span><span>Huntr marks it as sent in your tracker.</span></li>
            </ol>
          </div>
        </div>

        <section className="card">
          <div className="card__head" id="install-steps"><h2>{IS_FIREFOX ? (xpi ? 'Or load it by hand' : 'Install in Firefox') : STORE_URL ? 'Installing without the Chrome Web Store' : 'Install in about a minute'}</h2>{ext.installed && <span className="status"><span className="dot dot--green" />Detected on this page</span>}</div>
{IS_FIREFOX ? (
          <ol className="install-steps">
            <li>
              <strong>Download and unzip</strong>
              <span><a href={ZIP} download className="link">huntr-extension.zip</a> — then extract it.</span>
            </li>
            <li>
              <strong>Open Firefox's debugging page</strong>
              <span>Paste this into the address bar: <CopyChip text="about:debugging#/runtime/this-firefox" /></span>
            </li>
            <li>
              <strong>Load it</strong>
              <span>Click <em>Load Temporary Add-on…</em> and pick <span className="mono">manifest.json</span> inside the unzipped folder.</span>
            </li>
            <li>
              <strong>That's it — for now</strong>
              <span>Temporary add-ons are removed when Firefox restarts. Once the free Mozilla-signed version is uploaded, this becomes a single “Add to Firefox” click that stays installed.</span>
            </li>
          </ol>
          ) : (
          <ol className="install-steps">
            <li>
              <strong>Download and unzip</strong>
              <span><a href={ZIP} download className="link">huntr-extension.zip</a> — right-click it → <em>Extract All…</em>. Keep the folder somewhere permanent (e.g. Documents), not in Downloads.</span>
            </li>
            <li>
              <strong>Open the extensions page</strong>
              <span>Paste this into Chrome's address bar: <CopyChip text="chrome://extensions" /> (Edge: <CopyChip text="edge://extensions" />)</span>
            </li>
            <li>
              <strong>Turn on Developer mode</strong>
              <span>The switch is in the top-right corner of that page.</span>
            </li>
            <li>
              <strong>Load it</strong>
              <span>Click <em>Load unpacked</em> and choose the unzipped <span className="mono">huntr-extension</span> folder.</span>
            </li>
            <li>
              <strong>Pin it and come back</strong>
              <span>Click the puzzle-piece icon → pin <em>Huntr</em>. Then reload this page — the button above turns into “✓ Installed”.</span>
            </li>
          </ol>
          )}
          <div className="card__foot" style={{ fontSize: 13 }}>
            <span className="muted">{IS_FIREFOX ? 'Firefox may ask you to allow this site to install add-ons — choose Allow, then Add.' : 'Chrome shows a “Developer mode extensions” notice because it isn’t on the Chrome Web Store yet. That’s expected.'}</span>
            <span className="spacer" />
            <Link to="/apply" className="btn btn--ghost">Back to Apply</Link>
          </div>
        </section>

        <section className="panel">
          <h2 className="label-caps">Good to know</h2>
          <ul className="ext-notes">
            <li>It only runs on OnlineJobs.ph and on Huntr itself. It can't see other sites you visit.</li>
            <li>You stay logged in to OnlineJobs.ph yourself; Huntr never sees your password.</li>
            <li><strong>Send in the background</strong> is on by default: Huntr presses Send for you and closes each tab when it's sent. Turn it off in the extension's popup to review each one first. Job sites discourage automated applying and may restrict accounts that send many quickly, so Huntr sends one at a time with pauses — keep batches small.</li>
            <li>If a form has a captcha or a question only you can answer, Huntr fills what it can and waits for you.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
