import { httpError } from '../utils/httpError.js';

const writes = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function originGuard({ enabled, origin }) {
  return (req, _res, next) => {
    if (!enabled || !writes.has(req.method)) return next();
    let supplied = req.get('origin');
    if (!supplied && req.get('referer')) {
      try { supplied = new URL(req.get('referer')).origin; } catch { supplied = null; }
    }
    if (!supplied || supplied !== origin) return next(httpError(403, 'ORIGIN_REJECTED', 'This request origin is not allowed.'));
    next();
  };
}
