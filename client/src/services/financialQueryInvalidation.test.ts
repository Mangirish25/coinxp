import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryObserver } from '@tanstack/react-query';
import { transactionApi } from './transactionApi';
import { budgetApi } from './budgetApi';
import { queryClient } from './queryClient';

describe('dashboard and analytics query invalidation', () => {
  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });
  it('refetches active dashboard and analytics queries after transaction and budget mutations', async () => {
    let calls = 0;
    let resolveRefresh: () => void = () => {};
    const refreshed = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const observer = new QueryObserver(queryClient, {
      queryKey: ['dashboard', 'summary', '2026-11'],
      queryFn: async () => ++calls,
    });
    const unsubscribe = observer.subscribe((result) => {
      if (result.isSuccess && calls >= 2) resolveRefresh();
    });
    await observer.refetch();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) }),
    );
    await transactionApi.create({});
    await refreshed;
    const analyticsObserver = new QueryObserver(queryClient, {
      queryKey: ['analytics', 'breakdown', 'a', 'b'],
      queryFn: async () => ++calls,
    });
    const analyticsUnsubscribe = analyticsObserver.subscribe(() => undefined);
    await analyticsObserver.refetch();
    await budgetApi.save({ scope: 'monthly_total', amount: '10.00' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBeGreaterThanOrEqual(4);
    unsubscribe();
    analyticsUnsubscribe();
  });
});
