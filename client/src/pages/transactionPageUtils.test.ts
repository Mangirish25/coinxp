import { describe, expect, it } from 'vitest';
import { validateTransactionForm, withTransactionFilter } from './transactionPageUtils';

describe('transaction page helpers', () => {
  it('validates exact rupee input and required form fields', () => {
    expect(validateTransactionForm('250.505', '', '1', '2024-02-29', 'Asia/Kolkata')).toMatch(
      /two decimal/,
    );
    expect(validateTransactionForm('-2', '', '1', '2024-02-29', 'Asia/Kolkata')).toMatch(/amount/);
    expect(validateTransactionForm('0.10', '', '', '2024-02-29', 'Asia/Kolkata')).toBe(
      'Choose a category.',
    );
    expect(validateTransactionForm('0.10', '', '1', '2024-02-30', 'Asia/Kolkata')).toMatch(
      /calendar date/,
    );
    expect(validateTransactionForm('250.50', 'ok', '1', '2024-02-29', 'Asia/Kolkata')).toBe('');
  });

  it('keeps filters shareable and resets pagination when a filter changes', () => {
    const next = withTransactionFilter(
      new URLSearchParams('type=expense&page=4&q=tea'),
      'from',
      '2025-01-01',
    );
    expect(next.get('type')).toBe('expense');
    expect(next.get('from')).toBe('2025-01-01');
    expect(next.has('page')).toBe(false);
    expect(next.get('q')).toBe('tea');
  });
});
