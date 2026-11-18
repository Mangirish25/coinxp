import { Router } from 'express';
import { z } from 'zod';
import { requireJson } from '../middleware/requireJson.js';
import { validateBody } from '../middleware/validateBody.js';

const schema = z.union([
  z.object({ setTo: z.string().datetime({ offset: true }) }).strict(),
  z.object({ advanceMs: z.number().int().safe() }).strict(),
]);

export function createTestClockRoutes(clock) {
  const router = Router();
  router.post('/', requireJson, validateBody(schema), (req, res) => {
    const now = 'setTo' in req.body ? clock.set(req.body.setTo) : clock.advance(req.body.advanceMs);
    res.json({ now: now.toISOString() });
  });
  return router;
}
