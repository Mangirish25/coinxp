import { Router } from 'express';
import { createDashboardController } from '../controllers/dashboardController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { dashboardSummaryQuerySchema } from '../validators/analyticsSchemas.js';

export function createDashboardRoutes({ db, env }) {
  const router = Router();
  const controller = createDashboardController({ db });
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  router.get('/summary', validateQuery(dashboardSummaryQuerySchema), controller.summary);
  return router;
}
