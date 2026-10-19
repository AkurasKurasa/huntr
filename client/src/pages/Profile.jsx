import { useEffect, useState } from 'react';
import Nav from '../components/Nav.jsx';
import { api } from '../lib/api.js';
import { supabase, signInWithGoogle } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Profile() {
  const { user } = useAuth();
  const [form, setForm] = useState({ full_name: '', school: '', degree: '', skills: '', portfolio_url: '', resume_path: '' });
  const [gmail, setGmail] = useState({ configured: true, connected: false });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('/profile')
      .then(({ profile }) => setForm({
        full_name: profile.full_name || '',
        school: profile.school || '',
        degree: profile.degree || '',
        skills: (profile.skills || []).join(', '),
        portfolio_url: profile.portfolio_url || '',
        resume_path: profile.resume_path || ''
      }))
      .catch((e) => setError(e.message));
    api('/gmail/status').then(setGmail).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e?.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      await api('/profile', { method: 'PUT', body: form });
      setMsg('Saved. New drafts will use these details.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadResume(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Keep the resume under 5 MB');
    setError('');
    const safe = file.name.replace(/[^\w.-]+/g, '_');
    const path = `${user.id}/${safe}`;
    const { error: upErr } = await supabase.storage.from('resumes').upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return setError(upErr.message);
    const next = { ...form, resume_path: path };
    setForm(next);
    await api('/profile', { method: 'PUT', body: next });
    setMsg('Resume uploaded. Huntr will attach it to every email.');
  }

  async function disconnect() {
    await api('/gmail', { method: 'DELETE' });
    setGmail({ ...gmail, connected: false });
  }

  return (
    <>
      <header className="page-header">
        <div className="container"><Nav tone="light" gmailConnected={gmail.connected} /></div>
      </header>
      <main className="container main" style={{ paddingTop: 48, maxWidth: 820 }}>
        <div>
          <div className="eyebrow">Profile</div>
          <h1 style={{ margin: '12px 0 0', fontSize: 40, fontWeight: 600, letterSpacing: '-0.04em' }}>Your details</h1>
          <p className="muted" style={{ fontSize: 16 }}>Huntr fills these into every email and cover letter. Anything you leave blank stays as a [placeholder] you can edit.</p>
        </div>

        {error && <div className="alert" role="alert">{error}</div>}
        {msg && <div className="strip"><span className="strip__text">{msg}</span></div>}

        <form className="card" onSubmit={save}>
          <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <label className="field">Full name<input value={form.full_name} onChange={set('full_name')} autoComplete="name" /></label>
            <label className="field">School<input value={form.school} onChange={set('school')} placeholder="Angeles University Foundation" /></label>
            <label className="field">Year and degree<input value={form.degree} onChange={set('degree')} placeholder="4th-year BS Computer Science student" /></label>
            <label className="field">Portfolio link<input type="url" value={form.portfolio_url} onChange={set('portfolio_url')} placeholder="https://…" /></label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>Skills (comma separated)<input value={form.skills} onChange={set('skills')} placeholder="React, Node, SQL, Figma" /></label>
          </div>
          <div className="card__foot">
            <span className="spacer" />
            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
          </div>
        </form>

        <section className="card">
          <div className="card__head"><h2>Resume</h2></div>
          <div style={{ padding: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <span className="muted" style={{ flex: 1, minWidth: 220 }}>{form.resume_path ? <>Current file: <span className="mono">{form.resume_path.split('/').pop()}</span></> : 'No resume uploaded yet.'}</span>
            <label className="btn btn--ghost" style={{ cursor: 'pointer' }}>
              Upload PDF
              <input type="file" accept="application/pdf,.pdf,.doc,.docx" className="sr-only" onChange={uploadResume} />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card__head"><h2>Gmail</h2></div>
          <div style={{ padding: 22, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <span style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`dot ${gmail.connected ? 'dot--green' : 'dot--amber'}`} />
              {gmail.connected ? 'Connected — Huntr can send applications from your Gmail.' : 'Not connected.'}
            </span>
            {gmail.connected ? (
              <button type="button" className="btn btn--ghost" onClick={disconnect}>Disconnect</button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => signInWithGoogle('/profile')} disabled={gmail.configured === false}>Connect Gmail</button>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
