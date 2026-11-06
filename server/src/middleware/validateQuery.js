import { httpError } from '../utils/httpError.js';

export function validateQuery(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(httpError(400, 'VALIDATION_ERROR', result.error.issues[0].message));
    }
    req.validatedQuery = result.data;
    next();
  };
}
