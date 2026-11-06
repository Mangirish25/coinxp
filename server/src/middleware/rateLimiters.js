import { rateLimit } from 'express-rate-limit';

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
  return {
    login: createLimiter(config.loginRateLimit),
    register: createLimiter(config.registerRateLimit),
  };
}
