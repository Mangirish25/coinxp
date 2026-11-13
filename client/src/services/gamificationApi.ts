import { apiFetch } from './api';
import { invalidateFinancialSummaries, queryClient } from './queryClient';
import type { GamificationLedgerPage, GamificationSummary } from '../types/gamification';

export const gamificationApi = {
  summary: () => apiFetch<GamificationSummary>('/api/gamification/summary'),
  rules: () => apiFetch<Record<string, unknown>>('/api/gamification/rules'),
  today: () => apiFetch<{ localDate: string; completed: boolean; available: boolean; blockers: string[]; trackingCredited: boolean; noSpendCapRemaining: number; hasExpense: boolean }>('/api/gamification/daily-review/today'),
  ledger(params = new URLSearchParams()) {
    return apiFetch<GamificationLedgerPage>(`/api/gamification/ledger${params.size ? `?${params}` : ''}`);
  },
  review(noSpend: boolean) {
    return apiFetch<{ review: { localDate: string; completed: boolean; xpEligible: boolean }; gamification: unknown }>('/api/gamification/daily-review', {
      method: 'POST', body: JSON.stringify({ noSpend }),
    }).then((result) => { invalidateFinancialSummaries(); if (result.gamification && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('coinxp:gamification-toast', { detail: result.gamification })); return result; });
  },
  acknowledge(upToLedgerId: number) {
    return apiFetch<{ lastSeenLedgerId: number }>('/api/gamification/feed/ack', { method: 'POST', body: JSON.stringify({ upToLedgerId }) })
      .then((result) => { void queryClient.invalidateQueries({ queryKey: ['gamification', 'summary'] }); return result; });
  },
};
