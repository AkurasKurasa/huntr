import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { takeReturnTo } from './lib/supabase.js';
import Auth from './pages/Auth.jsx';
import Apply from './pages/Apply.jsx';
import Tracker from './pages/Tracker.jsx';
import Profile from './pages/Profile.jsx';
import Extension from './pages/Extension.jsx';
import BrowserNotice from './components/BrowserNotice.jsx';

function Protected({ children }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted" style={{ padding: 32 }}>Loading…</p>;
  return session ? children : <Navigate to="/auth" replace state={{ from: location.pathname }} />;
}

/** After the Google round-trip, go back to the page that started it. */
function ReturnAfterSignIn() {
  const { session } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!session) return;
    const to = takeReturnTo();
    if (to) navigate(to, { replace: true });
    // Clean "?code=…" out of the address bar once Supabase has used it.
    if (window.location.search.includes('code=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, [session, navigate]);
  return null;
}

export default function App() {
  return (
    <>
      <BrowserNotice />
      <ReturnAfterSignIn />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/apply" element={<Apply />} />{/* public: guests can look, actions ask them to sign in */}
        <Route path="/tracker" element={<Protected><Tracker /></Protected>} />
        <Route path="/extension" element={<Extension />} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="*" element={<Navigate to="/apply" replace />} />
      </Routes>
    </>
  );
}
