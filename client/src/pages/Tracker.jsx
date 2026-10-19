import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Nav from '../components/Nav.jsx';
import Sankey from '../components/Sankey.jsx';
import JobSnapshot from '../components/JobSnapshot.jsx';
import { api } from '../lib/api.js';
import { buildSankey, toSankeyMatic, STAGE_LABELS, STATUS_LABELS } from '../lib/sankey.js';

const STATUS_DOT = { waiting: '#E0A21B', in_progress: '#2F5FCC', offer: '#1FA971', rejected: '#9C96B8', ghosted: '#CFC8EE', declined: '#9C96B8' };
const FILTERS = ['all', 'waiting', 'in_progress', 'offer', 'rejected', 'ghosted', 'declined'];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');

export default function Tracker() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('table');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (viewing) dialogRef.current?.showModal();
  }, [viewing]);

  useEffect(() => {
    api('/applications?scope=tracked')
      .then(({ applications }) => setApps(applications))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function update(id, patch) {
    setApps((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      const { application } = await api(`/applications/${id}`, { method: 'PATCH', body: patch });
      setApps((list) => list.map((a) => (a.id === id ? application : a)));
    } catch (e) {
      setError(e.message);
    }
  }

  const stats = useMemo(() => {
    const n = apps.length;
    const replied = apps.filter((a) => a.stage !== 'applied').length;
    const pct = (x) => (n ? `${Math.round((x / n) * 100)}%` : '—');
    return [
      { label: 'Applications', value: n },
      { label: 'Reply rate', value: pct(replied), color: '#c2410c' },
      { label: 'Interviews', value: apps.filter((a) => a.stage === 'screen' || a.stage === 'interview').length, color: 'var(--blue)' },
      { label: 'Offers', value: apps.filter((a) => a.status === 'offer').length, color: 'var(--green-ink)' },
      { label: 'Ghosted', value: apps.filter((a) => a.status === 'ghosted').length, color: 'var(--muted)' }
    ];
  }, [apps]);

  const rows = apps.filter((a) => filter === 'all' || a.status === filter);

  function copySankey() {
    navigator.clipboard?.writeText(toSankeyMatic(buildSankey(apps))).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <header className="page-header">
        <div className="container"><Nav tone="light" /></div>
      </header>
      <main className="container main" style={{ paddingTop: 48 }}>
        <div className="page-title">
          <div>
            <div className="eyebrow">Job history</div>
            <h1>The hunt so far</h1>
          </div>
          <Link to="/apply" className="btn btn--primary">+ Apply to more jobs</Link>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}

        <dl className="stat-row">
          {stats.map((s) => (
            <div key={s.label}><dt>{s.label}</dt><dd style={{ color: s.color }}>{s.value}</dd></div>
          ))}
        </dl>

        <section className="card">
          <div className="card__head">
            <div className="segmented" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === 'table'} onClick={() => setView('table')}>Table</button>
              <button type="button" role="tab" aria-selected={view === 'sankey'} onClick={() => setView('sankey')}>Sankey view</button>
            </div>
            {view === 'table' ? (
              <div className="filters" role="group" aria-label="Filter by status">
                {FILTERS.map((f) => (
                  <button type="button" key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === 'all' ? 'All' : STATUS_LABELS[f]} <span style={{ opacity: 0.6 }}>{f === 'all' ? apps.length : apps.filter((a) => a.status === f).length}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={copySankey} disabled={!apps.length}>{copied ? 'Copied' : 'Copy for SankeyMATIC'}</button>
            )}
          </div>

          {loading ? (
            <p className="muted" style={{ padding: 24 }}>Loading…</p>
          ) : apps.length === 0 ? (
            <div className="empty" style={{ margin: 24 }}>
              <strong>Nothing tracked yet</strong>
              Applications show up here once Huntr sends them or you mark them as submitted.
            </div>
          ) : view === 'sankey' ? (
            <Sankey applications={apps} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">Role</th>
                    <th scope="col">Via</th>
                    <th scope="col">Sent</th>
                    <th scope="col">Furthest stage</th>
                    <th scope="col">Status</th>
                    <th scope="col">Notes</th>
                    <th scope="col"><span className="sr-only">Post</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <a className="company-cell" href={a.source_url} target="_blank" rel="noreferrer">
                          <span className="tile" aria-hidden="true">{(a.company || '?').charAt(0).toUpperCase()}</span>
                          {a.company}
                        </a>
                      </td>
                      <td>{a.title}</td>
                      <td><span className={`tag tag--${a.method}`}>{a.method === 'email' ? 'EMAIL' : 'SITE FORM'}</span></td>
                      <td className="mono muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(a.sent_at || a.created_at)}</td>
                      <td>
                        <select aria-label={`Stage for ${a.company}`} value={a.stage} onChange={(e) => update(a.id, { stage: e.target.value })}>
                          {Object.entries(STAGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className="dot" style={{ background: STATUS_DOT[a.status] }} />
                          <select aria-label={`Status for ${a.company}`} value={a.status} onChange={(e) => update(a.id, { status: e.target.value })}>
                            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </span>
                      </td>
                      <td>
                        <input
                          aria-label={`Notes for ${a.company}`}
                          defaultValue={a.note || ''}
                          placeholder="Add a note"
                          onBlur={(e) => e.target.value !== (a.note || '') && update(a.id, { note: e.target.value })}
                          style={{ border: 0, background: 'transparent', width: '100%', minWidth: 160, fontSize: 14, color: 'var(--ink-2)' }}
                        />
                      </td>
                      <td>
                        <button type="button" className="btn btn--ghost" style={{ minHeight: 34, padding: '0 10px', fontSize: 13 }} onClick={() => setViewing(a)}>
                          View post
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <dialog ref={dialogRef} className="modal" onClose={() => setViewing(null)} aria-labelledby="snap-title">
        {viewing && (
          <>
            <div className="card__head">
              <div style={{ minWidth: 0 }}>
                <h3 id="snap-title">{viewing.title}</h3>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{[viewing.company, viewing.location].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="btn btn--ghost" href={viewing.source_url} target="_blank" rel="noreferrer">Live post ↗</a>
                <button type="button" className="btn btn--primary" onClick={() => dialogRef.current?.close()}>Close</button>
              </div>
            </div>
            <div style={{ padding: 18, overflowY: 'auto' }}><JobSnapshot app={viewing} /></div>
          </>
        )}
      </dialog>
    </>
  );
}
