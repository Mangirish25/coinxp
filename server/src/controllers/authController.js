import { AUTH_CONFIG } from '../config/authConstants.js';
import { createAuthService } from '../services/authService.js';

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function cookieOptions(env) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
    maxAge: AUTH_CONFIG.cookieMaxAgeMs,
  };
}

export function createAuthController({ db, env }) {
  const auth = createAuthService({ db, secret: env.jwtSecret });
  const setCookie = (res, token) => res.cookie(AUTH_CONFIG.cookieName, token, cookieOptions(env));

  return {
    register: asyncHandler(async (req, res) => {
      const result = await auth.register(req.body);
      setCookie(res, result.token);
      res.status(201).json(result.user);
    }),
    login: asyncHandler(async (req, res) => {
      const result = await auth.login(req.body);
      setCookie(res, result.token);
      res.status(200).json(result.user);
    }),
    logout(_req, res) {
      const options = cookieOptions(env);
      delete options.maxAge;
      res.clearCookie(AUTH_CONFIG.cookieName, options);
      res.status(204).end();
    },
    me(req, res) {
      res.json(req.user);
    },
  };
}
