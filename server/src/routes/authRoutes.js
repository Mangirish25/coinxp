import { Router } from 'express';
import { AUTH_CONFIG } from '../config/authConstants.js';
import { createAuthController } from '../controllers/authController.js';
import { createAuthRateLimiters } from '../middleware/rateLimiters.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { changePasswordSchema, loginSchema, logoutSchema, registerSchema } from '../validators/authSchemas.js';
import { z } from 'zod';

export function createAuthRoutes({ db, env, rateLimits = AUTH_CONFIG, gameEngine }) {
  const router = Router();
  const controller = createAuthController({ db, env, gameEngine });
  const limiters = createAuthRateLimiters(rateLimits);
  const authenticated = requireAuth({ db, secret: env.jwtSecret, env });

  router.post(
    '/register',
    limiters.register,
    requireJson,
    validateBody(registerSchema),
    controller.register,
  );
  router.post('/login', limiters.login, requireJson, validateBody(loginSchema), controller.login);
  router.post('/logout', requireJson, validateBody(logoutSchema), controller.logout);
  router.get('/me', authenticated, controller.me);
  router.patch('/timezone', authenticated, requireJson, validateBody(z.object({ timezone: z.string().min(1).max(100) })), controller.timezone);
  router.post('/change-password', limiters.changePassword, authenticated, requireJson, validateBody(changePasswordSchema), controller.changePassword);
  return router;
}
