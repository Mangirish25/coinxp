import { createFreezeRepository } from './freezeRepository.js';
import { createStreakRepository } from './streakRepository.js';
import { computeNext, computeChain, initialTrackingState } from './streakEngine.js';
import { localDateAt, localInstantToUtc, shiftDate, weekBounds, weekKey, monthOf } from '../dateMath.js';
import defaultRules from '../rules.config.js';
import { createTimezoneChangeRepository } from '../../repositories/timezoneChangeRepository.js';
import { createTimezoneExemptions } from './exemptions.js';

const TRACKING = 'TRACKING_DAILY';
const SECONDARY = ['BUDGET_DAILY', 'CONSISTENCY_WEEKLY', 'BUDGET_MONTHLY'];
const iso = (clock) => clock.now().toISOString();
const dateDistance = (from, to, units) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
  (units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond));

function initialState(stateRow, run, prior, milestones) {
  const state = initialTrackingState({ milestones, longest: stateRow.longestLength });
  state.status = stateRow.status;
  state.active = stateRow.status === 'ACTIVE' && Boolean(run);
  state.currentLength = stateRow.currentLength;
  state.lastProcessedKey = stateRow.lastProcessedKey;
  state.lastCountedKey = stateRow.lastCountedKey;
  state.consecutiveFrozen = stateRow.consecutiveFrozen;
  state.previousRun = prior ? { ...prior, wasRestored: prior.wasRestored } : null;
  if (run) {
    state.run = { ...run, longest: stateRow.longestLength, comeback: run.comebackJson ? JSON.parse(run.comebackJson) : undefined };
  }
  return state;
}

