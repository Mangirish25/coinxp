import { describe, expect, it } from 'vitest';
import { BUDGET_CONFIG } from '../config/budgetConfig.js';
import {
  calculateBudget,
  calculateMonthProgress,
  calculateSafeDailySpend,
  daysInMonth,
} from './budgetCalculator.js';

const calculate = (input) =>
  calculateBudget({ ...input, warningThreshold: BUDGET_CONFIG.warningThreshold });

describe('budgetCalculator', () => {
  it.each([
    [0, 'on_track', 0],
    [7990, 'on_track', 79.9],
    [8000, 'warning', 80],
    [10000, 'warning', 100],
    [10001, 'exceeded', 100],
  ])('calculates percent and status for %i / 10000 paise', (spentPaise, status, percentUsed) => {
    const result = calculate({ budgetPaise: 10000, spentPaise });
    expect(result.status).toBe(status);
    expect(result.percentUsed).toBe(percentUsed);
  });

  it('handles zero and absent budgets without dividing by zero', () => {
    expect(calculate({ budgetPaise: 0, spentPaise: 0 })).toMatchObject({
      percentUsed: 0,
      remainingPaise: 0,
      status: 'on_track',
    });
    expect(calculate({ budgetPaise: 0, spentPaise: 1 })).toMatchObject({
      percentUsed: null,
      remainingPaise: -1,
      status: 'exceeded',
    });
    expect(calculate({ budgetPaise: null, spentPaise: 500 })).toMatchObject({
      budgetPaise: null,
      remainingPaise: null,
      percentUsed: null,
      status: 'no_budget',
    });
  });

  it('keeps large integer arithmetic exact and rounds percent to one decimal', () => {
    const budgetPaise = Number.MAX_SAFE_INTEGER;
    expect(calculate({ budgetPaise, spentPaise: budgetPaise - 1 }).remainingPaise).toBe(1);
    expect(calculate({ budgetPaise: 10000, spentPaise: 10001 }).percentUsed).toBe(100);
    expect(calculate({ budgetPaise: 10000, spentPaise: 7990 }).percentUsed).toBe(79.9);
    expect(calculate({ budgetPaise: 10000, spentPaise: 12000 }).remainingPaise).toBe(-2000);
  });

  it('calculates daily pace with integer floor for all month lengths', () => {
    expect(calculateSafeDailySpend(101, 0, 1)).toBe(101);
    expect(calculateSafeDailySpend(101, 0, 0)).toBe(0);
    expect(calculateSafeDailySpend(100, 101, 5)).toBe(0);
    expect(calculateSafeDailySpend(null, 0, 5)).toBe(0);
    for (const [month, days] of [
      ['2025-02', 28],
      ['2024-02', 29],
      ['2025-04', 30],
      ['2025-01', 31],
    ]) {
      expect(daysInMonth(month)).toBe(days);
      expect(calculateSafeDailySpend(10000, 0, days)).toBe(Math.floor(10000 / days));
    }
  });

  it('calculates past, current and future month elapsed and remaining days', () => {
    expect(calculateMonthProgress('2025-01', '2025-02-12')).toEqual({
      daysInMonth: 31,
      daysElapsed: 31,
      daysRemaining: 0,
    });
    expect(calculateMonthProgress('2025-02', '2025-02-12')).toEqual({
      daysInMonth: 28,
      daysElapsed: 11,
      daysRemaining: 17,
    });
    expect(calculateMonthProgress('2025-03', '2025-02-12')).toEqual({
      daysInMonth: 31,
      daysElapsed: 0,
      daysRemaining: 31,
    });
    expect(calculateMonthProgress('2024-02', '2024-02-29').daysInMonth).toBe(29);
  });
});
