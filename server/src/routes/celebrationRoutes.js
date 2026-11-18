import { Router } from 'express';
import { z } from 'zod';
import { createCelebrationController } from '../controllers/celebrationController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';

export function createCelebrationRoutes(options) {
  const router = Router();
  router.use(requireAuth({ db: options.db, secret: options.env.jwtSecret, env: options.env }));
  const controller = createCelebrationController(options);
  router.get('/pending', controller.pending);
  router.post('/ack', requireJson, validateBody(z.object({ upToId: z.number().int().positive().safe() })), controller.acknowledge);
  return router;
}
