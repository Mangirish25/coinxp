import { Router } from 'express';
import { z } from 'zod';
import { createStreakController } from '../controllers/streakController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { isValidDateString } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

const calendarSchema = z.object({
  from: z.string().refine(isValidDateString, 'from must be a valid YYYY-MM-DD date.').optional(),
  to: z.string().refine(isValidDateString, 'to must be a valid YYYY-MM-DD date.').optional(),
}).superRefine(({ from, to }, context) => {
  if (from && to && from > to) context.addIssue({ code: 'custom', path: ['to'], message: 'to must be on or after from.' });
});
const pageSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });

export function createStreakRoutes({ db, env, streakService }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  const controller = createStreakController(streakService);
  router.get('/', controller.summary);
  router.get('/tracking/calendar', validateQuery(calendarSchema, 'INVALID_RANGE'), (req, res, next) => {
    const today = streakService.today(req.user.id);
    const from = req.validatedQuery.from ?? `${today.slice(0, 7)}-01`;
    const to = req.validatedQuery.to ?? today;
    if (from > to) return next(httpError(400, 'INVALID_RANGE', 'to must be on or after from.'));
    if (Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1 > streakService.maxCalendarDays()) {
      return next(httpError(400, 'RANGE_TOO_LARGE', `Calendar range cannot exceed ${streakService.maxCalendarDays()} days.`));
    }
    req.validatedQuery = { from, to };
    return controller.calendar(req, res);
  });
  router.get('/freezes', validateQuery(pageSchema), controller.freezes);
  router.get('/rules', controller.rules);
  return router;
}
