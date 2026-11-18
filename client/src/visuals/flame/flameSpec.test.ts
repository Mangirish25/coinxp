import { describe, expect, it } from 'vitest';
import { flameBandFor, flameSpec, seededOffsets } from './flameSpec';

describe('STR-011 flame band boundaries', () => {
  it.each([[1, 'ember'], [2, 'ember'], [3, 'small'], [6, 'small'], [7, 'medium'], [13, 'medium'],
    [14, 'large'], [29, 'large'], [30, 'blazing'], [99, 'blazing'], [100, 'inferno'], [364, 'inferno'], [365, 'golden']] as const)(
    'maps length %i to %s', (length, band) => expect(flameBandFor(length)?.name).toBe(band),
  );
  it('maps nonpositive values to inactive band and nonfinite lengths safely', () => {
    expect(flameBandFor(0)).toBeNull();
    expect(flameBandFor(Number.NaN)).toBeNull();
  });
});

describe('STR-011 and MOT-002 flame state visuals', () => {
  it('provides static accessible states for reduced motion and off', () => {
    for (const mode of ['REDUCED', 'OFF'] as const) {
      const spec = flameSpec({ length: 30, state: 'FROZEN', mode });
      expect(spec.animate).toBe(false);
      expect(spec.embers).toBe(0);
      expect(spec.overlay).toBe('ice');
      expect(spec.label).toBe('30-day tracking streak, protected by a freeze');
    }
  });
  it('keeps at-risk and broken states calm and non-festive', () => {
    expect(flameSpec({ length: 14, state: 'AT_RISK' })).toMatchObject({ scale: 0.9, opacity: 0.7, saturation: 0.45, shiver: true });
    expect(flameSpec({ length: 14, state: 'BROKEN' })).toMatchObject({ overlay: 'smoke', saturation: 0, animate: false, embers: 0 });
  });
  it('scales ember counts by quality and seeds particle positions deterministically', () => {
    expect(flameSpec({ length: 30, state: 'ACTIVE_TRACKED', quality: 'MEDIUM' }).embers).toBe(5);
    expect(flameSpec({ length: 30, state: 'ACTIVE_TRACKED', quality: 'LOW' }).embers).toBe(0);
    expect(seededOffsets(42, 5)).toEqual(seededOffsets(42, 5));
    expect(seededOffsets(42, 5)).not.toEqual(seededOffsets(43, 5));
  });
});
