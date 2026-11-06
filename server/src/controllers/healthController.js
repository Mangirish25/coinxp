import { getHealth } from '../services/healthService.js';

export function healthController(db) {
  return (_req, res, next) => {
    try {
      res.json(getHealth(db));
    } catch (error) {
      next(error);
    }
  };
}
