import { apiFetch } from './api';
import type {
  CategoryBreakdown,
  DailySpending,
  MonthlyAggregate,
  MonthlyReport,
} from '../types/analytics';

export const analyticsApi = {
  breakdown(from: string, to: string) {
    return apiFetch<CategoryBreakdown>(`/api/analytics/category-breakdown?from=${from}&to=${to}`);
  },
  daily(from: string, to: string) {
    return apiFetch<DailySpending>(`/api/analytics/daily-spending?from=${from}&to=${to}`);
  },
  monthly(months = 6) {
    return apiFetch<MonthlyAggregate[]>(`/api/analytics/income-vs-expense?months=${months}`);
  },
  report(month: string) {
    return apiFetch<MonthlyReport>(
      `/api/analytics/monthly-report?month=${encodeURIComponent(month)}`,
    );
  },
};
