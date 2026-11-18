import { statSync } from 'node:fs';
import { checkDatabase, operationalSnapshot } from '../repositories/healthRepository.js';
import { migrationStatus } from '../db/migrator.js';
import { HEALTH_CONFIG } from '../config/healthConfig.js';

export function getHealth(db, clock = () => new Date(), gameEngine) {
  if (!checkDatabase(db)) throw new Error('Database health query returned an unexpected result.');
  return { status: 'ok', db: 'connected', time: clock().toISOString(), gamificationDeadEvents: gameEngine?.dependencies.outbox.deadCount() ?? 0 };
}

export function getReadiness(db, { scheduler = null, schedulerRequired = false, now = new Date() } = {}) {
  try {
    if (!checkDatabase(db)) return { ready: false, reason: 'database_unavailable' };
    const migrations = migrationStatus(db);
    if (!migrations.current) return { ready: false, reason: 'migrations_pending' };
    if (schedulerRequired) {
      const heartbeat = scheduler?.lastHeartbeatAt ? new Date(scheduler.lastHeartbeatAt).getTime() : 0;
      if (!heartbeat || now.getTime() - heartbeat > HEALTH_CONFIG.schedulerHeartbeatGraceMs) {
        return { ready: false, reason: 'scheduler_unavailable' };
      }
    }
    return { ready: true };
  } catch {
    return { ready: false, reason: 'readiness_check_failed' };
  }
}

export function getHealthDetails(db, { dbPath, now = new Date(), scheduler = null } = {}) {
  const snapshot = operationalSnapshot(db);
  let dbSizeBytes = null;
  if (dbPath && dbPath !== ':memory:') {
    try { dbSizeBytes = statSync(dbPath).size; } catch { dbSizeBytes = null; }
  }
  const lagMs = snapshot.oldestPendingAt ? Math.max(0, now.getTime() - new Date(snapshot.oldestPendingAt).getTime()) : null;
  return {
    deadLetterEvents: snapshot.deadEvents,
    pendingEventCount: snapshot.pendingEvents,
    pendingEventLagMs: lagMs,
    lastSettlementAt: snapshot.lastSettlementAt,
    lastBackupAt: null,
    databaseSizeBytes: dbSizeBytes,
    lastIntegrityAuditAt: snapshot.lastIntegrityAuditAt,
    activeHolds: snapshot.activeHolds,
    scheduler: scheduler ? { lastHeartbeatAt: scheduler.lastHeartbeatAt, running: scheduler.running } : null,
  };
}
