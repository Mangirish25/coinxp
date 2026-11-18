import { describe, expect, it } from 'vitest';
import { freshStartDate, metricValue } from './metrics.js';
import rules from '../rules.config.js';

describe('Part 9 badge metric helpers', () => {
  it('BAD-003: detects a fresh start only after the configured gap and tracked run', () => {
    const prior = Array.from({ length: 14 }, (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`);
    const resumed = [...prior, '2026-03-01', '2026-03-02', '2026-03-03'];
    expect(freshStartDate(resumed, rules.rewards.metrics.freshStart, rules.units)).toBe('2026-03-01');
    expect(metricValue('FRESH_START', { trackedDates: resumed }, rules)).toBe(1);
    expect(freshStartDate([...prior, '2026-02-01', '2026-02-02', '2026-02-03'], rules.rewards.metrics.freshStart, rules.units)).toBeNull();
  });

  it('validates count metrics as non-negative safe integers', () => {
    expect(metricValue('LEVEL', { LEVEL: 4 }, rules)).toBe(4);
    expect(() => metricValue('LEVEL', { LEVEL: -1 }, rules)).toThrow(/non-negative safe integer/);
    expect(() => metricValue('LEVEL', { LEVEL: 1.5 }, rules)).toThrow(/non-negative safe integer/);
  });
});
