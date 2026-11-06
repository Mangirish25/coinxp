import { createDashboardService } from '../services/dashboardService.js';

export function createDashboardController({ db }) {
  const service = createDashboardService({ db });
  return {
    summary: (req, res) => res.json(service.summary(req.user.id, req.validatedQuery.month)),
  };
}
