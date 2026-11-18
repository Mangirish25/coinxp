import jwt from 'jsonwebtoken';
import { authCookieName } from '../config/authConstants.js';
import { createAuthService } from '../services/authService.js';
import { httpError } from '../utils/httpError.js';

export function requireAuth({ db, secret, env }) {
  const auth = createAuthService({ db, secret });
  return (req, _res, next) => {
    const token = req.cookies?.[authCookieName(env)];
    if (!token) return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));

    let payload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    }

    if (
      !payload ||
      typeof payload === 'string' ||
      typeof payload.sub !== 'string' ||
      !/^\d+$/.test(payload.sub)
    ) {
      return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    }
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    }

    if (payload.ver !== undefined && (!Number.isSafeInteger(payload.ver) || payload.ver < 0)) {
      return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    }
    const session = auth.findSessionUserById(userId);
    if (!session || session.tokenVersion !== (payload.ver ?? 0)) {
      return next(httpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
    }
    req.user = session.user;
    next();
  };
}
