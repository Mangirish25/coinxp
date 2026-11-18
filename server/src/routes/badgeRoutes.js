import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createBadgeController } from '../controllers/badgeController.js';

export function createBadgeRoutes({ db, env, gameEngine }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret }));
  router.get('/', createBadgeController(gameEngine).catalog);
  return router;
}
