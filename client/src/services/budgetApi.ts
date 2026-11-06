import { apiFetch } from './api';
import type {
  BudgetRow,
  BudgetScope,
  BudgetStatusResult,
  DailyBudgetStatus,
} from '../types/budget';
import { invalidateFinancialSummaries } from './queryClient';

export const budgetApi = {
  list(params = new URLSearchParams()) {
    return apiFetch<BudgetRow[]>(`/api/budgets${params.size ? `?${params}` : ''}`);
  },
  status(month: string) {
    return apiFetch<BudgetStatusResult>(`/api/budgets/status?month=${encodeURIComponent(month)}`);
  },
  dailyStatus() {
    return apiFetch<DailyBudgetStatus>('/api/budgets/daily-status');
  },
  save(input: { scope: BudgetScope; amount: string; categoryId?: number; month?: string }) {
    return apiFetch<BudgetRow>('/api/budgets', { method: 'PUT', body: JSON.stringify(input) }).then(
      (result) => {
        invalidateFinancialSummaries();
        return result;
      },
    );
  },
  delete(id: number) {
    return apiFetch<void>(`/api/budgets/${id}`, { method: 'DELETE', body: '{}' }).then((result) => {
      invalidateFinancialSummaries();
      return result;
    });
  },
};
