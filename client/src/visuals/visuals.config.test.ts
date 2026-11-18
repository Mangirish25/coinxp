import { describe, expect, it } from 'vitest';
import { adaptQuality, initialQualityFor, motionTokens, type QualityTier } from './visuals.config';

describe('MOT-001 motion tokens', () => {
  it('keeps finite, increasing duration tokens', () => {
    const values = Object.values(motionTokens.duration);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

describe('MOT-003 device quality and adaptive sampler', () => {
  it.each([
    [{ deviceMemory: 4, hardwareConcurrency: 4 }, 'HIGH'],
    [{ deviceMemory: 8, hardwareConcurrency: 2 }, 'MEDIUM'],
    [{ deviceMemory: 2, hardwareConcurrency: 8 }, 'MEDIUM'],
    [{ deviceMemory: 1, hardwareConcurrency: 8 }, 'LOW'],
    [{ deviceMemory: 8, hardwareConcurrency: 8, reducedData: true }, 'MEDIUM'],
    [{}, 'LOW'],
  ] as const)('selects the expected initial ceiling for %o', (input, expected) => {
    expect(initialQualityFor(input)).toBe(expected);
  });

  it('downgrades on slow median frames and never upgrades above the initial ceiling', () => {
    expect(adaptQuality('HIGH', [10, 27, 28, 29, 30], 'HIGH')).toBe('MEDIUM');
    expect(adaptQuality('MEDIUM', [10, 10, 10, 10], 'MEDIUM')).toBe('MEDIUM');
    expect(adaptQuality('MEDIUM', [10, 10, 10, 10], 'HIGH')).toBe('HIGH');
    expect(adaptQuality('LOW', [], 'HIGH')).toBe('LOW');
  });

  it('supports each tier as a ceiling', () => {
    const tiers: QualityTier[] = ['LOW', 'MEDIUM', 'HIGH'];
    for (const ceiling of tiers) {
      const next = adaptQuality(ceiling, [1, 1, 1], ceiling);
      expect(tiers.indexOf(next)).toBeLessThanOrEqual(tiers.indexOf(ceiling));
    }
  });
});
