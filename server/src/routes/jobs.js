import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { crawl, fromBrowser, canonicalJobUrl, looksLikeSearchPage } from '../services/crawler.js';
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
 * POST /api/jobs/analyze  { links: string[], pages?: [{ url, html, finalUrl }], tone?: 'formal'|'friendly'|'concise' }
 * `pages` are job pages your own browser loaded through the Huntr extension (for sites that block servers).
 * Crawls each link, works out how to apply, drafts the email / cover letter,
 * and saves each one as a draft application.
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const tone = ['formal', 'friendly', 'concise'].includes(req.body?.tone) ? req.body.tone : 'formal';
    const pages = new Map(
      (Array.isArray(req.body?.pages) ? req.body.pages : [])
        .filter((p) => p && typeof p.url === 'string' && typeof p.html === 'string' && p.html.length < 5_000_000)
        .map((p) => [p.url.trim(), p])
    );
    const links = [...new Set([...(req.body?.links || []), ...pages.keys()].map((l) => String(l).trim()).filter(Boolean))]
      .map((l) => canonicalJobUrl(/^https?:\/\//i.test(l) ? l : `https://${l}`));
    for (const [url, p] of [...pages]) pages.set(canonicalJobUrl(url), p);
    if (!links.length) return res.status(400).json({ error: 'Add at least one job link' });
    if (links.length > MAX_LINKS) return res.status(400).json({ error: `Up to ${MAX_LINKS} links at a time` });

    const { data: profile } = await req.db.from('profiles').select('*').eq('id', req.user.id).maybeSingle();

    const results = await mapLimit(links, 4, async (link) => {
      try {
        const given = pages.get(link);
        const page = given ? fromBrowser(link, given.html, given.finalUrl) : await crawl(link);
        if (looksLikeSearchPage(page.title)) {
          throw new Error('That link is a list of search results, not one job — open the job itself and copy its link');
        }
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
          extra: { subjectFromListing: Boolean(job.subject_rule), noEmail: job.no_email, wantsProject: job.wants_project, asks: job.asks, loginRequired: Boolean(page.loginRequired), formFields: job.form_fields }
        };
      } catch (err) {
        const msg = err.message || 'Could not read that page';
        const hint = /schema cache|column .* does not exist|relation .* does not exist/i.test(msg)
          ? ' — your database is missing a newer table change. Run the newest files in the supabase folder (002_job_snapshots.sql, 003_profile_details.sql, 004_screening_answers.sql) in the Supabase SQL Editor.'
          : '';
        return { ok: false, link, error: msg + hint };
      }
    });

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

export default router;
