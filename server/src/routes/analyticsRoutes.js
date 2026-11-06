import { Router } from 'express';
import { createAnalyticsController } from '../controllers/analyticsController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateQuery } from '../middleware/validateQuery.js';
import {
  categoryBreakdownQuerySchema,
  dailySpendingQuerySchema,
  incomeVsExpenseQuerySchema,
  monthlyReportQuerySchema,
} from '../validators/analyticsSchemas.js';

export function createAnalyticsRoutes({ db, env }) {
  const router = Router();
  const controller = createAnalyticsController({ db });
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  router.get(
    '/category-breakdown',
    validateQuery(categoryBreakdownQuerySchema, 'INVALID_RANGE'),
    controller.categoryBreakdown,
  );
  router.get(
    '/daily-spending',
    validateQuery(dailySpendingQuerySchema, 'INVALID_RANGE'),
    controller.dailySpending,
  );
  router.get(
    '/income-vs-expense',
    validateQuery(incomeVsExpenseQuerySchema),
    controller.incomeVsExpense,
  );
  router.get('/monthly-report', validateQuery(monthlyReportQuerySchema), controller.monthlyReport);
  return router;
}
