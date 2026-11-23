import { createHash } from 'node:crypto';
import { createRequestIdempotencyRepository } from '../repositories/requestIdempotencyRepository.js';
import { createShopRepository } from '../repositories/shopRepository.js';
import { createChallengeRepository } from '../repositories/challengeRepository.js';
import { localInstantToUtc, shiftDate } from '../gamification/dateMath.js';
import { httpError } from '../utils/httpError.js';

export function createChallengeService({ db, gameEngine }) {
  const repository = createChallengeRepository(db);
  const purchases = createShopRepository(db);
  const idempotency = createRequestIdempotencyRepository(db);
  const config = gameEngine.rewardConfig();
  const units = gameEngine.rewardUnits();
  const clock = gameEngine.clock;

  function challenge(slug) { return config.challenges.library.find((entry) => entry.slug === slug); }

  function eligible(userId, definition, now = clock.now()) {
    const state = gameEngine.purchaseState(userId);
    if (state.level < definition.minLevel) return { eligible: false, reason: 'LEVEL_TOO_LOW' };
    if (repository.active(userId)) return { eligible: false, reason: 'ACTIVE_CHALLENGE_EXISTS' };
    const user = gameEngine.dependencies.facts.user(userId);
    const startDate = shiftDate(gameEngine.localDate(userId, now), config.challenges.startDelayDays);
    const instant = localInstantToUtc(startDate, gameEngine.settlementConfig().cutoffLocalHour, user.timezone);
    const snapshot = gameEngine.dependencies.missions.assignmentFacts(userId, startDate, instant);
    if (definition.requires.includes('DAILY_LIMIT_AT_START') && !snapshot.dailyLimitAtStart) return { eligible: false, reason: 'REQUIREMENT_NOT_MET' };
    if (state.spendableXp < definition.costXp) return { eligible: false, reason: 'INSUFFICIENT_XP' };
    return { eligible: true, reason: null, startDate, level: state.level, spendableXp: state.spendableXp };
  }

  function catalog(userId) {
    const active = repository.active(userId);
    return { data: config.challenges.library.map((definition) => ({ ...definition, ...eligible(userId, definition) })),
      activeRun: active, runs: repository.runs(userId) };
  }

  function start(userId, slug, idempotencyKey) {
    if (!gameEngine.enabled) throw httpError(503, 'GAMIFICATION_DISABLED', 'Challenges are currently unavailable.');
    const definition = challenge(slug);
    if (!definition) throw httpError(404, 'CHALLENGE_NOT_FOUND', 'Challenge not found.');
    const body = { slug };
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const previous = idempotency.find(userId, idempotencyKey);
    if (previous) {
      if (previous.requestHash !== requestHash) throw httpError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
      return { status: 200, run: previous.response };
    }
    const result = repository.transaction(() => {
      const now = clock.now(); const nowIso = now.toISOString();
      const eligibility = eligible(userId, definition, now);
      if (!eligibility.eligible) {
        if (eligibility.reason === 'LEVEL_TOO_LOW') throw httpError(403, 'LEVEL_TOO_LOW', `Reach level ${definition.minLevel} to start this challenge.`);
        if (eligibility.reason === 'INSUFFICIENT_XP') throw httpError(422, 'INSUFFICIENT_XP', 'You do not have enough spendable XP for this challenge.');
        if (eligibility.reason === 'ACTIVE_CHALLENGE_EXISTS') throw httpError(409, eligibility.reason, 'Finish or abandon your active challenge before starting another.');
        throw httpError(409, 'REQUIREMENT_NOT_MET', 'Set a daily limit before starting this challenge.');
      }
      const purchaseId = purchases.nextPurchaseId();
      const spend = gameEngine.recordSpend({ userId, purchaseId, costXp: definition.costXp, itemType: 'CHALLENGE', now: nowIso });
      purchases.insertPurchase({ id: purchaseId, userId, itemSlug: definition.slug, itemType: 'CHALLENGE', costXp: definition.costXp,
        ledgerEntryId: spend.entryId, idempotencyKey, createdAt: nowIso, meta: { challengeSlug: definition.slug } });
      const endDate = shiftDate(eligibility.startDate, definition.days - units.one);
      const runId = repository.insertRun({ userId, slug: definition.slug, costXp: definition.costXp, purchaseId,
        startDate: eligibility.startDate, endDate, requiredDays: definition.requiredQualifyingDays, createdAt: nowIso, catalogVersion: config.catalogVersion });
      const run = { id: runId, challengeSlug: definition.slug, status: 'PENDING', costXp: definition.costXp, purchaseId, startDate: eligibility.startDate,
        endDate, qualifyingDays: 0, requiredDays: definition.requiredQualifyingDays, xpAwarded: 0 };
      gameEngine.emitRewardEvent('CHALLENGE_STARTED', userId, run, `CHALLENGE:${runId}:STARTED`);
      repository.insertNotice({ userId, code: 'CHALLENGE_STARTED', data: run, createdAt: nowIso, dedupeKey: `CHALLENGE:${runId}:NOTICE:STARTED` });
      repository.insertActivity({ userId, kind: 'CHALLENGE', id: runId, status: 'STARTED', occurredAt: nowIso, data: run });
      idempotency.insert({ userId, key: idempotencyKey, requestHash, responseStatus: 201, response: run, createdAt: nowIso });
      return { status: 201, run };
    });
    return result;
  }

  function requireRun(userId, id) {
    const run = repository.run(userId, id);
    if (!run) throw httpError(404, 'CHALLENGE_RUN_NOT_FOUND', 'Challenge run not found.');
    return run;
  }

  function cancel(userId, id) {
    const run = requireRun(userId, id);
    if (run.status !== 'PENDING' || gameEngine.localDate(userId) >= run.startDate || !config.challenges.cancelBeforeStartRefund) {
      throw httpError(409, 'CHALLENGE_NOT_CANCELLABLE', 'Only a pending challenge can be cancelled before its start date.');
    }
    return repository.transaction(() => {
      const now = clock.now().toISOString();
      const purchase = repository.linkedPurchase(userId, run.purchaseId);
      if (!purchase || purchase.status !== 'COMPLETED') throw httpError(409, 'CHALLENGE_REFUND_UNAVAILABLE', 'The challenge purchase cannot be refunded.');
      const refund = gameEngine.recordSpendRefund({ userId, purchaseId: purchase.id, costXp: purchase.costXp, spendLedgerId: purchase.ledgerEntryId, now });
      repository.markRefunded(userId, purchase.id);
      repository.setStatus(userId, id, 'CANCELLED', now);
      const data = { runId: id, purchaseId: purchase.id, refundXp: purchase.costXp, spendableXp: refund.spendableXp };
      gameEngine.emitRewardEvent('CHALLENGE_CANCELLED', userId, data, `CHALLENGE:${id}:CANCELLED`);
      gameEngine.emitRewardEvent('PURCHASE_REFUNDED', userId, data, `PURCHASE:${purchase.id}:REFUNDED`);
      repository.insertNotice({ userId, code: 'CHALLENGE_CANCELLED', data, createdAt: now, dedupeKey: `CHALLENGE:${id}:NOTICE:CANCELLED` });
      repository.insertActivity({ userId, kind: 'CHALLENGE', id, status: 'CANCELLED', occurredAt: now, data });
      return { cancelled: true, ...data };
    });
  }

  function abandon(userId, id) {
    const run = requireRun(userId, id);
    if (run.status !== 'ACTIVE') throw httpError(409, 'CHALLENGE_NOT_ABANDONABLE', 'Only an active challenge can be abandoned.');
    return repository.transaction(() => {
      const now = clock.now().toISOString();
      repository.setStatus(userId, id, 'ABANDONED', now);
      const data = { runId: id, challengeSlug: run.challengeSlug, status: 'ABANDONED' };
      gameEngine.emitRewardEvent('CHALLENGE_ABANDONED', userId, data, `CHALLENGE:${id}:ABANDONED`);
      repository.insertNotice({ userId, code: 'CHALLENGE_ABANDONED', data, createdAt: now, dedupeKey: `CHALLENGE:${id}:NOTICE:ABANDONED` });
      repository.insertActivity({ userId, kind: 'CHALLENGE', id, status: 'ABANDONED', occurredAt: now, data });
      return data;
    });
  }

  function run(userId, id) { return { ...requireRun(userId, id), days: repository.days(id) }; }

  function advance(userId, throughDate, hasOutcomeHold) {
    const run = repository.active(userId);
    if (!run) return [];
    const definition = challenge(run.challengeSlug);
    if (!definition) return [];
    const user = gameEngine.dependencies.facts.user(userId);
    const from = run.startDate > throughDate ? null : run.startDate;
    const to = run.endDate < throughDate ? run.endDate : throughDate;
    const changed = [];
    if (from && from <= to) {
      for (let date = from; date <= to; date = shiftDate(date, units.one)) {
        const priorDay = repository.day(run.id, date);
        if (priorDay?.status === 'FINAL') continue;
        const cutoff = localInstantToUtc(shiftDate(date, units.one), gameEngine.settlementConfig().cutoffLocalHour, user.timezone);
        const holdActive = priorDay?.status === 'DEFERRED' ? hasOutcomeHold(userId, clock.now().toISOString()) : hasOutcomeHold(userId, cutoff);
        if (definition.qualify.includes('COUNTED_BUDGET_DAY') && holdActive) {
          repository.transaction(() => {
            repository.insertDay({ runId: run.id, date, qualified: false, details: { deferred: true }, status: 'DEFERRED' });
            repository.setStatus(userId, run.id, 'DEFERRED');
          });
          changed.push({ runId: run.id, date, status: 'DEFERRED' });
          continue;
        }
        const facts = repository.dayFacts(userId, date);
        const checks = { XP_TRACKED: facts.xpTracked, REVIEW_DONE: facts.reviewDone, COUNTED_BUDGET_DAY: facts.countedBudgetDay };
        const qualified = definition.qualify.every((condition) => checks[condition] === true);
        repository.transaction(() => {
          if (run.status === 'PENDING' || run.status === 'DEFERRED') repository.setStatus(userId, run.id, 'ACTIVE');
          repository.insertDay({ runId: run.id, date, qualified, details: checks, status: 'FINAL' });
          repository.refreshProgress(userId, run.id);
          gameEngine.emitRewardEvent('CHALLENGE_DAY_EVALUATED', userId, { runId: run.id, date, qualified, details: checks }, `CHALLENGE_DAY:${run.id}:${date}`);
        });
        changed.push({ runId: run.id, date, status: 'FINAL', qualified });
      }
    }
    const refreshed = repository.run(userId, run.id);
    if (refreshed.status === 'DEFERRED' && hasOutcomeHold(userId, clock.now().toISOString())) return changed;
    if (refreshed.status === 'DEFERRED') repository.setStatus(userId, run.id, 'ACTIVE');
    const processedThrough = Math.min(Date.parse(`${throughDate}T00:00:00.000Z`), Date.parse(`${run.endDate}T00:00:00.000Z`));
    const afterThrough = new Date(processedThrough).toISOString().slice(0, 10) < run.endDate
      ? shiftDate(new Date(processedThrough).toISOString().slice(0, 10), units.one) : shiftDate(run.endDate, units.one);
    const remaining = afterThrough > run.endDate ? 0 : Math.floor((Date.parse(`${run.endDate}T00:00:00.000Z`) - Date.parse(`${afterThrough}T00:00:00.000Z`)) /
      (units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond)) + units.one;
    const mathematicallyImpossible = refreshed.qualifyingDays + remaining < run.requiredDays;
    const ended = throughDate >= run.endDate;
    if (mathematicallyImpossible || ended) {
      const passed = refreshed.qualifyingDays >= run.requiredDays;
      const status = passed ? 'COMPLETED' : 'FAILED';
      const now = clock.now(); const nowIso = now.toISOString();
      let xpAwarded = 0;
      repository.transaction(() => {
        if (passed) {
          const since = new Date(now.getTime() - config.challenges.repeatCooldownDays * units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond).toISOString();
          const recent = repository.recentlyCompleted(userId, run.challengeSlug, since);
          const entry = gameEngine.recordChallengeReward({ userId, slug: run.challengeSlug, xp: definition.rewardXp, award: !recent });
          xpAwarded = entry?.lifetimeDelta ?? 0;
        }
        repository.setStatus(userId, run.id, status, nowIso, xpAwarded);
        const data = { runId: run.id, challengeSlug: run.challengeSlug, slug: run.challengeSlug, status,
          qualifyingDays: refreshed.qualifyingDays, requiredDays: run.requiredDays, xp: xpAwarded, xpAwarded };
        gameEngine.emitRewardEvent(passed ? 'CHALLENGE_COMPLETED' : 'CHALLENGE_FAILED', userId, data, `CHALLENGE:${run.id}:${status}`);
        repository.insertNotice({ userId, code: `CHALLENGE_${status}`, data, createdAt: nowIso, dedupeKey: `CHALLENGE:${run.id}:NOTICE:${status}` });
        repository.insertActivity({ userId, kind: 'CHALLENGE', id: run.id, status, occurredAt: nowIso, data });
      });
      changed.push({ runId: run.id, status, xpAwarded });
    }
    return changed;
  }

  return { catalog, start, cancel, abandon, run, advance, repository };
}
