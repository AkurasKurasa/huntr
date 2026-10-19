import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav.jsx';
import Logo from '../components/Logo.jsx';
import JobSnapshot from '../components/JobSnapshot.jsx';
import AuthPrompt from '../components/AuthPrompt.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { signInWithGoogle } from '../lib/supabase.js';

const PENDING_KEY = 'huntr:pendingLinks';
const TONES = [['formal', 'Formal'], ['friendly', 'Friendly'], ['concise', 'Concise']];

const hostOf = (u) => {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const initialOf = (s) => (s || '?').replace(/^(jobs|careers|apply)\./, '').charAt(0).toUpperCase();

function statusOf(app) {
  if (app.status !== 'draft') return { text: app.method === 'email' ? 'Sent from Gmail' : 'Submitted', dot: 'var(--green)' };
  if (app.method === 'email') return { text: 'Draft ready', dot: 'var(--blue)' };
  return app.needs?.includes('screening') ? { text: 'Needs your answers', dot: 'var(--amber)' } : { text: 'Needs you on site', dot: 'var(--amber)' };
}

function stepsFor(app) {
  const host = hostOf(app.source_url);
  if (app.method === 'email') {
    return [
      `Opened ${host} and read the job post`,
      `Found email instructions — send to ${app.apply_email}`,
      'Drafted your email in the tone you picked',
      'Will attach the resume from your profile, if you uploaded one'
    ];
  }
  return [
    `Opened ${host} and read the job post`,
    `Found the application page at ${hostOf(app.apply_url || app.source_url)}`,
    'No email instructions to follow — this one is applied on site',
    `Prepared your ${(app.needs || []).join(', ')}`
  ];
}

const Check = () => (
  <span className="check">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
  </span>
);

export default function Apply() {
  const { session, loading: authLoading } = useAuth();
  const authRef = useRef(null);
  const [authReason, setAuthReason] = useState('');
  const [links, setLinks] = useState(['']);
  const [items, setItems] = useState([]);
  const [failures, setFailures] = useState([]);
  const [selId, setSelId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [gmail, setGmail] = useState({ configured: true, connected: undefined });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [checks, setChecks] = useState({});

  // Signed-in only: load saved drafts + Gmail status. Guests just see the empty page.
  useEffect(() => {
    if (!session) {
      setItems([]);
      return;
    }
    api('/applications?scope=drafts')
      .then(({ applications }) => {
        setItems(applications);
        if (applications[0]) setSelId(applications[0].id);
      })
      .catch((e) => setError(e.message));
    api('/gmail/status').then(setGmail).catch(() => setGmail({ configured: false, connected: false }));
  }, [session]);

  // Links a guest typed before signing in: put them back and analyze them right away.
  const resumed = useRef(false);
  useEffect(() => {
    if (!session || resumed.current) return;
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
    if (Array.isArray(pending) && pending.length) {
      resumed.current = true;
      setLinks(pending);
      analyze(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /** Returns true when signed in; otherwise opens the sign-in prompt. */
  function requireAccount(reason) {
    if (session) return true;
    setAuthReason(reason);
    try {
      const keep = links.map((l) => l.trim()).filter(Boolean);
      if (keep.length) sessionStorage.setItem(PENDING_KEY, JSON.stringify(keep));
    } catch {
      /* ignore */
    }
    authRef.current?.showModal();
    return false;
  }

  const filled = links.map((l) => l.trim()).filter(Boolean);
  const sel = items.find((a) => a.id === selId) || items[0];
  const emailDrafts = items.filter((a) => a.method === 'email' && a.status === 'draft');
  const siteDrafts = items.filter((a) => a.method === 'site' && a.status === 'draft');
  const counts = useMemo(() => ({ email: items.filter((a) => a.method === 'email').length, site: items.filter((a) => a.method === 'site').length }), [items]);

  const replace = (app) => setItems((list) => list.map((a) => (a.id === app.id ? app : a)));
  const patchLocal = (id, patch) => setItems((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  async function analyze(list = filled) {
    if (!list.length) return;
    if (!requireAccount(`Sign in to analyze ${list.length === 1 ? 'this job' : `these ${list.length} jobs`}.`)) return;
    setAnalyzing(true);
    setError('');
    setFailures([]);
    try {
      const { results } = await api('/jobs/analyze', { method: 'POST', body: { links: list, tone: sel?.tone || 'formal' } });
      const ok = results.filter((r) => r.ok).map((r) => r.application);
      setFailures(results.filter((r) => !r.ok));
      setItems((list) => [...ok, ...list]);
      if (ok[0]) setSelId(ok[0].id);
      setLinks(results.filter((r) => !r.ok).map((r) => r.link).concat(['']).slice(0, Math.max(1, results.filter((r) => !r.ok).length + 1)));
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function save(id, field, value) {
    try {
      replace((await api(`/applications/${id}`, { method: 'PATCH', body: { [field]: value } })).application);
    } catch (e) {
      setError(e.message);
    }
  }

  async function redraft(tone) {
    if (!sel) return;
    try {
      replace((await api(`/applications/${sel.id}/redraft`, { method: 'POST', body: { tone } })).application);
    } catch (e) {
      setError(e.message);
    }
  }

  async function send(ids) {
    setSending(true);
    setError('');
    try {
      const { results } = await api('/applications/send', { method: 'POST', body: { ids } });
      results.filter((r) => r.application).forEach((r) => replace(r.application));
      const failed = results.filter((r) => !r.ok && !r.needsUser);
      if (failed.length) setError(failed.map((f) => f.error).join(' · '));
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  async function markSubmitted(id) {
    try {
      replace((await api(`/applications/${id}/submitted`, { method: 'POST' })).application);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(id) {
    try {
      await api(`/applications/${id}`, { method: 'DELETE' });
      setItems((list) => list.filter((a) => a.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  function copy() {
    if (!sel) return;
    const txt = sel.method === 'email' ? `Subject: ${sel.subject}\n\n${sel.body}` : sel.body;
    navigator.clipboard?.writeText(txt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const checklist = sel?.method === 'site'
    ? ['Resume uploaded', 'Cover letter filled in']
        .concat(sel.needs?.includes('screening') ? ['Screening questions answered'] : [])
        .concat(sel.needs?.includes('portfolio') ? ['Portfolio link added'] : [])
    : [];

  return (
    <>
      <header className="hero">
        <span className="hero__shape hero__sun" />
        <span className="hero__shape hero__ring" />
        <span className="hero__shape hero__chip" />
        <span className="hero__shape hero__moon" />
        <div className="container">
          <Nav tone="dark" gmailConnected={gmail.connected} />
          <div className="hero__body">
            <div style={{ flex: '1 1 560px', minWidth: 0 }}>
              <div className="hero__eyebrow">Batch apply</div>
              <h1 className="wordmark">
                <Logo color="#fff" />
                <span>Huntr<span className="wordmark__dot">.</span></span>
              </h1>
              <p className="hero__lede">Huntr reads every job post, works out whether it wants an email or a form, writes what it asks for, and sends it from your Gmail.</p>
            </div>
            <dl className="stats-card">
              <div><dt>Jobs</dt><dd>{items.length}</dd></div>
              <div><dt>By email</dt><dd style={{ color: 'var(--blue)' }}>{counts.email}</dd></div>
              <div><dt>On sites</dt><dd style={{ color: '#c2410c' }}>{counts.site}</dd></div>
            </dl>
          </div>
        </div>
      </header>

      <main className="container main">
        {/* Link composer */}
        <section className="card">
          <div className="card__head">
            <h2>Job links</h2>
            <span className="mono muted" style={{ fontSize: 12 }}>{filled.length} {filled.length === 1 ? 'LINK' : 'LINKS'}</span>
          </div>
          <div className="links">
            {links.map((value, i) => (
              <div className="link-row" key={i}>
                <span className="link-row__num">{String(i + 1).padStart(2, '0')}</span>
                <label className="link-row__field">
                  <span className="tile" aria-hidden="true">{value.trim() ? initialOf(hostOf(value)) : '·'}</span>
                  <span className="sr-only">Job link {i + 1}</span>
                  <input
                    type="url"
                    value={value}
                    placeholder="https://company.com/careers/role"
                    onChange={(e) => setLinks(links.map((l, j) => (j === i ? e.target.value : l)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setLinks([...links, '']);
                      }
                    }}
                    onPaste={(e) => {
                      // Pasting several links at once splits them into separate boxes.
                      const parts = e.clipboardData.getData('text').split(/\s+/).filter(Boolean);
                      if (parts.length > 1) {
                        e.preventDefault();
                        const next = [...links];
                        next.splice(i, 1, ...parts);
                        setLinks(next);
                      }
                    }}
                  />
                  <button type="button" className="icon-btn" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks(links.length > 1 ? links.filter((_, j) => j !== i) : [''])}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </label>
              </div>
            ))}
          </div>
          <div className="links__actions">
            <button type="button" className="btn btn--dashed" onClick={() => setLinks([...links, ''])}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Add another link
            </button>
            <button type="button" className="btn btn--primary" disabled={(!filled.length && !!session) || analyzing} onClick={() => analyze()}>
              {analyzing ? 'Analyzing…' : filled.length > 1 ? `Analyze ${filled.length} jobs` : 'Analyze job'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
          {analyzing && <div className="progress" aria-label="Analyzing"><div /></div>}
        </section>

        {error && <div className="alert" role="alert">{error}</div>}
        {failures.length > 0 && (
          <div className="alert" role="status">
            Couldn't read {failures.length === 1 ? 'one link' : `${failures.length} links`} — they're back in the boxes above:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {failures.map((f) => <li key={f.link}><span className="mono">{hostOf(f.link)}</span>: {f.error}</li>)}
            </ul>
          </div>
        )}

        {items.length === 0 && !analyzing && !authLoading && (
          session ? (
            <div className="empty">
              <strong>No drafts yet</strong>
              Add job links above and press Analyze. Sent applications move to your <Link to="/tracker" style={{ color: 'var(--violet)' }}>tracker</Link>.
            </div>
          ) : (
            <div className="guest-tour">
              <div className="guest-tour__step"><span>01</span><strong>Paste job links</strong>As many as you like, one per box.</div>
              <div className="guest-tour__step"><span>02</span><strong>Huntr reads each post</strong>It finds out whether to email or fill a form, and saves a snapshot.</div>
              <div className="guest-tour__step"><span>03</span><strong>Review and send</strong>Emails go out from your Gmail; everything lands in your tracker.</div>
              <button type="button" className="btn btn--primary" onClick={() => requireAccount('Create a free account to start applying.')}>Get started — it's free</button>
            </div>
          )
        )}

        {items.length > 0 && (
          <>
            <div className="strip">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>
              {gmail.connected ? (
                <>
                  <span className="strip__text">
                    {emailDrafts.length
                      ? `Ready: Huntr will send ${emailDrafts.length} email${emailDrafts.length === 1 ? '' : 's'} from your Gmail.`
                      : 'All email applications are sent.'}
                    {siteDrafts.length ? ` ${siteDrafts.length} job${siteDrafts.length === 1 ? '' : 's'} must be applied on the company site — open each one below.` : ''}
                  </span>
                  <button type="button" className="btn btn--primary" disabled={!emailDrafts.length || sending} onClick={() => send(emailDrafts.map((a) => a.id))}>
                    {sending ? 'Sending…' : `Send all ${emailDrafts.length}`}
                  </button>
                </>
              ) : (
                <>
                  <span className="strip__text">
                    {gmail.configured === false
                      ? 'Gmail sending is not set up on the server yet (see README → Google OAuth).'
                      : 'Connect Gmail so Huntr can send these for you.'}
                  </span>
                  {gmail.configured !== false && (
                    <button type="button" className="btn btn--primary" onClick={() => signInWithGoogle('/apply')}>Connect Gmail</button>
                  )}
                </>
              )}
            </div>

            <div className="results">
              <section className="job-list" aria-label="Analyzed jobs">
                <div className="job-list__head"><span>Jobs</span><span>{counts.email} email · {counts.site} site</span></div>
                {items.map((a) => {
                  const st = statusOf(a);
                  return (
                    <button type="button" key={a.id} className={`job-row ${sel?.id === a.id ? 'is-active' : ''}`} onClick={() => setSelId(a.id)}>
                      <span className="tile tile--md" aria-hidden="true">{initialOf(a.company)}</span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="job-row__title">{a.title}</span>
                        <span className="job-row__meta">{a.company}</span>
                        <span className="job-row__tags">
                          <span className={`tag tag--${a.method}`}>{a.method === 'email' ? 'EMAIL' : 'SITE FORM'}</span>
                          <span className="status"><span className="dot" style={{ background: st.dot }} />{st.text}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>

              {sel && (
                <section className="detail">
                  <div className="detail__head">
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
                      <span className="tile tile--lg" aria-hidden="true">{initialOf(sel.company)}</span>
                      <div style={{ minWidth: 0 }}>
                        <h2>{sel.title}</h2>
                        <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>{[sel.company, sel.location].filter(Boolean).join(' · ')}</div>
                        <a className="detail__source" href={sel.source_url} target="_blank" rel="noreferrer">{sel.source_url}</a>
                      </div>
                    </div>
                    <span className={`badge tag--${sel.method}`}>{sel.method === 'email' ? 'Apply by email' : 'Apply on company site'}</span>
                  </div>

                  {sel.skills?.length > 0 && (
                    <div className="chips">{sel.skills.map((s) => <span className="chip" key={s}>{s}</span>)}</div>
                  )}

                  <div className="grid-2">
                    <div className="panel">
                      <h3 className="label-caps">What Huntr did</h3>
                      <ol className="steps">{stepsFor(sel).map((s) => <li key={s}><Check /><span>{s}</span></li>)}</ol>
                    </div>
                    <div className="panel">
                      <h3 className="label-caps">On the page</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(sel.instructions?.length ? sel.instructions : ['No explicit apply instructions found.']).map((ins) => (
                          <blockquote className="quote" key={ins}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--violet)" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 3 }}><path d="M4 11c0-4 2-6 6-7v3c-2 .6-3 2-3 4h3v7H4zM14 11c0-4 2-6 6-7v3c-2 .6-3 2-3 4h3v7h-6z" /></svg>
                            <span>{ins}</span>
                          </blockquote>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card__head">
                      <h3>Job post snapshot</h3>
                      <a className="btn btn--text" href={sel.source_url} target="_blank" rel="noreferrer">Open live post ↗</a>
                    </div>
                    <div style={{ padding: 18 }}><JobSnapshot app={sel} /></div>
                  </div>

                  {sel.method === 'email' ? (
                    <div className="card">
                      <div className="card__head">
                        <h3>Email draft</h3>
                        <div className="segmented" role="group" aria-label="Tone">
                          {TONES.map(([v, l]) => <button type="button" key={v} aria-pressed={sel.tone === v} onClick={() => redraft(v)}>{l}</button>)}
                        </div>
                      </div>
                      <div className="mail-fields">
                        <label htmlFor="to">To</label>
                        <input id="to" className="mono" style={{ fontSize: 13 }} value={sel.apply_email || ''} readOnly />
                        <label htmlFor="subj">Subject</label>
                        <input id="subj" style={{ fontWeight: 500 }} value={sel.subject || ''} onChange={(e) => patchLocal(sel.id, { subject: e.target.value })} onBlur={(e) => save(sel.id, 'subject', e.target.value)} />
                      </div>
                      <label htmlFor="body" className="sr-only">Email body</label>
                      <textarea id="body" className="editor" value={sel.body || ''} onChange={(e) => patchLocal(sel.id, { body: e.target.value })} onBlur={(e) => save(sel.id, 'body', e.target.value)} />
                      <div className="card__foot">
                        <span className="chip">📎 Resume from your profile</span>
                        <span className="spacer" />
                        <button type="button" className="btn btn--text" onClick={() => remove(sel.id)}>Delete</button>
                        <button type="button" className="btn btn--ghost" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
                        {sel.status === 'draft' ? (
                          <button type="button" className="btn btn--primary" disabled={sending || !gmail.connected} onClick={() => send([sel.id])}>Send from Gmail</button>
                        ) : (
                          <span className="btn btn--ok">✓ Sent</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="card__head">
                        <div style={{ minWidth: 0 }}>
                          <h3>Application form</h3>
                          <div className="mono muted" style={{ fontSize: 12, marginTop: 4, wordBreak: 'break-all' }}>{sel.apply_url || sel.source_url}</div>
                        </div>
                        <a className="btn btn--ghost" href={sel.apply_url || sel.source_url} target="_blank" rel="noreferrer">Open form ↗</a>
                      </div>
                      <div className="checklist">
                        {checklist.map((label) => {
                          const k = `${sel.id}:${label}`;
                          const on = !!checks[k] || sel.status !== 'draft';
                          return (
                            <label key={label} className={on ? 'done' : ''}>
                              <input type="checkbox" checked={on} onChange={() => setChecks({ ...checks, [k]: !checks[k] })} />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                      <div className="card__head" style={{ borderBottom: 0, paddingBottom: 0 }}>
                        <label htmlFor="cover" style={{ fontWeight: 600, fontSize: 15 }}>Cover letter</label>
                        <div className="segmented" role="group" aria-label="Tone">
                          {TONES.map(([v, l]) => <button type="button" key={v} aria-pressed={sel.tone === v} onClick={() => redraft(v)}>{l}</button>)}
                        </div>
                      </div>
                      <textarea id="cover" className="editor" style={{ minHeight: 260 }} value={sel.body || ''} onChange={(e) => patchLocal(sel.id, { body: e.target.value })} onBlur={(e) => save(sel.id, 'body', e.target.value)} />
                      {sel.needs?.includes('screening') && (
                        <div className="note"><strong>Screening questions.</strong> They only show on the form — answer them there before submitting.</div>
                      )}
                      <div className="card__foot">
                        <span className="spacer" />
                        <button type="button" className="btn btn--text" onClick={() => remove(sel.id)}>Delete</button>
                        <button type="button" className="btn btn--ghost" onClick={copy}>{copied ? 'Copied' : 'Copy cover letter'}</button>
                        {sel.status === 'draft' ? (
                          <button type="button" className="btn btn--primary" onClick={() => markSubmitted(sel.id)}>Mark as submitted</button>
                        ) : (
                          <span className="btn btn--ok">✓ Submitted</span>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </main>
      <AuthPrompt ref={authRef} reason={authReason} returnTo="/apply" />
    </>
  );
}
