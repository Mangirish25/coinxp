import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { notificationPreferencesSchema } from '../validators/notificationPreferenceSchemas.js';
import { createNotificationPreferenceService } from '../services/notificationPreferenceService.js';
import { createNotificationPreferenceController } from '../controllers/notificationPreferenceController.js';

export function createNotificationPreferenceRoutes({ db, env, clock }) {
  const router = Router(); router.use(requireAuth({ db, secret: env.jwtSecret, env }));
  const controller = createNotificationPreferenceController(createNotificationPreferenceService({ db, clock }));
  router.get('/preferences',controller.get);
  router.put('/preferences',requireJson,validateBody(notificationPreferencesSchema),controller.put);
  return router;
}
