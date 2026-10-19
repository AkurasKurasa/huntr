// Creates (or resets) the "keep-awake" bot account in your Supabase project, then
// proves it works by signing in and reading its profile — exactly what the GitHub job does.
//
//   npm run bot --prefix server                 -> prints the email + password to use
//   npm run bot --prefix server -- --json       -> same, as JSON (used by setup-keepalive.ps1)
//   BOT_EMAIL=me+bot@gmail.com npm run bot ...  -> choose the email yourself
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const json = process.argv.includes('--json');
const log = (...a) => { if (!json) console.log(...a); };
const fail = (msg) => {
  if (json) console.log(JSON.stringify({ ok: false, error: msg }));
  else console.error(`\n✗ ${msg}\n`);
  process.exit(1);
};

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  fail('Fill in SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in server/.env first.');
}

const email = (process.env.BOT_EMAIL || 'keepalive-bot@huntr-app.example.com').toLowerCase();
const password = process.env.BOT_PASSWORD || randomBytes(24).toString('base64url');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts);

async function findUser(addr) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === addr);
    if (hit || data.users.length < 200) return hit || null;
  }
  return null;
}

try {
  log(`Setting up the keep-awake bot (${email})…`);
  const existing = await findUser(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
    log('• Bot already existed — gave it a fresh password.');
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no confirmation email needed
      user_metadata: { full_name: 'Huntr keep-awake bot' }
    });
    if (error) throw error;
    log('• Created the bot account.');
  }

  // Do what the scheduled job will do: sign in with the public key, then read the profile.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, opts);
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`Bot sign-in failed: ${signErr.message}. Is Email sign-in enabled under Authentication -> Sign In / Providers?`);
  const asBot = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...opts,
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } }
  });
  const { error: readErr } = await asBot.from('profiles').select('id').limit(1);
  if (readErr) throw new Error(`Bot signed in but could not read profiles: ${readErr.message}. Did you run supabase/schema.sql?`);
  log('• Test sign-in and database read worked.');

  if (json) {
    console.log(JSON.stringify({ ok: true, email, password }));
  } else {
    console.log(`
✓ Bot is ready. Add these as GitHub repo SECRETS
  (Settings -> Secrets and variables -> Actions -> Secrets -> New repository secret):

  HUNTR_BOT_EMAIL     ${email}
  HUNTR_BOT_PASSWORD  ${password}

Keep the password private. Running this again creates a new password (update the secret if you do).
`);
  }
} catch (err) {
  fail(err.message || String(err));
}
