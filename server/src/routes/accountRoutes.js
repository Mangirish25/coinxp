import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { ACCOUNT_CONFIG } from '../config/accountConfig.js';
import { createAccountController } from '../controllers/accountController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';

export function createAccountRoutes({ db, env, clock }) {
  const router = Router();
  const controller = createAccountController({ db, clock, env });
  const deletionLimit = rateLimit({ ...ACCOUNT_CONFIG.deletionRateLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many deletion requests. Try again tomorrow.' } }) });
  router.get('/export', requireAuth({ db, secret: env.jwtSecret, env }), controller.export);
  router.delete('/', requireAuth({ db, secret: env.jwtSecret, env }), deletionLimit, requireJson,
    validateBody(z.object({ password: z.string().min(1).max(128) }).strict()), controller.scheduleDeletion);
  router.post('/restore', requireAuth({ db, secret: env.jwtSecret, env, allowPendingDeletion: true }), requireJson,
    validateBody(z.object({}).strict()), controller.restore);
  return router;
}
