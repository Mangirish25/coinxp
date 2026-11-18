import { describe, expect, it } from 'vitest';
import { streakFlameState, visibleFlameLength } from './streakVisualState';
import type { StreakSummary } from '../../types/streak';

const base: StreakSummary = {
  tracking: { status: 'NONE', current: 0, longest: 0, trackedToday: false, atRisk: false, freezeWouldProtect: false, settlingDate: null,
    nextMilestone: null, milestones: [], comeback: null },
  secondary: {}, freezes: { inventory: 0, cap: 2 }, through: '2026-11-17', recentEvents: [],
  week: [], lastPeriod: { date: '2026-11-17', status: 'NONE' }, milestones: { reached: [], next: null },
};

describe('STR-011 streak flame state mapping', () => {
  it('lights immediately for provisional activity and never shows zero on that first day', () => {
    const summary = { ...base, tracking: { ...base.tracking, trackedToday: true } };
    expect(streakFlameState(summary)).toBe('ACTIVE_TRACKED');
    expect(visibleFlameLength(summary)).toBe(1);
  });
  it('prefers settling, at-risk, frozen, broken and active states in order', () => {
    expect(streakFlameState({ ...base, tracking: { ...base.tracking, settlingDate: '2026-11-16' } })).toBe('SETTLING');
    expect(streakFlameState({ ...base, tracking: { ...base.tracking, atRisk: true } })).toBe('AT_RISK');
    expect(streakFlameState({ ...base, lastPeriod: { date: '2026-11-16', status: 'FROZEN' } })).toBe('FROZEN');
    expect(streakFlameState({ ...base, tracking: { ...base.tracking, status: 'BROKEN' } })).toBe('BROKEN');
    expect(streakFlameState({ ...base, tracking: { ...base.tracking, status: 'ACTIVE' } })).toBe('ACTIVE_UNTRACKED');
  });
});
