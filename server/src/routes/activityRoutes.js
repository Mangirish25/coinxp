import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { activityQuerySchema } from '../validators/activitySchemas.js';
import { createActivityService } from '../services/activityService.js';
import { createActivityController } from '../controllers/activityController.js';
import { httpError } from '../utils/httpError.js';

export function createActivityRoutes({ db, env }) {
  const router = Router(); router.use(requireAuth({ db, secret: env.jwtSecret }));
  const controller = createActivityController(createActivityService({ db }));
  router.get('/',validateQuery(activityQuerySchema),(req,res,next) => {
    let beforeId = null;
    try { if (req.validatedQuery.cursor) beforeId = JSON.parse(Buffer.from(req.validatedQuery.cursor,'base64url').toString()); }
    catch { return next(httpError(400,'INVALID_CURSOR','The activity cursor is invalid.')); }
    if (beforeId && (!Number.isSafeInteger(beforeId.id) || typeof beforeId.occurredAt !== 'string')) return next(httpError(400,'INVALID_CURSOR','The activity cursor is invalid.'));
    req.validatedQuery = { limit: req.validatedQuery.pageSize, beforeId, kind: req.validatedQuery.kind ?? null };
    controller.list(req,res,next);
  });
  return router;
}
