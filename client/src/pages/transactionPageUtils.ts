import { rupeesToPaise } from '../utils/money';

export function validateTransactionForm(
  amount: string,
  description: string,
  categoryId: string,
  date: string,
  timezone: string,
) {
  if (!categoryId) return 'Choose a category.';
  let paise: number;
  try {
    paise = rupeesToPaise(amount);
  } catch {
    return 'Enter a valid amount with no more than two decimal places.';
  }
  if (paise <= 0 || paise > 10_000_000_000)
    return 'Enter an amount from ₹0.01 to ₹10,00,00,000.00.';
  if (description.trim().length > 200) return 'Description must be 200 characters or fewer.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
    return 'Enter a valid calendar date.';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const today = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (parsed.toISOString().slice(0, 10) !== date) return 'Enter a valid calendar date.';
  const [year, month, day] = today.split('-').map(Number);
  const future = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const oldest = new Date(Date.UTC(year - 5, month - 1, day)).toISOString().slice(0, 10);
  if (date > future) return 'Transaction date cannot be more than one day in the future.';
  if (date < oldest) return 'Transaction date cannot be more than five years ago.';
  return '';
}

export function withTransactionFilter(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params);
  if (value) next.set(key, value);
  else next.delete(key);
  next.delete('page');
  return next;
}
