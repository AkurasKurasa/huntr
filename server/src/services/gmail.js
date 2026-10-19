import { config } from '../config.js';
import { adminClient } from '../lib/supabase.js';

export function gmailConfigured() {
  return Boolean(config.googleClientId && config.googleClientSecret);
}

export async function saveRefreshToken(userId, email, refreshToken) {
  const { error } = await adminClient()
    .from('gmail_tokens')
    .upsert({ user_id: userId, email, refresh_token: refreshToken, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function hasGmail(userId) {
  const { data } = await adminClient().from('gmail_tokens').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

export async function disconnectGmail(userId) {
  await adminClient().from('gmail_tokens').delete().eq('user_id', userId);
}

async function accessTokenFor(userId) {
  if (!gmailConfigured()) throw new Error('Gmail sending is not set up on the server (missing Google client ID/secret)');
  const { data, error } = await adminClient().from('gmail_tokens').select('refresh_token').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Gmail is not connected. Sign out and sign in again with Google.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.error === 'invalid_grant') await disconnectGmail(userId);
    throw new Error(`Google refused the Gmail token (${json.error || res.status}). Sign in with Google again.`);
  }
  return json.access_token;
}

const b64 = (buf) => Buffer.from(buf).toString('base64');
const b64url = (str) => Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeHeader = (s) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export function buildMime({ to, subject, body, attachment }) {
  const boundary = `huntr_${Date.now().toString(36)}`;
  const head = [`To: ${to}`, `Subject: ${encodeHeader(subject)}`, 'MIME-Version: 1.0'];
  if (!attachment) {
    return [...head, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', b64(body)].join('\r\n');
  }
  const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');
  return [
    ...head,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(body)),
    `--${boundary}`,
    `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(attachment.data)),
    `--${boundary}--`
  ].join('\r\n');
}

async function loadResume(resumePath) {
  if (!resumePath) return null;
  const { data, error } = await adminClient().storage.from('resumes').download(resumePath);
  if (error || !data) return null;
  const filename = resumePath.split('/').pop() || 'resume.pdf';
  return { filename, contentType: data.type || 'application/pdf', data: Buffer.from(await data.arrayBuffer()) };
}

/** Sends one email from the user's Gmail. Returns the Gmail message id. */
export async function sendGmail(userId, { to, subject, body, resumePath }) {
  const token = await accessTokenFor(userId);
  const attachment = await loadResume(resumePath);
  const raw = b64url(buildMime({ to, subject, body, attachment }));
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Gmail send failed (${res.status})`);
  return json.id;
}
