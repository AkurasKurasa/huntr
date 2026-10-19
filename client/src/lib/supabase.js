import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy client/.env.example to client/.env.');
}

// PKCE returns "?code=…" in the query string, which plays nicely with the hash-based router GitHub Pages needs.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-key', {
  auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true }
});

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const RETURN_KEY = 'huntr:returnTo';

/** The app's root URL, e.g. http://localhost:5173/ or https://you.github.io/huntr/ */
export const appUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/** Remember where to go after the Google round-trip (OAuth always comes back to the app root). */
export function takeReturnTo() {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return v;
  } catch {
    return null;
  }
}

/** Google sign-in that also asks for permission to send Gmail on the user's behalf. */
export function signInWithGoogle(returnTo = '/apply') {
  try {
    sessionStorage.setItem(RETURN_KEY, returnTo);
  } catch {
    /* private mode — fine, we just land on /apply */
  }
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appUrl(),
      scopes: GMAIL_SCOPE,
      // offline + consent makes Google return a refresh token, so Huntr can keep sending later
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
}
