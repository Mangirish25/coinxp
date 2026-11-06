import { describe, expect, it } from 'vitest';
import { formatINR, paiseToRupees, rupeesToPaise } from './money.js';

describe('money utilities', () => {
  it('converts decimal strings exactly without floating-point multiplication', () => {
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise('0.2')).toBe(20);
    expect(rupeesToPaise('250.50')).toBe(25050);
    expect(rupeesToPaise(0.1)).toBe(10);
  });

  it.each(['250.505', '-1', '', ' ', '1e3', '1.'])('rejects invalid amount %j', (input) => {
    expect(() => rupeesToPaise(input)).toThrow();
  });

  it('rejects values beyond the safe integer paise range', () => {
    expect(() => rupeesToPaise('90071992547410')).toThrow(RangeError);
  });

  it('formats and converts paise with Indian digit grouping', () => {
    expect(paiseToRupees(125050)).toBe('1250.50');
    expect(formatINR(125050)).toBe('₹1,250.50');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(-105)).toBe('-₹1.05');
  });
});
