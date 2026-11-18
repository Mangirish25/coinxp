import { createIntegrityService } from '../services/integrityService.js';

export function createCelebrationController(options) {
  const service = createIntegrityService(options);
  return {
    pending: (req, res) => res.json(service.pendingCelebrations(req.user.id)),
    claim: (req, res) => res.json(service.claimCelebrations(req.user.id)),
    acknowledge: (req, res) => res.json(service.acknowledge(req.user.id, req.body.upToId)),
  };
}
