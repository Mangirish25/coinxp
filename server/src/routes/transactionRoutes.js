import { Router } from 'express';
import { createTransactionController } from '../controllers/transactionController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateParams } from '../middleware/validateParams.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { httpError } from '../utils/httpError.js';
import rules from '../gamification/rules.config.js';
import { rateLimit } from 'express-rate-limit';
import {
  transactionIdParamsSchema,
  transactionListQuerySchema,
  includeDeletedQuerySchema,
  createTransactionSchema,
  updateTransactionSchema,
} from '../validators/transactionSchemas.js';

export function createTransactionRoutes(options) {
  const router = Router();
  const controller = createTransactionController(options);
  const validateIdempotency = (req, _res, next) => {
    const key = req.get('Idempotency-Key');
    if (key && (key.length > rules.idempotency.keyMaxLength || !/^[A-Za-z0-9._:-]+$/.test(key))) {
      return next(httpError(400, 'INVALID_IDEMPOTENCY_KEY', 'Use a valid Idempotency-Key of at most 100 characters.'));
    }
    next();
  };
  router.use(requireAuth({ db: options.db, secret: options.env.jwtSecret, env: options.env }));
  const writeLimit = rateLimit({ windowMs: rules.rateLimits.windowSeconds * 1000, limit: rules.rateLimits.transactionWritesPerMinute, standardHeaders: 'draft-7', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many transaction changes. Please try again later.' } }) });
  router.post('/', writeLimit, requireJson, validateIdempotency, validateBody(createTransactionSchema), controller.create);
  router.get('/', validateQuery(transactionListQuerySchema), controller.list);
  router.get('/unexpected-quota', controller.unexpectedQuota);
  router.get('/:id/history', validateParams(transactionIdParamsSchema), controller.history);
  router.post(
    '/:id/restore',
    writeLimit,
    requireJson,
    validateParams(transactionIdParamsSchema),
    controller.restore,
  );
  router.get(
    '/:id',
    validateParams(transactionIdParamsSchema),
    validateQuery(includeDeletedQuerySchema),
    controller.get,
  );
  router.patch(
    '/:id',
    writeLimit,
    requireJson,
    validateParams(transactionIdParamsSchema),
    validateBody(updateTransactionSchema),
    controller.update,
  );
  router.delete('/:id', writeLimit, requireJson, validateParams(transactionIdParamsSchema), controller.delete);
  return router;
}
