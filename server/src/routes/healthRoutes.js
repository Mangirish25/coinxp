import { Router } from 'express';
import { healthController } from '../controllers/healthController.js';

export function createHealthRoutes(db, gameEngine) {
  const router = Router();
  router.get('/health', healthController(db, gameEngine));
  return router;
}
