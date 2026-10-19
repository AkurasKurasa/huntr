import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';

const AuthContext = createContext({ session: null, loading: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // Right after Google sign-in, hand the refresh token to the server once so it can send Gmail later.
      if (event === 'SIGNED_IN' && next?.provider_refresh_token) {
        api('/gmail/connect', { method: 'POST', body: { refreshToken: next.provider_refresh_token } }).catch((err) =>
          console.error('Could not connect Gmail:', err.message)
        );
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
