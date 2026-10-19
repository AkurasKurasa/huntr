import { Router } from 'express';

const router = Router();
const FIELDS = ['full_name', 'school', 'degree', 'skills', 'portfolio_url', 'resume_path'];

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
    const { data, error } = await req.db.from('profiles').upsert(row).select().single();
    if (error) throw error;
    res.json({ profile: data });
  } catch (err) {
    next(err);
  }
});

export default router;
