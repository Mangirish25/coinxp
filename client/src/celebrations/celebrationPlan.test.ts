import { describe, expect, it } from 'vitest';
import { celebrationPlan, type CelebrationNotice } from './celebrationPlan';

const item = (id: number, code: string, data: Record<string, unknown> = {}, kind = 'REWARD'): CelebrationNotice => ({ id, code, data, kind, createdAt: `2026-11-18T00:00:0${id}.000Z` });
const all = { celebrations: 'ALL' as const, mutedCategories: [] };

describe('NOT-005 bounded celebration planning', () => {
  it('caps full-screen items at two, applies priority and keeps timeline order', () => {
    const plan = celebrationPlan([item(1, 'BADGE_UNLOCKED', { rarity: 'RARE', xp: 12 }), item(2, 'STREAK_MILESTONE_REACHED', { milestone: 30 }), item(3, 'CHALLENGE_COMPLETED')], all);
    expect(plan.fullScreen.map(({ notice }) => notice.id)).toEqual([2, 3]);
    expect(plan.recap.map(({ notice }) => notice.id)).toEqual([1]);
    expect(plan.totalDurationMs).toBeLessThanOrEqual(8000);
  });
  it('demotes items when the sequence duration would exceed the cap', () => {
    const items = [item(1, 'STREAK_MILESTONE', { milestone: 365 }), item(2, 'STREAK_MILESTONE', { milestone: 365 }), item(3, 'STREAK_MILESTONE', { milestone: 365 })];
    const plan = celebrationPlan(items, all);
    expect(plan.fullScreen).toHaveLength(2);
    expect(plan.recap).toHaveLength(1);
    expect(plan.totalDurationMs).toBeLessThanOrEqual(8000);
  });
  it('honors muted categories, MAJOR and OFF settings', () => {
    const items = [item(1, 'MISSION_COMPLETED'), item(2, 'BADGE_UNLOCKED', { rarity: 'RARE' }), item(3, 'STREAK_MILESTONE', { milestone: 3 }, 'STREAK')];
    const muted = celebrationPlan(items, { ...all, mutedCategories: ['STREAK'] });
    expect(muted.fullScreen.map(({ notice }) => notice.id)).toEqual([2]);
    expect(muted.recap.map(({ notice }) => notice.id)).toContain(3);
    expect(celebrationPlan(items, { celebrations: 'MAJOR', mutedCategories: [] }).fullScreen.map(({ notice }) => notice.id)).toEqual([2]);
    const summaryOnly = celebrationPlan(items, { celebrations: 'OFF', mutedCategories: [] });
    expect(summaryOnly.fullScreen).toHaveLength(0);
    expect(summaryOnly.recap.map(({ notice }) => notice.id)).toEqual([1, 2, 3]);
  });
  it('keeps failures and reversals calm and excludes untrusted money fields from totals', () => {
    const plan = celebrationPlan([item(1, 'STREAK_BROKEN', { amount: 90000, xp: 0 }, 'STREAK'), item(2, 'XP_REVERSED_LIMIT', { balance: 500, xpDelta: -5 }, 'XP_CHANGE')], all);
    expect(plan.fullScreen).toHaveLength(0);
    expect(plan.xpTotal).toBe(-5);
  });
});
