import { describe, expect, it } from 'vitest';
import {
  allocateShares,
  averageDailyPaise,
  calculateExpenseChangeBps,
  calculateSavingsRateBps,
  selectBusiestAndCheapest,
  zeroFillDays,
  zeroFillMonths,
} from './analyticsCalculator.js';

describe('analyticsCalculator', () => {
  it('allocates largest-remainder shares to exactly 10000 basis points', () => {
    const equal = allocateShares(
      [
        { id: 1, amountPaise: 1 },
        { id: 2, amountPaise: 1 },
        { id: 3, amountPaise: 1 },
      ],
      { id: (item) => item.id },
    );
    expect(equal.map((item) => item.shareBps)).toEqual([3334, 3333, 3333]);
    expect(equal.reduce((sum, item) => sum + item.shareBps, 0)).toBe(10000);
    expect(allocateShares([{ id: 1, amountPaise: 90 }])[0].shareBps).toBe(10000);
    expect(allocateShares([])).toEqual([]);
  });

  it('zero fills day ranges across months and leap February', () => {
    const rows = zeroFillDays('2024-02-28', '2024-03-01', [
      { date: '2024-02-29', expensePaise: 100, incomePaise: 0 },
    ]);
    expect(rows.map((row) => row.date)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
    expect(rows[0].expensePaise).toBe(0);
    expect(zeroFillDays('2025-01-01', '2025-01-01', [])[0]).toMatchObject({
      expensePaise: 0,
      incomePaise: 0,
    });
  });

  it('zero fills month buckets and returns net paise', () => {
    expect(
      zeroFillMonths('2024-12', 3, [{ month: '2025-01', incomePaise: 1000, expensePaise: 400 }]),
    ).toEqual([
      { month: '2024-12', incomePaise: 0, expensePaise: 0, netPaise: 0 },
      { month: '2025-01', incomePaise: 1000, expensePaise: 400, netPaise: 600 },
      { month: '2025-02', incomePaise: 0, expensePaise: 0, netPaise: 0 },
    ]);
  });

  it('calculates averages, savings rate, and comparison against a zero previous value', () => {
    expect(averageDailyPaise(1001, 3)).toBe(333);
    expect(averageDailyPaise(100, 0)).toBe(0);
    expect(calculateSavingsRateBps(-500, 1000)).toBe(-5000);
    expect(calculateSavingsRateBps(0, 0)).toBeNull();
    expect(calculateExpenseChangeBps(100, 0)).toBeNull();
    expect(calculateExpenseChangeBps(120, 100)).toBe(2000);
  });

  it('breaks busiest and cheapest ties by earliest date', () => {
    const days = [
      { date: '2025-02-03', expensePaise: 200 },
      { date: '2025-02-01', expensePaise: 100 },
      { date: '2025-02-02', expensePaise: 200 },
      { date: '2025-02-04', expensePaise: 0 },
    ];
    expect(selectBusiestAndCheapest(days)).toMatchObject({
      busiestDay: { date: '2025-02-02' },
      cheapestNonZeroDay: { date: '2025-02-01' },
    });
    expect(selectBusiestAndCheapest([{ date: '2025-01-01', expensePaise: 0 }])).toEqual({
      busiestDay: null,
      cheapestNonZeroDay: null,
    });
  });
});
