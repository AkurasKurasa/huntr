import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { assertConfig, config } from './config.js';
import { requireUser } from './middleware/requireUser.js';
import jobsRouter from './routes/jobs.js';
import applicationsRouter from './routes/applications.js';
import gmailRouter from './routes/gmail.js';
import profileRouter from './routes/profile.js';

assertConfig();

const app = express();
app.use(helmet());
app.set('trust proxy', 1); // Render sits behind a proxy (needed for rate limiting)
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/jobs', requireUser, jobsRouter);
app.use('/api/applications', requireUser, applicationsRouter);
app.use('/api/gmail', requireUser, gmailRouter);
app.use('/api/profile', requireUser, profileRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[huntr]', err);
  res.status(500).json({ error: err.message || 'Something went wrong' });
});

app.listen(config.port, () => {
  console.log(`[huntr] API listening on http://localhost:${config.port}`);
});
