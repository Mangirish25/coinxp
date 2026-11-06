import { Router } from 'express';
import { healthController } from '../controllers/healthController.js';

export function createHealthRoutes(db) {
  const router = Router();
  router.get('/health', healthController(db));
  return router;
}
