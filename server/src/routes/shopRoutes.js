import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { httpError } from '../utils/httpError.js';
import { createShopService } from '../services/shopService.js';
import { createShopController } from '../controllers/shopController.js';

const purchaseSchema = z.object({ itemSlug: z.string().min(1).max(60) }).strict();

export function createShopRoutes({ db, env, gameEngine, streakService }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  const service = createShopService({ db, gameEngine, streakService });
  const controller = createShopController(service);
  const rate = rateLimit({ windowMs: gameEngine.rewardConfig().shop.purchaseWindowSeconds * gameEngine.rewardUnits().millisecondsPerSecond,
    limit: gameEngine.rewardConfig().shop.purchasesPerMinute, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many purchase attempts. Please try again later.' } }) });
  router.get('/', controller.catalog);
  router.get('/purchases', controller.history);
  router.post('/purchase', rate, requireJson, validateBody(purchaseSchema), (req, _res, next) => {
    const key = req.get('Idempotency-Key');
    if (!key || key.length > gameEngine.publicRules().idempotency.keyMaxLength || !/^[A-Za-z0-9._:-]+$/.test(key)) return next(httpError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Provide a valid Idempotency-Key to make a purchase.'));
    return next();
  }, controller.purchase);
  return router;
}
