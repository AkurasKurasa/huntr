import { Router } from 'express';

const router = Router();
const FIELDS = ['full_name', 'school', 'degree', 'skills', 'portfolio_url', 'resume_path', 'headline', 'summary', 'highlight', 'answers'];

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await req.db.from('profiles').select('*').eq('id', req.user.id).maybeSingle();
    if (error) throw error;
    res.json({ profile: data || { id: req.user.id } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile
router.put('/', async (req, res, next) => {
  try {
    const row = { id: req.user.id };
    for (const k of FIELDS) if (k in (req.body || {})) row[k] = req.body[k];
    if (row.skills && !Array.isArray(row.skills)) {
      row.skills = String(row.skills).split(',').map((s) => s.trim()).filter(Boolean);
    }
    if ('answers' in row) {
      // { "question text": "answer" | ["answer", …] } — keep it small and plain
      const src = row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers) ? row.answers : {};
      row.answers = Object.fromEntries(
        Object.entries(src)
          .slice(0, 300)
          .map(([q, a]) => [String(q).slice(0, 300), Array.isArray(a) ? a.map((x) => String(x).slice(0, 300)).slice(0, 20) : String(a ?? '').slice(0, 2000)])
          .filter(([q, a]) => q && (Array.isArray(a) ? a.length : a !== ''))
      );
    }
    const { data, error } = await req.db.from('profiles').upsert(row).select().single();
    if (error) throw error;
    res.json({ profile: data });
  } catch (err) {
    next(err);
  }
});

export default router;
