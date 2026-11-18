import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createMissionController } from '../controllers/missionController.js';

export function createMissionRoutes({ db, env, gameEngine }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  router.get('/', createMissionController({ current: gameEngine.missionCurrent }).list);
  return router;
}
