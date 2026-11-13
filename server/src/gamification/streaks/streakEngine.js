// STR-002: pure date transition. Persistence, clocks, and event delivery stay outside this module.
export function computeNext(state, input, config) {
  const tracking = config.streaks.tracking;
  const next = structuredClone(state);
  const effects = [];
  const day = input.date;
  if (input.exempt) {
    if (next.active) effects.push({ type: 'period', status: 'EXEMPT', date: day, runId: next.run.id, reasonCode: input.reasonCode ?? 'TIMEZONE_GAP' });
    next.lastProcessedKey = day;
    return { state: next, effects };
  }
  if (input.tracked) {
    if (!next.active) {
      const prior = next.previousRun;
      next.run = { id: input.runId, startedKey: day, countedDays: 0, lengthOffset: 0, longest: next.longest,
        genuineDaysSinceRestore: prior?.genuineDaysSinceRestore ?? tracking.comeback.cooldownGenuineDays };
      next.active = true;
      next.status = 'ACTIVE';
      if (prior && input.gapDays <= tracking.comeback.maxGapDays && prior.length >= tracking.comeback.minPrevLength && prior.genuineDaysSinceRestore >= tracking.comeback.cooldownGenuineDays) {
        next.run.comeback = { priorLength: prior.length, afterCountedDays: tracking.comeback.afterCountedDays, sourceRunId: prior.id, remainingDays: tracking.comeback.afterCountedDays };
      } else if (prior && input.gapDays <= tracking.comeback.maxGapDays && prior.length >= tracking.comeback.minPrevLength && !prior.wasRestored) {
        next.run.comeback = { priorLength: prior.length, afterCountedDays: tracking.comeback.afterCountedDays, sourceRunId: prior.id, remainingDays: tracking.comeback.afterCountedDays };
      }
      effects.push({ type: 'event', event: 'STREAK_STARTED', date: day, runId: next.run.id });
    }
    next.run.countedDays += 1;
    if (next.run.restoredAtKey && day > next.run.restoredAtKey) next.run.genuineDaysSinceRestore += 1;
    next.consecutiveFrozen = 0;
    if (next.run.comeback?.remainingDays) {
      next.run.comeback.remainingDays -= 1;
      if (next.run.comeback.remainingDays === 0) {
        const restoredLength = Math.max(tracking.comeback.afterCountedDays, Math.floor(next.run.comeback.priorLength * tracking.comeback.retentionBps / config.units.basisPoints));
        next.run.lengthOffset = restoredLength - next.run.countedDays;
        next.run.restoredFromRunId = next.run.comeback.sourceRunId;
        next.run.restoredAtKey = day;
        effects.push({ type: 'event', event: 'STREAK_RESTORED', date: day, runId: next.run.id, fromLength: next.run.comeback.priorLength, toLength: restoredLength });
        delete next.run.comeback;
      }
    }
    const length = next.run.countedDays + next.run.lengthOffset;
    next.currentLength = length;
    next.longest = Math.max(next.longest, length);
    next.lastCountedKey = day;
    effects.push({ type: 'period', status: 'COUNTED', date: day, runId: next.run.id, reasonCode: 'XP_TRACKED' });
    for (const milestone of tracking.milestones) {
      if (length >= milestone.days && !next.milestones.includes(milestone.days)) {
        next.milestones.push(milestone.days);
        effects.push({ type: 'milestone', milestone: milestone.days, xp: milestone.xp, date: day, runId: next.run.id });
      }
    }
    next.milestones.sort((a, b) => a - b);
    const grants = [];
    if (length === tracking.freeze.starterAtLength) grants.push({ reason: 'STARTER', idempotencyKey: 'STARTER' });
    if (next.run.countedDays > 0 && next.run.countedDays % tracking.freeze.regenEveryCountedDays === 0) grants.push({ reason: 'REGEN', idempotencyKey: `REGEN:${next.run.id}:${next.run.countedDays}` });
    for (const grant of grants) effects.push({ type: 'freezeGrant', ...grant, date: day, runId: next.run.id });
    next.lastProcessedKey = day;
    return { state: next, effects };
  }
  if (!next.active) { next.lastProcessedKey = day; return { state: next, effects }; }
  if (next.currentLength >= tracking.minRunLengthForFreeze && next.consecutiveFrozen < tracking.freeze.maxConsecutiveFrozen && input.freezeInventory > 0) {
    next.consecutiveFrozen += 1;
    effects.push({ type: 'period', status: 'FROZEN', date: day, runId: next.run.id, reasonCode: 'FREEZE_USED' });
    effects.push({ type: 'freezeUse', date: day, runId: next.run.id });
  } else {
    effects.push({ type: 'period', status: 'MISSED', date: day, runId: next.run.id, reasonCode: 'UNTRACKED' });
        next.previousRun = { id: next.run.id, length: next.currentLength, endedKey: day, wasRestored: Boolean(next.run.restoredFromRunId), genuineDaysSinceRestore: next.run.genuineDaysSinceRestore };
    effects.push({ type: 'event', event: 'STREAK_BROKEN', date: day, runId: next.run.id, lengthAtEnd: next.currentLength });
    next.active = false;
    next.status = 'BROKEN';
    next.run = null;
    next.currentLength = 0;
    next.consecutiveFrozen = 0;
  }
  next.lastProcessedKey = day;
  return { state: next, effects };
}

// STR-009: secondary streaks are strict, display-only chains.
export function computeChain(state, status, date, runId) {
  const next = structuredClone(state);
  const effects = [];
  if (status === 'EXEMPT') {
    if (next.active) effects.push({ type: 'period', status: 'EXEMPT', date, runId: next.runId, reasonCode: 'PERIOD_INELIGIBLE' });
    return { state: next, effects };
  }
  if (status === 'COUNTED') {
    if (!next.active) { next.active = true; next.runId = runId; next.current = 0; }
    next.current += 1;
    next.longest = Math.max(next.longest, next.current);
    effects.push({ type: 'period', status: 'COUNTED', date, runId: next.runId, reasonCode: 'PERIOD_PASSED' });
  } else {
    if (next.active) effects.push({ type: 'period', status: 'MISSED', date, runId: next.runId, reasonCode: 'PERIOD_FAILED' });
    next.active = false;
    next.current = 0;
    next.runId = null;
  }
  return { state: next, effects };
}

export function initialTrackingState({ milestones = [], longest = 0 } = {}) {
  return { status: 'NONE', active: false, run: null, previousRun: null, currentLength: 0, longest, consecutiveFrozen: 0, lastProcessedKey: null, lastCountedKey: null, milestones: [...milestones] };
}
