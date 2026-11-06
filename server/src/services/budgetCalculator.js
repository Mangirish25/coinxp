function integer(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be a non-negative safe integer.`);
}

export function calculateBudget({ budgetPaise, spentPaise, warningThreshold }) {
  integer(spentPaise, 'spentPaise');
  if (budgetPaise === null || budgetPaise === undefined) {
    return {
      budgetPaise: null,
      spentPaise,
      remainingPaise: null,
      percentUsed: null,
      status: 'no_budget',
    };
  }
  integer(budgetPaise, 'budgetPaise');
  if (!Number.isInteger(warningThreshold) || warningThreshold < 0 || warningThreshold > 100)
    throw new TypeError('warningThreshold must be an integer from 0 to 100.');
  const remainingPaise = budgetPaise - spentPaise;
  const percentUsed =
    budgetPaise === 0
      ? spentPaise === 0
        ? 0
        : null
      : Number((BigInt(spentPaise) * 1000n + BigInt(budgetPaise) / 2n) / BigInt(budgetPaise)) / 10;
  const status =
    spentPaise > budgetPaise
      ? 'exceeded'
      : budgetPaise === 0
        ? 'on_track'
        : BigInt(spentPaise) * 100n < BigInt(budgetPaise) * BigInt(warningThreshold)
          ? 'on_track'
          : 'warning';
  return { budgetPaise, spentPaise, remainingPaise, percentUsed, status };
}

export function calculateSafeDailySpend(budgetPaise, spentPaise, daysRemaining) {
  if (budgetPaise === null || budgetPaise === undefined) return 0;
  integer(budgetPaise, 'budgetPaise');
  integer(spentPaise, 'spentPaise');
  if (!Number.isSafeInteger(daysRemaining) || daysRemaining < 0)
    throw new TypeError('daysRemaining must be a non-negative safe integer.');
  if (daysRemaining === 0 || spentPaise >= budgetPaise) return 0;
  return Number((BigInt(budgetPaise) - BigInt(spentPaise)) / BigInt(daysRemaining));
}

export function daysInMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new TypeError('month must use YYYY-MM format.');
  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(monthNumber) ? 30 : 31;
}

export function calculateMonthProgress(month, today) {
  const days = daysInMonth(month);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new TypeError('today must use YYYY-MM-DD format.');
  const todayMonthDays = daysInMonth(today.slice(0, 7));
  const todayDay = Number(today.slice(8, 10));
  if (todayDay < 1 || todayDay > todayMonthDays)
    throw new TypeError('today is not a valid calendar date.');
  const currentMonth = today.slice(0, 7);
  if (month < currentMonth) return { daysInMonth: days, daysElapsed: days, daysRemaining: 0 };
  if (month > currentMonth) return { daysInMonth: days, daysElapsed: 0, daysRemaining: days };
  // Elapsed days are completed days; remaining includes today for pacing.
  return { daysInMonth: days, daysElapsed: todayDay - 1, daysRemaining: days - todayDay + 1 };
}
