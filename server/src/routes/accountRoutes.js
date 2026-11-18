import { Router } from 'express';
import { createAccountController } from '../controllers/accountController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function createAccountRoutes({ db, env, clock }) {
  const router = Router();
  router.use(requireAuth({ db, secret: env.jwtSecret, env }));
  router.get('/export', createAccountController({ db, clock }).export);
  return router;
}
