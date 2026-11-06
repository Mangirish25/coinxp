import { createBudgetService } from '../services/budgetService.js';
import { paiseToRupees } from '../utils/money.js';

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createBudgetController({ db }) {
  const service = createBudgetService({ db });
  return {
    upsert: asyncHandler(async (req, res) => {
      const row = await service.upsert(req.user.id, req.body);
      res.json({ ...row, amount: paiseToRupees(row.amountPaise) });
    }),
    list: (req, res) => res.json(service.list(req.user.id, req.validatedQuery)),
    remove: asyncHandler(async (req, res) => {
      await service.delete(req.user.id, req.validatedParams.id);
      res.status(204).end();
    }),
    status: (req, res) => res.json(service.status(req.user.id, req.validatedQuery.month)),
    dailyStatus: (req, res) => res.json(service.dailyStatus(req.user.id, req.validatedQuery.date)),
  };
}
