import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createMissionController } from '../controllers/missionController.js';
import { requireJson } from '../middleware/requireJson.js';
import { z } from 'zod';
import { validateQuery } from '../middleware/validateQuery.js';

const historyQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();

export function createMissionRoutes({ db, env, gameEngine }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret, env }));
  const controller = createMissionController({ current: gameEngine.missionCurrent, history: gameEngine.missionHistory, reroll: gameEngine.rerollMission });
  router.get('/', controller.list);
  router.get('/history',validateQuery(historyQuery),controller.history);
  router.post('/:slot/reroll', requireJson, controller.reroll);
  return router;
}
