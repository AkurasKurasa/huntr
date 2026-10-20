import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { supabase, signInWithGoogle, appUrl, googleEnabled } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Auth() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/apply';
  const [mode, setMode] = useState(location.state?.mode === 'signup' ? 'signup' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [google, setGoogle] = useState(true);
  useEffect(() => {
    googleEnabled().then(setGoogle);
    // Supabase puts problems with email links (expired, already used) in the address bar.
    const params = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#\/?[^?&]*[?&]?/, ''));
    const desc = params.get('error_description');
    if (desc) {
      setError(`${desc.replace(/\+/g, ' ')}. Request a new link by signing up again, or log in if you already confirmed.`);
      window.history.replaceState(null, '', window.location.pathname + '#/auth');
    }
  }, []);

  if (session) return <Navigate to={from} replace />;
  const login = mode === 'login';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (login) {
        const { error: err } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (err) throw err;
        navigate(from);
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.name }, emailRedirectTo: appUrl() }
        });
        if (err) throw err;
        if (data.session) navigate(from);
        else setInfo('Check your email to confirm your account, then log in.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setError('');
    const { error: err } = await signInWithGoogle(from);
    if (err) setError(err.message);
  }

  return (
    <div className="auth">
      <section className="auth__brand">
        <span className="hero__shape hero__sun" style={{ top: 'auto', bottom: 120, right: '12%' }} />
        <span className="hero__shape hero__moon" />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 20 }}>
          <Logo size={30} color="#fff" /> huntr
        </div>
        <div style={{ position: 'relative', maxWidth: 500 }}>
          <div className="hero__eyebrow">Job hunting, automated</div>
          <h1>
            Paste the links.
            <br />
            <span>Huntr does the applying.</span>
          </h1>
          <ol className="auth__list">
            <li><span>01</span>Drop in as many job links as you want</li>
            <li><span>02</span>Huntr reads each post and writes what it asks for</li>
            <li><span>03</span>It sends from your Gmail and tracks every reply</li>
          </ol>
        </div>
        <div style={{ position: 'relative', fontSize: 13, color: '#c8bcff' }}>© {new Date().getFullYear()} Huntr</div>
      </section>

      <section className="auth__form">
        <div className="auth__inner">
          <button type="button" className="btn btn--text" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => navigate('/apply')}>← Back to Huntr</button>
          <div className="segmented" role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={login} style={{ flex: 1, minHeight: 38 }} onClick={() => setMode('login')}>Log in</button>
            <button type="button" role="tab" aria-selected={!login} style={{ flex: 1, minHeight: 38 }} onClick={() => setMode('signup')}>Sign up</button>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em' }}>{login ? 'Welcome back' : 'Create your account'}</h2>
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 15 }}>
              {login ? 'Log in to pick up where you left off.' : 'Free to start. Bring your resume and some job links.'}
            </p>
          </div>

          <button type="button" className="btn btn--google btn--block" onClick={googleSignIn} disabled={!google}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            Continue with Google
          </button>
          <p className="muted" style={{ margin: '-10px 0 0', fontSize: 13, textAlign: 'center' }}>
            {google ? 'Also connects Gmail, so Huntr can send applications for you.' : 'Google sign-in isn’t set up yet — use email and password for now.'}
          </p>
          <div className="divider">OR</div>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {!login && (
              <label className="field">Full name
                <input type="text" autoComplete="name" value={form.name} onChange={set('name')} required />
              </label>
            )}
            <label className="field">Email
              <input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </label>
            <label className="field">Password
              <input type="password" autoComplete={login ? 'current-password' : 'new-password'} minLength={6} value={form.password} onChange={set('password')} required />
            </label>
            {error && <div className="alert" role="alert">{error}</div>}
            {info && <div className="strip"><span className="strip__text">{info}</span></div>}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'One moment…' : login ? 'Log in' : 'Create account'}
            </button>
          </form>
          <p className="muted" style={{ margin: 0, fontSize: 14, textAlign: 'center' }}>
            {login ? 'New to Huntr?' : 'Already have an account?'}{' '}
            <button type="button" className="btn--text" style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'underline', padding: '10px 4px' }} onClick={() => setMode(login ? 'signup' : 'login')}>
              {login ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
