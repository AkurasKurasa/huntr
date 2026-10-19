import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { crawl } from '../services/crawler.js';
import { analyze } from '../services/parser.js';
import { draftBody, fillSubject } from '../services/drafter.js';
import { saveSnapshotImage } from '../services/snapshot.js';

const router = Router();
const MAX_LINKS = 25;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * POST /api/jobs/analyze  { links: string[], tone?: 'formal'|'friendly'|'concise' }
 * Crawls each link, works out how to apply, drafts the email / cover letter,
 * and saves each one as a draft application.
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const tone = ['formal', 'friendly', 'concise'].includes(req.body?.tone) ? req.body.tone : 'formal';
    const links = [...new Set((req.body?.links || []).map((l) => String(l).trim()).filter(Boolean))]
      .map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`));
    if (!links.length) return res.status(400).json({ error: 'Add at least one job link' });
    if (links.length > MAX_LINKS) return res.status(400).json({ error: `Up to ${MAX_LINKS} links at a time` });

    const { data: profile } = await req.db.from('profiles').select('*').eq('id', req.user.id).maybeSingle();

    const results = await mapLimit(links, 4, async (link) => {
      try {
        const page = await crawl(link);
        const job = analyze(page, link);
        const id = randomUUID();
        const row = {
          id,
          user_id: req.user.id,
          source_url: link,
          title: job.title,
          company: job.company,
          location: job.location,
          method: job.method,
          apply_email: job.apply_email,
          apply_url: job.apply_url,
          instructions: job.instructions,
          skills: job.skills,
          needs: job.needs,
          subject: job.method === 'email' ? fillSubject(job, profile) : null,
          body: draftBody(job, profile, tone),
          tone,
          // Snapshot of the post, kept even if the listing is taken down later
          description: (page.description || '').slice(0, 20000),
          image_source_url: page.imageUrl || null,
          snapshot_at: new Date().toISOString()
        };
        let { data, error } = await req.db.from('applications').insert(row).select().single();
        if (error) throw error;
        if (page.imageUrl) {
          try {
            const image_path = await saveSnapshotImage(req.user.id, id, page.imageUrl);
            const upd = await req.db.from('applications').update({ image_path }).eq('id', id).select().single();
            if (!upd.error) data = upd.data;
          } catch (imgErr) {
            console.warn('[huntr] snapshot image skipped:', imgErr.message);
          }
        }
        return {
          ok: true,
          application: data,
          extra: { subjectFromListing: Boolean(job.subject_rule), noEmail: job.no_email, wantsProject: job.wants_project, formFields: job.form_fields }
        };
      } catch (err) {
        return { ok: false, link, error: err.message || 'Could not read that page' };
      }
    });

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