export function createStreakAdvancer({ db, gameEngine, config = defaultRules, clock = gameEngine.clock }) {
  const streaks = createStreakRepository(db);
  const freezes = createFreezeRepository(db);
  const timezoneChanges = createTimezoneChangeRepository(db);
  const exemptions = createTimezoneExemptions(timezoneChanges);
  const { settlements, facts } = gameEngine.dependencies;

  function publishEffect(userId, effect) {
    const keys = {
      STREAK_STARTED: `STARTED:${userId}:${effect.runId}`,
      STREAK_MAINTAINED: `MAINT:${userId}:${TRACKING}:${effect.date}`,
      STREAK_BROKEN: `BROKEN:${userId}:${effect.runId}`,
      STREAK_FREEZE_USED: `FRZUSE:${userId}:${effect.date}`,
      STREAK_RESTORED: `RESTORE:${userId}:${effect.runId}`,
      STREAK_MILESTONE_REACHED: `MILE:${userId}:${effect.milestone}`,
    };
    const payload = { streakType: TRACKING, ...effect };
    if (effect.event === 'STREAK_BROKEN') payload.comebackEligibleUntil = shiftDate(effect.date, config.streaks.tracking.comeback.maxGapDays);
    return gameEngine.publishStreak(effect.event, userId, payload, keys[effect.event] ?? `${effect.event}:${userId}:${effect.date}`);
  }

  function transitionDay(userId, date, user, stateRow, input) {
    return db.transaction(() => {
      const activeRun = streaks.activeRun(userId, TRACKING);
      const previousRun = streaks.previousRun(userId, TRACKING);
      const milestones = streaks.milestones(userId, TRACKING);
      let state = initialState(stateRow, activeRun, previousRun, milestones);
      const persistedRun = state.run;
      const runId = activeRun?.id ?? (input.tracked ? streaks.createRun({ userId, streakType: TRACKING, startedKey: date, createdAt: iso(clock) }) : null);
      const transition = computeNext(state, { ...input, date, runId }, config);
      state = transition.state;

      for (const effect of transition.effects) {
        if (effect.type === 'period') {
          streaks.insertPeriod({ userId, streakType: TRACKING, periodKey: effect.date, status: effect.status,
            runId: effect.runId, reasonCode: effect.reasonCode, processedAt: iso(clock) });
        } else if (effect.type === 'freezeUse') {
          const cutoff = localInstantToUtc(shiftDate(date, config.units.one), config.settlement.cutoffLocalHour, user.timezone);
          freezes.insert({ userId, delta: -1, reason: 'USED', effectiveAt: cutoff, effectiveLocalDate: date,
            periodKey: date, idempotencyKey: `FRZ:USE:${date}`, actor: 'engine', createdAt: iso(clock) });
          const inventoryAfter = freezes.inventoryAsOf(userId, cutoff);
          gameEngine.publishStreak('STREAK_FREEZE_USED', userId, { streakType: TRACKING, date, inventoryAfter }, `FRZUSE:${userId}:${date}`, cutoff);
          const usedSince = new Date(clock.now().getTime() - config.streaks.antiAbuse.freezeUsedWindowDays * config.units.hoursPerDay *
            config.units.minutesPerHour * config.units.secondsPerMinute * config.units.millisecondsPerSecond).toISOString();
          const recentUses = freezes.countUsedSince(userId, usedSince);
          if (recentUses >= config.streaks.antiAbuse.freezeUsedCount) {
            gameEngine.dependencies.ledger.flag(userId, 'FREEZE_USED_RAPID', date, { recentUses }, iso(clock));
          }
        } else if (effect.type === 'freezeGrant') {
          const cutoff = localInstantToUtc(shiftDate(date, config.units.one), config.settlement.cutoffLocalHour, user.timezone);
          const existing = freezes.inventoryAsOf(userId, cutoff);
          const awarded = existing < config.streaks.tracking.freeze.maxHeld && freezes.insert({ userId, delta: config.streaks.tracking.freeze.starterCount,
            reason: effect.reason, effectiveAt: cutoff, effectiveLocalDate: date, periodKey: date, idempotencyKey: `FRZ:GRANT:${userId}:${effect.idempotencyKey}`,
            actor: 'engine', createdAt: iso(clock) });
          const inventory = freezes.inventoryAsOf(userId, cutoff);
          gameEngine.publishStreak(awarded ? 'STREAK_FREEZE_GRANTED' : 'STREAK_FREEZE_GRANT_SKIPPED', userId,
            { streakType: TRACKING, reason: effect.reason, date, inventory }, `FRZGR:${userId}:${effect.idempotencyKey}`, cutoff);
        } else if (effect.type === 'milestone') {
          if (streaks.insertMilestone({ userId, streakType: TRACKING, milestone: effect.milestone, reachedKey: date, runId: effect.runId, createdAt: iso(clock) })) {
            gameEngine.awardStreakMilestone({ userId, milestone: effect.milestone, xp: effect.xp, date, runId: effect.runId });
            gameEngine.publishStreak('STREAK_MILESTONE_REACHED', userId, { streakType: TRACKING, milestone: effect.milestone, xp: effect.xp, date, runId: effect.runId }, `MILE:${userId}:${effect.milestone}`);
          }
        } else if (effect.type === 'event') {
          publishEffect(userId, effect);
        }
      }

      const runToSave = state.run ?? persistedRun;
      if (runToSave) {
        const ended = state.active ? null : state.lastProcessedKey;
        const broken = transition.effects.find((effect) => effect.event === 'STREAK_BROKEN');
        streaks.updateRun(runToSave.id, { endedKey: ended, endReason: ended ? 'MISSED' : null, countedDays: runToSave.countedDays,
          lengthOffset: runToSave.lengthOffset, lengthAtEnd: ended ? broken?.lengthAtEnd ?? (runToSave.countedDays + runToSave.lengthOffset) : null,
          restoredFromRunId: runToSave.restoredFromRunId ?? null, restoredAtKey: runToSave.restoredAtKey ?? null,
          genuineDaysSinceRestore: runToSave.genuineDaysSinceRestore ?? 0 });
        streaks.updateComeback(runToSave.id, runToSave.comeback ? JSON.stringify(runToSave.comeback) : null);
      }
      const nextState = {
        userId, streakType: TRACKING, status: state.active ? 'ACTIVE' : state.status,
        currentRunId: state.active ? state.run.id : null, currentLength: state.active ? state.currentLength : 0,
        longestLength: state.longest, lastProcessedKey: state.lastProcessedKey, lastCountedKey: state.lastCountedKey,
        consecutiveFrozen: state.consecutiveFrozen, updatedAt: iso(clock),
      };
      streaks.saveState(nextState);
      return nextState;
    }).immediate();
  }

  function advanceTracking(userId, user, through) {
    let stored = streaks.ensureState(userId, TRACKING, iso(clock));
    if (stored.lastProcessedKey && stored.lastProcessedKey >= through) return stored;
    const progress = gameEngine.dependencies.ledger.progress(userId);
    const start = progress?.gamificationStartDate ?? localDateAt(user.createdAt, user.timezone);
    const from = stored.lastProcessedKey ? shiftDate(stored.lastProcessedKey, config.units.one) : start;
    if (from > through) return stored;
    const tracked = new Set(settlements.list(userId, 'day', from, through).filter((row) => row.details.xpTracked === true).map((row) => row.periodKey));
    let state = stored;
    let date = from;
    // STR-003: inactive runs jump directly to settled tracked labels; live runs process each label.
    while (date <= through) {
      const active = state.status === 'ACTIVE';
      if (!active && !tracked.has(date)) {
        const nextTracked = [...tracked].find((candidate) => candidate >= date);
        if (!nextTracked) {
          state = { ...state, lastProcessedKey: through, updatedAt: iso(clock) };
          streaks.saveState(state);
          break;
        }
        if (nextTracked > date) {
          state = { ...state, lastProcessedKey: shiftDate(nextTracked, -config.units.one), updatedAt: iso(clock) };
          streaks.saveState(state);
          date = nextTracked;
        }
      }
      const settlement = settlements.get(userId, 'day', date);
      const cutoff = localInstantToUtc(shiftDate(date, config.units.one), config.settlement.cutoffLocalHour, user.timezone);
      const inventory = freezes.inventoryAsOf(userId, cutoff);
      const prior = streaks.previousRun(userId, TRACKING);
      const exempt = exemptions.isExempt(userId, date);
      const calendarGap = prior?.endedKey ? dateDistance(prior.endedKey, date, config.units) : config.units.zero;
      const exemptGap = prior?.endedKey ? timezoneChanges.countSkippedBetween(userId, prior.endedKey, date) : config.units.zero;
      state = transitionDay(userId, date, user, state, { tracked: Boolean(settlement?.details?.xpTracked), exempt,
        reasonCode: 'TIMEZONE_GAP', freezeInventory: inventory, gapDays: calendarGap - exemptGap });
      const timezoneSince = new Date(clock.now().getTime() - config.streaks.antiAbuse.timezoneWindowDays * config.units.hoursPerDay *
        config.units.minutesPerHour * config.units.secondsPerMinute * config.units.millisecondsPerSecond).toISOString();
      const exemptionCount = timezoneChanges.countSkippedSince(userId, timezoneSince);
      if (exempt && exemptionCount > config.streaks.antiAbuse.timezoneExemptCount) {
        gameEngine.dependencies.ledger.flag(userId, 'TZ_EXEMPT_REPEAT', date, { recentExemptions: exemptionCount }, iso(clock));
      }
      if (settlement?.details?.noSpendDeclared && facts.countNoSpendSince(userId,
        shiftDate(date, -(config.streaks.antiAbuse.noSpendWindowDays - config.units.one)), date) >= config.streaks.antiAbuse.noSpendCount) {
        gameEngine.dependencies.ledger.flag(userId, 'NOSPEND_PATTERN', date, { threshold: config.streaks.antiAbuse.noSpendCount }, iso(clock));
      }
      if (date === through) break;
      date = shiftDate(date, config.units.one);
    }
    return streaks.getState(userId, TRACKING) ?? state;
  }

  function advanceSecondary(userId, through) {
    const progress = gameEngine.dependencies.ledger.progress(userId);
    const accountStart = progress?.gamificationStartDate ?? facts.user(userId).createdAt.slice(0, config.units.dateLength);
    const historyStart = shiftDate(through, -(config.streaks.calendar.maxRangeDays - config.units.one));
    const maxHistoryStart = accountStart > historyStart ? accountStart : historyStart;
    const first = settlements.list(userId, 'day', maxHistoryStart, through);
    const weekStart = weekBounds(weekKey(maxHistoryStart)).start;
    const weeks = settlements.list(userId, 'week', weekKey(weekStart), weekKey(through));
    const monthFirst = monthOf(maxHistoryStart);
    const months = settlements.list(userId, 'month', monthFirst, monthOf(through));
    const mappings = { BUDGET_DAILY: first, CONSISTENCY_WEEKLY: weeks, BUDGET_MONTHLY: months };
    for (const type of SECONDARY) {
      if (!config.streaks.secondary[{ BUDGET_DAILY: 'budgetDaily', CONSISTENCY_WEEKLY: 'consistencyWeekly', BUDGET_MONTHLY: 'budgetMonthly' }[type]].enabled) continue;
      const rows = new Map(mappings[type].map((row) => [row.periodKey, row]));
      const priorState = streaks.ensureState(userId, type, iso(clock));
      let active = priorState.status === 'ACTIVE';
      let broken = false;
      let current = priorState.currentLength;
      let longest = priorState.longestLength;
      let last = priorState.lastProcessedKey;
      const start = last ? shiftDate(last, config.units.one) : maxHistoryStart;
      for (let date = start; date <= through; date = shiftDate(date, config.units.one)) {
        let key = date;
        let nextDate = shiftDate(date, config.units.one);
        if (type === 'CONSISTENCY_WEEKLY') { key = weekKey(date); nextDate = shiftDate(weekBounds(key).end, config.units.one); if (date !== weekBounds(key).start) continue; }
        if (type === 'BUDGET_MONTHLY') { key = monthOf(date); nextDate = shiftDate(`${key}-${String(new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).getUTCDate()).padStart(2,'0')}`, config.units.one); if (date !== `${key}-01`) continue; }
        if (key <= (last ?? '')) continue;
        const row = rows.get(key);
        const status = type === 'BUDGET_DAILY' && exemptions.isExempt(userId, date) ? 'EXEMPT' : row?.outcome === 'PASS' ? 'COUNTED' : type !== 'BUDGET_DAILY' && row?.reasonCode === 'TOO_FEW_DAYS' ? 'EXEMPT' : 'MISSED';
        const wasActive = active;
        const chain = computeChain({ active, current, longest, runId: priorState.currentRunId }, status, key, priorState.currentRunId);
        streaks.insertPeriod({ userId, streakType: type, periodKey: key, status, runId: active ? priorState.currentRunId : null,
          reasonCode: status === 'COUNTED' ? 'PERIOD_PASSED' : status === 'EXEMPT' ? 'TOO_FEW_DAYS' : 'PERIOD_FAILED', processedAt: iso(clock) });
        active = chain.state.active; current = chain.state.current; longest = chain.state.longest; last = key;
        if (status === 'COUNTED') broken = false;
        else if (status === 'MISSED' && wasActive) broken = true;
        if (nextDate > through) break;
      }
      if (last) streaks.saveState({ userId, streakType: type, status: active ? 'ACTIVE' : broken ? 'BROKEN' : priorState.status === 'BROKEN' ? 'BROKEN' : 'NONE', currentRunId: active ? priorState.currentRunId : null,
        currentLength: current, longestLength: longest, lastProcessedKey: last, lastCountedKey: active ? last : priorState.lastCountedKey,
        consecutiveFrozen: 0, updatedAt: iso(clock) });
    }
    return maxHistoryStart;
  }

  function advanceUser(userId) {
    if (!gameEngine.enabled) return { enabled: false };
    gameEngine.settleUser(userId);
    const user = facts.user(userId);
    if (!user) return { enabled: true, missingUser: true };
    const through = gameEngine.closedThrough(userId, clock.now());
    const tracking = advanceTracking(userId, user, through);
    advanceSecondary(userId, through);
    return { enabled: true, tracking, through };
  }

  function summary(userId) {
    const { through } = advanceUser(userId);
    const user = facts.user(userId);
    const today = gameEngine.localDate(userId, clock.now());
    const stored = streaks.ensureState(userId, TRACKING, iso(clock));
    const run = streaks.activeRun(userId, TRACKING);
    const review = facts.review(userId, today);
    const trackedToday = facts.currentLiveCount(userId, today, config.tracking.minQualifyingAmountPaise) > 0 || Boolean(review?.xpEligible);
    const localParts = new Intl.DateTimeFormat('en', { timeZone: user.timezone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(clock.now());
    const localHour = Number(localParts.find((part) => part.type === 'hour')?.value ?? 0);
    const active = stored.status === 'ACTIVE';
    const freezeCount = freezes.inventoryAsOf(userId, clock.now().toISOString());
    const atRisk = active && !trackedToday && localHour >= config.streaks.atRisk.localHour;
    const settlingDate = localHour < config.settlement.cutoffLocalHour ? shiftDate(today, -config.units.one) : null;
    const reachedMilestones = new Set(streaks.milestones(userId, TRACKING));
    const nextMilestone = config.streaks.tracking.milestones.find((milestone) => !reachedMilestones.has(milestone.days)) ?? null;
    return { tracking: { status: stored.status, current: stored.currentLength, longest: stored.longestLength, trackedToday, atRisk,
      freezeWouldProtect: active && stored.currentLength >= config.streaks.tracking.minRunLengthForFreeze &&
        stored.consecutiveFrozen < config.streaks.tracking.freeze.maxConsecutiveFrozen && freezeCount > 0,
      settlingDate, nextMilestone, milestones: [...reachedMilestones], comeback: run?.comebackJson ? JSON.parse(run.comebackJson) : null },
      secondary: Object.fromEntries(SECONDARY.map((type) => {
        const row = streaks.ensureState(userId, type, iso(clock));
        return [type, { status: row.status, current: row.currentLength, longest: row.longestLength }];
      })), freezes: { inventory: freezeCount, cap: config.streaks.tracking.freeze.maxHeld }, through,
      recentEvents: gameEngine.dependencies.outbox.recentStreakEvents(userId, config.pagination.summaryLedgerCount) };
  }

  function calendar(userId, from, to) {
    const rows = streaks.calendar(userId, from, to);
    const byDate = new Map();
    for (const row of rows) {
      if (!byDate.has(row.periodKey)) byDate.set(row.periodKey, {});
      byDate.get(row.periodKey)[row.streakType] = row.status;
    }
    const today = gameEngine.localDate(userId, clock.now());
    const dates = [];
    for (let date = from; date <= to; date = shiftDate(date, config.units.one)) {
      const daySettlement = settlements.get(userId, 'day', date);
      let status = byDate.get(date)?.[TRACKING] ?? 'NONE';
      if (status === 'NONE' && date === today && !daySettlement) status = 'TODAY_OPEN';
      if (status === 'NONE' && daySettlement?.details?.noSpendDeclared && !daySettlement.details.xpTracked) status = 'DECLARED_CAPPED';
      dates.push({ date, status, secondary: byDate.get(date) ?? {} });
    }
    return { from, to, days: dates };
  }

  function freezeHistory(userId, page = 1, pageSize = 20) {
    const rows = freezes.list(userId);
    const data = rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ ...row,
      message: ({ STARTER: 'Starter freeze earned', REGEN: 'Freeze earned for consistent tracking', USED: 'Freeze protected your streak',
        PURCHASE: 'Freeze added', ADMIN: 'Freeze adjustment', RECOMPUTE_ADJUST: 'Freeze history adjustment' })[row.reason] ?? 'Freeze history entry' }));
    return { inventory: freezes.inventoryAsOf(userId, iso(clock)), cap: config.streaks.tracking.freeze.maxHeld, data,
      pagination: { page, pageSize, total: rows.length, totalPages: Math.ceil(rows.length / pageSize) } };
  }

  function grantFreeze(userId, { source = 'PURCHASE', idempotencyKey }) {
    const allowedReasons = new Set(['PURCHASE', 'ADMIN']);
    if (!allowedReasons.has(source) || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new TypeError('grantFreeze requires a supported source and idempotency key.');
    }
    const user = facts.user(userId);
    if (!user) return { granted: false, inventory: 0 };
    return db.transaction(() => {
      const now = clock.now();
      const inventory = freezes.inventoryAsOf(userId, now.toISOString());
      if (inventory >= config.streaks.tracking.freeze.maxHeld) return { granted: false, inventory };
      const granted = freezes.insert({ userId, delta: config.streaks.tracking.freeze.starterCount, reason: source,
        effectiveAt: now.toISOString(), effectiveLocalDate: gameEngine.localDate(userId, now), idempotencyKey: `FRZ:${source}:${userId}:${idempotencyKey}`,
        actor: source === 'ADMIN' ? 'admin' : 'purchase', createdAt: now.toISOString() });
      return { granted, inventory: freezes.inventoryAsOf(userId, now.toISOString()) };
    }).immediate();
  }

  return { advanceUser, summary, calendar, freezeHistory, today: (userId) => gameEngine.localDate(userId, clock.now()),
    maxCalendarDays: () => config.streaks.calendar.maxRangeDays,
    grantFreeze,
    rules: () => ({ tracking: config.streaks.tracking, secondary: config.streaks.secondary,
      atRisk: config.streaks.atRisk, calendar: config.streaks.calendar }), repositories: { streaks, freezes } };
}
