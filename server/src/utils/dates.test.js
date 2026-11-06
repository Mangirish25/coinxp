import { describe, expect, it } from 'vitest';
import { isValidDateString, nowIso, todayInTimezone } from './dates.js';

describe('date utilities', () => {
  it('validates real ISO calendar dates', () => {
    expect(isValidDateString('2024-02-29')).toBe(true);
    expect(isValidDateString('2025-02-29')).toBe(false);
    expect(isValidDateString('2025-13-01')).toBe(false);
    expect(isValidDateString('2025-1-01')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });

  it('returns a YYYY-MM-DD date in the requested timezone', () => {
    expect(todayInTimezone('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => todayInTimezone('Not/AZone')).toThrow(RangeError);
  });

  it('returns an ISO UTC timestamp', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
