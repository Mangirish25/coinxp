import { apiFetch } from './api';
import type { AuditEntry, Transaction, TransactionList } from '../types/transaction';
import { invalidateBudgetStatus } from './budgetInvalidation';
import { invalidateFinancialSummaries } from './queryClient';

function invalidateTransactions() {
  invalidateBudgetStatus();
  invalidateFinancialSummaries();
}

export const transactionApi = {
  list(params: URLSearchParams) {
    return apiFetch<TransactionList>(`/api/transactions${params.size ? `?${params}` : ''}`);
  },
  get(id: number) {
    return apiFetch<Transaction>(`/api/transactions/${id}`);
  },
  create(body: unknown) {
    return apiFetch<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((result) => {
      invalidateTransactions();
      return result;
    });
  },
  update(id: number, body: unknown) {
    return apiFetch<Transaction>(`/api/transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then((result) => {
      invalidateTransactions();
      return result;
    });
  },
  delete(id: number) {
    return apiFetch<void>(`/api/transactions/${id}`, { method: 'DELETE', body: '{}' }).then(
      (result) => {
        invalidateTransactions();
        return result;
      },
    );
  },
  restore(id: number) {
    return apiFetch<Transaction>(`/api/transactions/${id}/restore`, {
      method: 'POST',
      body: '{}',
    }).then((result) => {
      invalidateTransactions();
      return result;
    });
  },
  history(id: number) {
    return apiFetch<AuditEntry[]>(`/api/transactions/${id}/history`);
  },
};
