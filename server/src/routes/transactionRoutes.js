import { Router } from 'express';
import { createTransactionController } from '../controllers/transactionController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateParams } from '../middleware/validateParams.js';
import { validateQuery } from '../middleware/validateQuery.js';
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
  router.use(requireAuth({ db: options.db, secret: options.env.jwtSecret }));
  router.post('/', requireJson, validateBody(createTransactionSchema), controller.create);
  router.get('/', validateQuery(transactionListQuerySchema), controller.list);
  router.get('/:id/history', validateParams(transactionIdParamsSchema), controller.history);
  router.post(
    '/:id/restore',
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
    requireJson,
    validateParams(transactionIdParamsSchema),
    validateBody(updateTransactionSchema),
    controller.update,
  );
  router.delete('/:id', requireJson, validateParams(transactionIdParamsSchema), controller.delete);
  return router;
}
