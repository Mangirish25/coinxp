import { Router } from 'express';
import { AUTH_CONFIG } from '../config/authConstants.js';
import { createAuthController } from '../controllers/authController.js';
import { createAuthRateLimiters } from '../middleware/rateLimiters.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';
import { loginSchema, logoutSchema, registerSchema } from '../validators/authSchemas.js';

export function createAuthRoutes({ db, env, rateLimits = AUTH_CONFIG }) {
  const router = Router();
  const controller = createAuthController({ db, env });
  const limiters = createAuthRateLimiters(rateLimits);
  const authenticated = requireAuth({ db, secret: env.jwtSecret });

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
  return router;
}
