import { httpError } from '../utils/httpError.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(httpError(400, 'VALIDATION_ERROR', result.error.issues[0].message));
    }
    req.body = result.data;
    next();
  };
}
