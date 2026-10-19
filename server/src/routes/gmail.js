import { Router } from 'express';
import { disconnectGmail, gmailConfigured, hasGmail, saveRefreshToken } from '../services/gmail.js';

const router = Router();

// GET /api/gmail/status
router.get('/status', async (req, res, next) => {
  try {
    res.json({ configured: gmailConfigured(), connected: await hasGmail(req.user.id) });
  } catch (err) {
    next(err);
  }
});

// POST /api/gmail/connect  { refreshToken }
// The client sends Google's refresh token once, right after Google sign-in.
router.post('/connect', async (req, res, next) => {
  try {
    const token = req.body?.refreshToken;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Missing refresh token' });
    await saveRefreshToken(req.user.id, req.user.email, token);
    res.json({ connected: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/gmail
router.delete('/', async (req, res, next) => {
  try {
    await disconnectGmail(req.user.id);
    res.json({ connected: false });
  } catch (err) {
    next(err);
  }
});

export default router;
