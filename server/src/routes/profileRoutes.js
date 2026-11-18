import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { createProfileService } from '../services/profileService.js';
import { createProfileController } from '../controllers/profileController.js';

const showcaseSchema = z.object({ slugs: z.array(z.string().min(1).max(60)).max(3) }).strict();
const equipSchema = z.object({ slot: z.enum(['THEME','FRAME']), itemSlug: z.string().min(1).max(60).nullable() }).strict();

export function createProfileRoutes({ db, env, gameEngine, streakService }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret, env }));
  const controller = createProfileController(createProfileService({ db,gameEngine,streakService }));
  router.get('/',controller.get);
  router.post('/showcase',requireJson,validateBody(showcaseSchema),controller.showcase);
  router.post('/equip',requireJson,validateBody(equipSchema),controller.equip);
  return router;
}
