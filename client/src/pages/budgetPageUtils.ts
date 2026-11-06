import { rupeesToPaise } from '../utils/money';
import { maxBudgetPaise } from '../config/budgetConfig';

export function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function budgetPeriodForChoice(choice: 'default' | 'month', month: string) {
  return choice === 'default' ? undefined : month;
}

export function validateBudgetAmount(value: string) {
  try {
    const amountPaise = rupeesToPaise(value);
    return amountPaise <= maxBudgetPaise ? '' : 'Amount is above the permitted limit.';
  } catch {
    return 'Enter a non-negative amount with no more than two decimals.';
  }
}

export function currentMonthInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}
