const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export const config = {
  port: Number(process.env.PORT) || 5000,
  // Comma-separated list, e.g. "http://localhost:5173,https://akuraskurasa.github.io"
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET
};

export function assertConfig() {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Copy server/.env.example to server/.env and fill it in.`);
  }
  if (!config.googleClientId || !config.googleClientSecret) {
    console.warn('[huntr] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — sending through Gmail is disabled.');
  }
}
