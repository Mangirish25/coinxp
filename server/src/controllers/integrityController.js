import { createIntegrityService } from '../services/integrityService.js';

export function createIntegrityController(options) {
  const service = createIntegrityService(options);
  return {
    status: (req,res) => res.json(service.status(req.user.id)),
    notices: (req,res) => res.json(service.notices(req.user.id,req.validatedQuery)),
    acknowledge: (req,res) => res.json(service.acknowledge(req.user.id,req.body.upToId)),
    appeal: (req,res) => res.status(201).json(service.appeal(req.user.id,req.body.message)),
  };
}
