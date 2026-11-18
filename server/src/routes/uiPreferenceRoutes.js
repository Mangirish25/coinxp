import { Router } from 'express';
import { z } from 'zod';
import { createUiPreferenceController } from '../controllers/uiPreferenceController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';

const schema = z.object({ motionMode: z.enum(['SYSTEM','FULL','REDUCED','OFF']), celebrations: z.enum(['ALL','MAJOR','OFF']), sound: z.boolean(), haptics: z.boolean() }).strict();

export function createUiPreferenceRoutes(options) {
  const router = Router();
  router.use(requireAuth({ db: options.db, secret: options.env.jwtSecret }));
  const controller = createUiPreferenceController(options);
  router.get('/', controller.get);
  router.put('/', requireJson, validateBody(schema), controller.save);
  return router;
}
