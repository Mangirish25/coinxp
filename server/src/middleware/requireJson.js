import { httpError } from '../utils/httpError.js';

export function requireJson(req, _res, next) {
  if (!req.is('application/json')) {
    return next(httpError(415, 'JSON_REQUIRED', 'Send this request as application/json.'));
  }
  next();
}
