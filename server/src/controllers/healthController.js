import { getHealth } from '../services/healthService.js';

export function healthController(db, gameEngine) {
  return (_req, res, next) => {
    try {
      res.json(getHealth(db, () => new Date(), gameEngine));
    } catch (error) {
      next(error);
    }
  };
}
