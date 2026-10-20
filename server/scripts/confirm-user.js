// Marks a Huntr account's email as confirmed (handy while testing locally).
//   npm run confirm --prefix server -- you@example.com
//   npm run confirm --prefix server            -> lists unconfirmed accounts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n✗ Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env first.\n');
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function allUsers() {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

try {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const users = await allUsers();

  if (!email) {
    const pending = users.filter((u) => !u.email_confirmed_at);
    if (!pending.length) console.log('\nEvery account is already confirmed.\n');
    else {
      console.log('\nUnconfirmed accounts:');
      pending.forEach((u) => console.log(`  ${u.email}   (signed up ${new Date(u.created_at).toLocaleString()})`));
      console.log('\nConfirm one with:  npm run confirm --prefix server -- <email>\n');
    }
    process.exit(0);
  }

  const user = users.find((u) => (u.email || '').toLowerCase() === email);
  if (!user) {
    console.error(`\n✗ No account with ${email}. Sign up in the app first (or check the spelling).\n`);
    process.exit(1);
  }
  if (user.email_confirmed_at) {
    console.log(`\n✓ ${email} was already confirmed (${new Date(user.email_confirmed_at).toLocaleString()}). You can log in.\n`);
    process.exit(0);
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (error) throw error;
  console.log(`\n✓ Confirmed ${email}. Log in at http://localhost:5173 with your password.\n`);
} catch (err) {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
}
