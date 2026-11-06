import { createAnalyticsService } from '../services/analyticsService.js';

export function createAnalyticsController({ db }) {
  const service = createAnalyticsService({ db });
  return {
    categoryBreakdown: (req, res) =>
      res.json(service.categoryBreakdown(req.user.id, req.validatedQuery)),
    dailySpending: (req, res) => res.json(service.dailySpending(req.user.id, req.validatedQuery)),
    incomeVsExpense: (req, res) =>
      res.json(service.incomeVsExpense(req.user.id, req.validatedQuery.months)),
    monthlyReport: (req, res) =>
      res.json(service.monthlyReport(req.user.id, req.validatedQuery.month)),
  };
}
