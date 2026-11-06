import { createTransactionService } from '../services/transactionService.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createTransactionController(options) {
  const service = createTransactionService(options);
  return {
    create: asyncHandler(async (req, res) =>
      res.status(201).json(await service.create(req.user.id, req.body)),
    ),
    list: (req, res) => res.json(service.list(req.user.id, req.validatedQuery)),
    get: (req, res) =>
      res.json(service.get(req.user.id, req.validatedParams.id, req.validatedQuery.includeDeleted)),
    update: asyncHandler(async (req, res) =>
      res.json(await service.update(req.user.id, req.validatedParams.id, req.body)),
    ),
    delete: asyncHandler(async (req, res) => {
      await service.delete(req.user.id, req.validatedParams.id);
      res.status(204).end();
    }),
    restore: (req, res) => res.json(service.restore(req.user.id, req.validatedParams.id)),
    history: (req, res) => res.json(service.history(req.user.id, req.validatedParams.id)),
  };
}
