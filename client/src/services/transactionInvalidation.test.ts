import { afterEach, describe, expect, it, vi } from 'vitest';
import { transactionApi } from './transactionApi';
import { subscribeBudgetStatusInvalidation } from './budgetInvalidation';

describe('transaction budget invalidation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refreshes budget subscribers after transaction create, edit, delete, and restore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    const invalidated = vi.fn();
    const unsubscribe = subscribeBudgetStatusInvalidation(invalidated);
    await transactionApi.create({});
    await transactionApi.update(1, {});
    await transactionApi.delete(1);
    await transactionApi.restore(1);
    unsubscribe();
    expect(invalidated).toHaveBeenCalledTimes(4);
  });
});
