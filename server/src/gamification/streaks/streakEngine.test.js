import { describe, expect, it } from 'vitest';
import rules from '../rules.config.js';
import { computeNext, computeChain, initialTrackingState } from './streakEngine.js';
import { shiftDate } from '../dateMath.js';

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

  it('STR-007 restores half of a qualifying run after three genuinely consecutive days', () => {
    let state = initialTrackingState();
    state.previousRun = { id: 'prior', length: 30, endedKey: '2026-10-31', wasRestored: false, genuineDaysSinceRestore: 14 };
    state = step(state, '2026-11-01', { tracked: true, gapDays: 1 }).state;
    state = step(state, '2026-11-02', { tracked: true, gapDays: 2 }).state;
    const restored = step(state, '2026-11-03', { tracked: true, gapDays: 3 });
    expect(restored.state.currentLength).toBe(15);
    expect(restored.effects.some((effect) => effect.type === 'event' && effect.event === 'STREAK_RESTORED')).toBe(true);
  });

  it('STR-007 clears pending recovery if a qualifying-length run uses a freeze', () => {
    const state = initialTrackingState();
    state.active = true;
    state.status = 'ACTIVE';
    state.currentLength = 3;
    state.run = { id: 'new', startedKey: '2026-11-01', countedDays: 3, lengthOffset: 0, comeback: { remainingDays: 1, priorLength: 30, sourceRunId: 'prior' } };
    const frozen = step(state, '2026-11-04', { freezeInventory: 1 });
    expect(frozen.state.run.comeback).toBeUndefined();
    expect(frozen.effects.some((effect) => effect.status === 'FROZEN')).toBe(true);
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

  it('STR-003 is chunk invariant across 500 deterministic randomized histories', () => {
    let seed = 0x51a7;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let trial = 0; trial < 500; trial += 1) {
      const inputs = Array.from({ length: 30 }, (_, index) => ({
        date: shiftDate('2026-10-01', index), tracked: random() < 0.68, exempt: random() < 0.04,
        freezeInventory: Math.floor(random() * 3), gapDays: Math.floor(random() * 5), runId: `run-${trial}-${index}`,
      }));
      const execute = (parts) => parts.reduce((state, part) => part.reduce((current, input) =>
        computeNext(current, input, rules).state, state), initialTrackingState());
      const partitions = [];
      for (let index = 0; index < inputs.length;) {
        const size = Math.max(1, Math.floor(random() * 7));
        partitions.push(inputs.slice(index, index + size));
        index += size;
      }
      expect(execute(partitions)).toEqual(execute([inputs]));
    }
  });
});
