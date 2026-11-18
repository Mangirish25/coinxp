import { describe, expect, it } from 'vitest';
import { medallionSpec } from './medallionSpec';

describe('BAD-008 procedural medallion specification', () => {
  it.each(['TRACKING', 'STREAK', 'BUDGET', 'PROGRESS', 'CHALLENGE', 'HABIT'])('maps %s to its configured shape', (category) => {
    const expected = { TRACKING: 'hexagon', STREAK: 'flame', BUDGET: 'shield', PROGRESS: 'star', CHALLENGE: 'notched', HABIT: 'squircle' }[category];
    expect(medallionSpec({ slug: 'habit_example', category, tier: 1, rarity: 'COMMON', state: 'UNLOCKED', progressBps: 5000 }).shape).toBe(expected);
  });
  it('masks hidden identity and progress while preserving a neutral lock state', () => {
    expect(medallionSpec({ slug: 'secret_name', category: 'HABIT', tier: 4, rarity: 'LEGENDARY', state: 'HIDDEN_LOCKED', progressBps: 8900 }))
      .toMatchObject({ accessibleLabel: 'Locked badge', shape: 'shield', progressBps: 0, locked: true, hidden: true, filledPips: 0 });
  });
  it('maps all public sizes and disables ambient effects in reduced or low quality modes', () => {
    for (const [size, pixels] of [['sm', 32], ['md', 64], ['lg', 120], ['xl', 220]] as const) {
      expect(medallionSpec({ slug: 'first_step', category: 'TRACKING', tier: 1, rarity: 'RARE', state: 'NEW', progressBps: 2300, size }).size).toBe(pixels);
    }
    expect(medallionSpec({ slug: 'rare', category: 'TRACKING', tier: 1, rarity: 'EPIC', state: 'UNLOCKED', progressBps: 1000, size: 'xl', mode: 'REDUCED' })).toMatchObject({ motion: false, orbitCount: 0, sheen: false });
    expect(medallionSpec({ slug: 'rare', category: 'TRACKING', tier: 1, rarity: 'EPIC', state: 'UNLOCKED', progressBps: 1000, size: 'xl', quality: 'LOW' })).toMatchObject({ motion: false, orbitCount: 0, glow: 0 });
  });
});
