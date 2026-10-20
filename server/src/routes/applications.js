import { Router } from 'express';
import { draftBody, fillSubject, unansweredQuestions } from '../services/drafter.js';
import { ASK_RE } from '../services/parser.js';
import { sendGmail } from '../services/gmail.js';
import { deleteSnapshotImage } from '../services/snapshot.js';

const router = Router();

const STAGES = ['applied', 'replied', 'screen', 'interview'];
const STATUSES = ['draft', 'waiting', 'in_progress', 'offer', 'rejected', 'ghosted', 'declined'];
const EDITABLE = ['subject', 'body', 'tone', 'stage', 'status', 'note', 'title', 'company', 'location'];

// GET /api/applications?scope=drafts|tracked|all
router.get('/', async (req, res, next) => {
  try {
    let q = req.db.from('applications').select('*').order('created_at', { ascending: false });
    if (req.query.scope === 'drafts') q = q.eq('status', 'draft');
    if (req.query.scope === 'tracked') q = q.neq('status', 'draft');
    const { data, error } = await q;
    if (error) throw error;
    res.json({ applications: data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/applications/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const patch = {};
    for (const k of EDITABLE) if (k in (req.body || {})) patch[k] = req.body[k];
    if (patch.stage && !STAGES.includes(patch.stage)) return res.status(400).json({ error: 'Unknown stage' });
    if (patch.status && !STATUSES.includes(patch.status)) return res.status(400).json({ error: 'Unknown status' });
    const { data, error } = await req.db.from('applications').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ application: data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/applications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: app } = await req.db.from('applications').select('image_path').eq('id', req.params.id).maybeSingle();
    const { error } = await req.db.from('applications').delete().eq('id', req.params.id);
    if (error) throw error;
    if (app?.image_path) await deleteSnapshotImage(app.image_path).catch(() => {});
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/applications/:id/redraft { tone }
router.post('/:id/redraft', async (req, res, next) => {
  try {
    const tone = ['formal', 'friendly', 'concise'].includes(req.body?.tone) ? req.body.tone : 'formal';
    const { data: app, error } = await req.db.from('applications').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    const { data: profile } = await req.db.from('profiles').select('*').eq('id', req.user.id).maybeSingle();
    const job = {
      ...app,
      wants_project: /project/i.test(`${(app.instructions || []).join(' ')} ${app.description || ''}`),
      asks: (app.instructions || []).filter((s) => ASK_RE.test(s)),
      subject_rule: null
    };
    const patch = { tone, body: draftBody(job, profile, tone) };
    if (app.method === 'email' && !app.subject) patch.subject = fillSubject(job, profile);
    const { data, error: upErr } = await req.db.from('applications').update(patch).eq('id', app.id).select().single();
    if (upErr) throw upErr;
    res.json({ application: data });
  } catch (err) {
    next(err);
  }
});

async function sendOne(req, app, profile) {
  if (app.status !== 'draft') return { id: app.id, ok: true, skipped: 'already sent', application: app };
  if (app.method !== 'email') return { id: app.id, ok: false, needsUser: true, error: 'Apply on the company site, then mark it as submitted' };
  if (!app.apply_email) return { id: app.id, ok: false, error: 'No email address found for this job' };
  if (unansweredQuestions(app.body).length) {
    return { id: app.id, ok: false, error: `“${app.title}”: answer the employer's question in the draft first (the part marked “Answer needed”).` };
  }
  try {
    const messageId = await sendGmail(req.user.id, {
      to: app.apply_email,
      subject: app.subject || `Application — ${app.title}`,
      body: app.body || '',
      resumePath: profile?.resume_path
    });
    const { data, error } = await req.db
      .from('applications')
      .update({ status: 'waiting', gmail_message_id: messageId, sent_at: new Date().toISOString() })
      .eq('id', app.id)
      .select()
      .single();
    if (error) throw error;
    return { id: app.id, ok: true, application: data };
  } catch (err) {
    return { id: app.id, ok: false, error: err.message };
  }
}

// POST /api/applications/send  { ids: string[] }  — sends every email application in the list
router.post('/send', async (req, res, next) => {
  try {
    const ids = (req.body?.ids || []).slice(0, 50);
    if (!ids.length) return res.status(400).json({ error: 'Nothing to send' });
    const { data: apps, error } = await req.db.from('applications').select('*').in('id', ids);
    if (error) throw error;
    const { data: profile } = await req.db.from('profiles').select('*').eq('id', req.user.id).maybeSingle();
    const results = [];
    for (const app of apps) {
      results.push(await sendOne(req, app, profile)); // one at a time to stay under Gmail rate limits
    }
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// POST /api/applications/:id/submitted — for site applications the user finished themselves
router.post('/:id/submitted', async (req, res, next) => {
  try {
    const { data, error } = await req.db
      .from('applications')
      .update({ status: 'waiting', sent_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ application: data });
  } catch (err) {
    next(err);
  }
});

export default router;
