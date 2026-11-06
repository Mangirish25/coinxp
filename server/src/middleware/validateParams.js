import { httpError } from '../utils/httpError.js';

export function validateParams(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(httpError(400, 'VALIDATION_ERROR', result.error.issues[0].message));
    }
    req.validatedParams = result.data;
    next();
  };
}
