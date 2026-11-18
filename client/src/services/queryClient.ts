import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

export function invalidateFinancialSummaries() {
  for (const key of ['dashboard','analytics','budgets','gamification','streaks','badges','missions','shop','profile','activity','challenges']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('coinxp:integrity-refresh'));
}
