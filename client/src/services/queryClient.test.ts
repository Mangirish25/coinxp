// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidateFinancialSummaries, queryClient } from './queryClient';

describe('Part 9 reward cache invalidation',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('invalidates financial and reward read models and refreshes the notice center',()=>{
    const invalidate=vi.spyOn(queryClient,'invalidateQueries').mockResolvedValue();
    const event=vi.fn(); window.addEventListener('coinxp:integrity-refresh',event);
    invalidateFinancialSummaries();
    const keys=invalidate.mock.calls.map(([filters])=>filters?.queryKey?.[0]);
    expect(keys).toEqual(expect.arrayContaining(['dashboard','analytics','budgets','missions','badges','shop','profile','activity','challenges']));
    expect(event).toHaveBeenCalledOnce(); window.removeEventListener('coinxp:integrity-refresh',event);
  });
});
