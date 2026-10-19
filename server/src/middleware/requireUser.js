import { adminClient, userClient } from '../lib/supabase.js';

/**
 * Checks the Supabase access token in the Authorization header.
 * On success sets req.user and req.db (a Supabase client scoped to that user).
 */
export async function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Session expired — sign in again' });

  req.user = data.user;
  req.db = userClient(token);
  next();
}
