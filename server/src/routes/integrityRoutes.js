import { Router } from 'express';
import { createIntegrityController } from '../controllers/integrityController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateQuery } from '../middleware/validateQuery.js';
import { acknowledgeNoticeSchema, appealSchema, noticeQuerySchema } from '../validators/integritySchemas.js';

export function createIntegrityRoutes(options) {
  const router = Router(); const controller = createIntegrityController(options);
  router.use(requireAuth({ db: options.db, secret: options.env.jwtSecret, env: options.env }));
  router.get('/status',controller.status);
  router.get('/notices',validateQuery(noticeQuerySchema),controller.notices);
  router.post('/notices/ack',requireJson,validateBody(acknowledgeNoticeSchema),controller.acknowledge);
  router.post('/appeals',requireJson,validateBody(appealSchema),controller.appeal);
  return router;
}
