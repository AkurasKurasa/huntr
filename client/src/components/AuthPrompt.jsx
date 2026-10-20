import { forwardRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import { signInWithGoogle, googleEnabled } from '../lib/supabase.js';

/**
 * Pop-up shown when a signed-out visitor tries to do something that needs an account.
 * Open it with ref.current.showModal().
 */
const AuthPrompt = forwardRef(function AuthPrompt({ reason, returnTo = '/apply' }, ref) {
  const navigate = useNavigate();
  const [google, setGoogle] = useState(true);
  useEffect(() => {
    googleEnabled().then(setGoogle);
  }, []);
  const close = () => ref.current?.close();
  const go = (mode) => {
    close();
    navigate('/auth', { state: { from: returnTo, mode } });
  };

  return (
    <dialog ref={ref} className="modal modal--sm" aria-labelledby="auth-prompt-title">
      <div className="auth-prompt">
        <button type="button" className="icon-btn auth-prompt__close" aria-label="Close" onClick={close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <span className="auth-prompt__badge"><Logo size={34} color="#fff" /></span>
        <h2 id="auth-prompt-title">Make a free account to keep going</h2>
        <p className="muted">{reason || 'Huntr needs an account to read job posts, save your drafts and send applications.'} Your links stay right where they are.</p>
        {google && (
        <button type="button" className="btn btn--google btn--block" onClick={() => signInWithGoogle(returnTo)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
          Continue with Google
        </button>
        )}
        <div className="auth-prompt__row">
          <button type="button" className="btn btn--primary" onClick={() => go('signup')}>Sign up with email</button>
          <button type="button" className="btn btn--ghost" onClick={() => go('login')}>Log in</button>
        </div>
      </div>
    </dialog>
  );
});

export default AuthPrompt;
