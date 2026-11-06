import { describe, expect, it } from 'vitest';
import { budgetPeriodForChoice, shiftMonth, validateBudgetAmount } from './budgetPageUtils';

describe('budget page helpers', () => {
  it('moves the month selector across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('maps default and month-only choices to the API month value', () => {
    expect(budgetPeriodForChoice('default', '2026-11')).toBeUndefined();
    expect(budgetPeriodForChoice('month', '2026-11')).toBe('2026-11');
  });
  it('validates decimal rupee input without float conversion', () => {
    expect(validateBudgetAmount('250.50')).toBe('');
    expect(validateBudgetAmount('250.505')).toMatch(/two decimals/);
    expect(validateBudgetAmount('-1')).toMatch(/non-negative/);
    expect(validateBudgetAmount('100000001')).toMatch(/permitted limit/);
  });
});
