import { apiFetch } from './api';
import type { DashboardSummary } from '../types/analytics';

export const dashboardApi = {
  summary(month: string) {
    return apiFetch<DashboardSummary>(`/api/dashboard/summary?month=${encodeURIComponent(month)}`);
  },
};
