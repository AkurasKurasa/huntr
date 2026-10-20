import { NavLink, Link, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../context/AuthContext.jsx';

/** Top navigation. `tone="dark"` sits on the violet hero, `tone="light"` on the lavender pages. */
export default function Nav({ tone = 'light', gmailConnected }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const name = user?.user_metadata?.full_name || user?.email || '';
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || 'U';

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/auth');
  }

  return (
    <nav className={`nav nav--${tone}`}>
      <Link to="/apply" className="nav__brand">
        <Logo size={30} />
        huntr
      </Link>
      <div className="nav__links">
        <NavLink to="/apply">Apply</NavLink>
        <NavLink to="/tracker">Tracker</NavLink>
        <NavLink to="/profile">Profile</NavLink>
        <NavLink to="/extension">Setup</NavLink>
      </div>
      {user && gmailConnected !== undefined && (
        <span className="nav__pill">
          <span className={`dot ${gmailConnected ? 'dot--green' : 'dot--amber'}`} />
          {gmailConnected ? 'Gmail connected' : 'Gmail not connected'}
        </span>
      )}
      {user ? (
        <button type="button" className="nav__avatar" onClick={signOut} title="Sign out" aria-label="Sign out">
          {initials}
        </button>
      ) : (
        <div className="nav__guest">
          <Link to="/auth" state={{ from: '/apply', mode: 'login' }} className="nav__login">Log in</Link>
          <Link to="/auth" state={{ from: '/apply', mode: 'signup' }} className="btn nav__signup">Sign up free</Link>
        </div>
      )}
    </nav>
  );
}
