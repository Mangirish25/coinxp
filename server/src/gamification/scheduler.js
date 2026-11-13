import rules from './rules.config.js';
import { createOutboxRepository } from './outbox/outboxRepository.js';
import { shiftDate } from './dateMath.js';

export function startGamificationScheduler(engine, { db, streakAdvancer, clock = engine.clock, logger = console, intervalMs } = {}) {
  const outbox = createOutboxRepository(db);
  const interval = intervalMs ?? rules.settlement.schedulerIntervalMinutes * rules.units.minutesPerHour * rules.units.secondsPerMinute * rules.units.millisecondsPerSecond;
  let running = false;
  let stopped = false;
  let lastReconciliation = 0;
  let lastAudit = 0;
  async function tick() {
    if (running || stopped || !engine.enabled) return;
    running = true;
    try {
      for (const userId of outbox.pendingUsers(clock.now().toISOString(), rules.events.workerBatchSize)) engine.processUser(userId);
      const users = engine.dependencies.settlements.users();
      for (const user of users) {
        engine.settleUser(user.id);
        streakAdvancer?.advanceUser(user.id);
        engine.releaseSweep?.(user.id);
      }
      const reconcileInterval = rules.events.cleanupIntervalHours * rules.units.minutesPerHour * rules.units.secondsPerMinute * rules.units.millisecondsPerSecond;
      if (clock.now().getTime() - lastReconciliation >= reconcileInterval) {
        for (const user of users) {
          const today = engine.localDate(user.id, clock.now());
          engine.reconcileRange(user.id, shiftDate(today, -rules.events.reconciliationDays), today);
        }
        lastReconciliation = clock.now().getTime();
      }
      const auditInterval = rules.integrity.audit.intervalHours * rules.units.minutesPerHour * rules.units.secondsPerMinute * rules.units.millisecondsPerSecond;
      if (clock.now().getTime() - lastAudit >= auditInterval) {
        for (const user of users) engine.runIntegrityAudit?.(user.id,{persist:true});
        lastAudit = clock.now().getTime();
      }
      const cutoff = new Date(clock.now().getTime() - rules.events.retentionDays * rules.units.hoursPerDay * rules.units.minutesPerHour * rules.units.secondsPerMinute * rules.units.millisecondsPerSecond).toISOString();
      outbox.purgeProcessed(cutoff);
      outbox.purgeIdempotency(new Date(clock.now().getTime() - rules.idempotency.ttlHours * rules.units.minutesPerHour * rules.units.secondsPerMinute * rules.units.millisecondsPerSecond).toISOString());
    } catch (error) {
      try { logger.error?.('Gamification scheduler cycle failed.', error); } catch { /* logger failures are ignored */ }
    } finally { running = false; }
  }
  const timer = setInterval(tick, interval);
  timer.unref?.();
  void tick();
  return { tick, stop() { stopped = true; clearInterval(timer); } };
}
