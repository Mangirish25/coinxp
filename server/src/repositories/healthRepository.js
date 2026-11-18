export function checkDatabase(db) {
  return db.prepare('SELECT 1 AS ok').get().ok === 1;
}

export function operationalSnapshot(db) {
  return {
    deadEvents: db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE status='DEAD'").get().count,
    pendingEvents: db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE status='PENDING'").get().count,
    oldestPendingAt: db.prepare("SELECT MIN(occurred_at) AS value FROM domain_events WHERE status='PENDING'").get().value,
    lastSettlementAt: db.prepare('SELECT MAX(settled_at) AS value FROM settlements').get().value,
    lastIntegrityAuditAt: db.prepare('SELECT MAX(finished_at) AS value FROM integrity_audit_runs').get().value,
    activeHolds: db.prepare("SELECT COUNT(*) AS count FROM reward_holds WHERE status='ACTIVE'").get().count,
  };
}
