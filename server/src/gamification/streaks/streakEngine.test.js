import { describe, expect, it } from 'vitest';
import rules from '../rules.config.js';
import { computeNext, computeChain, initialTrackingState } from './streakEngine.js';

function step(state, date, input = {}) {
  return computeNext(state, { date, tracked: false, exempt: false, freezeInventory: 0, runId: `run-${date}`, ...input }, rules);
}

describe('Part 7 pure streak engine', () => {
  it('STR-002 starts and continues from XP-tracked labels only', () => {
    let state = initialTrackingState();
    state = step(state, '2026-11-01', { tracked: true }).state;
    state = step(state, '2026-11-02', { tracked: true }).state;
    expect(state.currentLength).toBe(2);
    expect(state.longest).toBe(2);
  });

  it('STR-004 consumes a freeze without increasing length and breaks on the third missed day', () => {
    let state = initialTrackingState();
    for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) state = step(state, date, { tracked: true }).state;
    const frozen = step(state, '2026-11-04', { freezeInventory: 2 });
    expect(frozen.state.currentLength).toBe(3);
    expect(frozen.state.consecutiveFrozen).toBe(1);
    const second = step(frozen.state, '2026-11-05', { freezeInventory: 1 });
    expect(second.state.status).toBe('ACTIVE');
    const broken = step(second.state, '2026-11-06', { freezeInventory: 1 });
    expect(broken.state.status).toBe('BROKEN');
    expect(broken.effects.some((effect) => effect.status === 'MISSED')).toBe(true);
  });

  it('STR-006 emits each configured milestone once', () => {
    let state = initialTrackingState();
    let rewards = [];
    for (let day = 1; day <= 7; day += 1) {
      const result = step(state, `2026-11-${String(day).padStart(2, '0')}`, { tracked: true });
      state = result.state;
      rewards.push(...result.effects.filter((effect) => effect.type === 'milestone').map((effect) => effect.milestone));
    }
    expect(rewards).toEqual([3, 7]);
  });

  it('STR-008 exempts skipped labels without altering a live run', () => {
    const state = step(initialTrackingState(), '2026-11-01', { tracked: true }).state;
    const result = step(state, '2026-11-02', { exempt: true });
    expect(result.state.currentLength).toBe(1);
    expect(result.effects[0].status).toBe('EXEMPT');
  });

  it('STR-009 maps secondary chains without reward effects', () => {
    const result = computeChain({ active: false, current: 0, longest: 0 }, 'COUNTED', '2026-11-01', 1);
    expect(result.state.current).toBe(1);
    expect(result.effects.some((effect) => effect.type === 'milestone')).toBe(false);
  });

  it('STR-003 is chunk invariant over a deterministic sequence', () => {
    const inputs = Array.from({ length: 24 }, (_, index) => ({ tracked: index % 4 !== 3, freezeInventory: 2 }));
    const run = (chunks) => chunks.reduce((state, chunk) => chunk.reduce((current, input) => step(current, `2026-11-${String(inputs.indexOf(input) + 1).padStart(2, '0')}`, input).state, state), initialTrackingState());
    const whole = run([inputs]);
    const split = run([inputs.slice(0, 8), inputs.slice(8, 17), inputs.slice(17)]);
    expect(split).toEqual(whole);
  });
});
