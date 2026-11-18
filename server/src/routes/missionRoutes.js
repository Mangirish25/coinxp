import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createMissionController } from '../controllers/missionController.js';
import { requireJson } from '../middleware/requireJson.js';

export function createMissionRoutes({ db, env, gameEngine }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  const controller = createMissionController({ current: gameEngine.missionCurrent, reroll: gameEngine.rerollMission });
  router.get('/', controller.list);
  router.post('/:slot/reroll', requireJson, controller.reroll);
  return router;
}
