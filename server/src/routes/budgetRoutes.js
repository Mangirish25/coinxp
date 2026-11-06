import { Router } from 'express';
import { createBudgetController } from '../controllers/budgetController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateParams } from '../middleware/validateParams.js';
import { validateQuery } from '../middleware/validateQuery.js';
import {
  budgetIdParamsSchema,
  budgetListQuerySchema,
  budgetStatusQuerySchema,
  dailyStatusQuerySchema,
  upsertBudgetSchema,
} from '../validators/budgetSchemas.js';

export function createBudgetRoutes({ db, env }) {
  const router = Router();
  const controller = createBudgetController({ db });
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  router.put('/', requireJson, validateBody(upsertBudgetSchema), controller.upsert);
  router.get('/', validateQuery(budgetListQuerySchema), controller.list);
  router.get('/status', validateQuery(budgetStatusQuerySchema), controller.status);
  router.get('/daily-status', validateQuery(dailyStatusQuerySchema), controller.dailyStatus);
  router.delete('/:id', requireJson, validateParams(budgetIdParamsSchema), controller.remove);
  return router;
}
