import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateParams } from '../middleware/validateParams.js';
import { httpError } from '../utils/httpError.js';
import { createChallengeController } from '../controllers/challengeController.js';

const startParams = z.object({ slug: z.string().min(1).max(60) });
const runParams = z.object({ id: z.coerce.number().int().positive() });
const emptyBody = z.object({}).strict();

export function createChallengeRoutes({ db, env, gameEngine }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret, env }));
  const controller = createChallengeController(gameEngine);
  const rewardConfig = gameEngine.rewardConfig();
  const rate = rateLimit({ windowMs: rewardConfig.shop.purchaseWindowSeconds * gameEngine.rewardUnits().millisecondsPerSecond,
    limit: rewardConfig.shop.purchasesPerMinute, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many challenge attempts. Please try again later.' } }) });
  const requireKey = (req, _res, next) => {
    const key = req.get('Idempotency-Key');
    if (!key || key.length > gameEngine.publicRules().idempotency.keyMaxLength || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      return next(httpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Provide a valid Idempotency-Key to start a challenge.'));
    }
    return next();
  };
  router.get('/', controller.catalog);
  router.post('/:slug/start', rate, requireJson, validateParams(startParams), requireKey, validateBody(emptyBody), controller.start);
  router.get('/runs/:id', validateParams(runParams), controller.run);
  router.post('/runs/:id/cancel', rate, requireJson, validateParams(runParams), validateBody(emptyBody), controller.cancel);
  router.post('/runs/:id/abandon', rate, requireJson, validateParams(runParams), validateBody(emptyBody), controller.abandon);
  return router;
}
