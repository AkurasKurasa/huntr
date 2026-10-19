import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

let admin;
/** Service-role client. Bypasses RLS — only use for server-only data (Gmail tokens, resume files). */
export function adminClient() {
  if (!admin) admin = createClient(config.supabaseUrl, config.supabaseServiceKey, opts);
  return admin;
}

/** Client that acts as the signed-in user, so Row Level Security applies. */
export function userClient(accessToken) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}
