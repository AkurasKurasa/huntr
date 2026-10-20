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

// Catch the common SUPABASE_URL mistakes before making any request.
let host = '';
try {
  host = new URL(SUPABASE_URL).hostname;
} catch {
  fail(`SUPABASE_URL "${SUPABASE_URL}" is not a valid address. It should look like https://abcdefghijklmnop.supabase.co`);
}
if (/YOUR-PROJECT/i.test(SUPABASE_URL)) fail('SUPABASE_URL still has the placeholder YOUR-PROJECT in server/.env — paste your real Project URL.');
if (host === 'supabase.com' || host.endsWith('.supabase.com')) {
  fail(`SUPABASE_URL is the dashboard address (${SUPABASE_URL}). Use the API address instead: https://<project-ref>.supabase.co`);
}
if (new URL(SUPABASE_URL).pathname.replace(/\/$/, '')) {
  fail(`SUPABASE_URL should be just https://${host} — remove the "${new URL(SUPABASE_URL).pathname}" part.`);
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
  const cause = err.cause?.code || err.cause?.message || '';
  if (/fetch failed/i.test(err.message || '') || cause) {
    const why = {
      ENOTFOUND: `the address ${host} doesn't exist — check the project ref in SUPABASE_URL for typos`,
      EAI_AGAIN: 'your computer could not look up the address — check your internet connection',
      ECONNREFUSED: 'the connection was refused',
      ETIMEDOUT: 'the connection timed out — check your internet, VPN or firewall',
      UND_ERR_CONNECT_TIMEOUT: 'the connection timed out — check your internet, VPN or firewall',
      CERT_HAS_EXPIRED: 'a certificate problem (often antivirus or a school/office network inspecting traffic)',
      UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'a certificate problem (often antivirus or a school/office network inspecting traffic)',
      SELF_SIGNED_CERT_IN_CHAIN: 'a certificate problem (often antivirus or a school/office network inspecting traffic)'
    }[cause];
    fail(`Could not reach Supabase at ${SUPABASE_URL}: ${why || cause || 'network error'}. If the project is paused, restore it in the Supabase dashboard first.`);
  }
  fail(err.message || String(err));
}
