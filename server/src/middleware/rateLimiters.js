import { rateLimit } from 'express-rate-limit';
import { AUTH_CONFIG } from '../config/authConstants.js';

function createLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
      });
    },
  });
}

export function createAuthRateLimiters(config) {
  const limits = { ...AUTH_CONFIG, ...config };
  return {
    login: createLimiter(limits.loginRateLimit),
    register: createLimiter(limits.registerRateLimit),
    changePassword: createLimiter(limits.changePasswordRateLimit),
  };
}
