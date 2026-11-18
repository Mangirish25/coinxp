import { Router } from 'express';
import { healthController } from '../controllers/healthController.js';
import { getReadiness, getHealthDetails } from '../services/healthService.js';
import { timingSafeEqual } from 'node:crypto';

export function createHealthRoutes(db, gameEngine, { env = {}, getScheduler = () => null } = {}) {
  const router = Router();
  router.get('/health', healthController(db, gameEngine));
  router.get('/ready', (_req, res) => {
    const result = getReadiness(db, { scheduler: getScheduler()?.getStatus?.(), schedulerRequired: env.schedulerEnabled === true && env.gamificationEnabled !== false });
    res.status(result.ready ? 200 : 503).json(result);
  });
  router.get('/health/details', (req, res) => {
    if (!env.opsHealthToken) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested endpoint was not found.' } });
    const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const expected = Buffer.from(env.opsHealthToken);
    const actual = Buffer.from(provided);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Operations token required.' } });
    }
    return res.json(getHealthDetails(db, { dbPath: env.dbPath, scheduler: getScheduler()?.getStatus?.() }));
  });
  return router;
}
