import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { rateLimit } from 'express-rate-limit';
import rules from '../gamification/rules.config.js';
import { isValidDateString } from '../utils/dates.js';

const ledgerQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), ruleId: z.string().optional(), from: z.string().refine(isValidDateString, 'Use a valid YYYY-MM-DD date.').optional(), to: z.string().refine(isValidDateString, 'Use a valid YYYY-MM-DD date.').optional() })
  .superRefine((value, context) => { if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', message: 'from must be before or equal to to.', path: ['to'] }); });

export function createGamificationRoutes({ db, env, gameEngine }) {
  const router = Router();
  router.get('/rules', (_req, res) => res.json(gameEngine.publicRules()));
  router.use(requireAuth({ db, secret: env.jwtSecret, env }));
  const reviewLimit = rateLimit({ windowMs: rules.rateLimits.windowSeconds * 1000, limit: rules.rateLimits.reviewPerMinute, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many review requests. Please try again later.' } }) });
  router.get('/summary', (req, res) => res.json(gameEngine.summary(req.user.id)));
  router.get('/ledger', validateQuery(ledgerQuery), (req, res) => res.json(gameEngine.ledgerPage(req.user.id, req.validatedQuery)));
  router.get('/daily-review/today', (req, res) => res.json(gameEngine.dailyReviewStatus(req.user.id)));
  router.post('/daily-review', reviewLimit, requireJson, validateBody(z.object({ noSpend: z.boolean().default(false) })), (req, res) => {
    const result = gameEngine.createReview(req.user.id, req.body);
    res.status(result.status).json(result);
  });
  router.post('/feed/ack', requireJson, validateBody(z.object({ upToLedgerId: z.number().int().nonnegative() })), (req, res) => res.json(gameEngine.acknowledgeFeed(req.user.id, req.body.upToLedgerId)));
  return router;
}
