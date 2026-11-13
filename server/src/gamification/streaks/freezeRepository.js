export function createFreezeRepository(db) {
  return {
    inventoryAsOf(userId, cutoff) {
      return db.prepare('SELECT COALESCE(SUM(delta),0) AS inventory FROM freeze_ledger WHERE user_id=? AND effective_at<=?')
        .get(userId, cutoff).inventory;
    },
    insert(entry) {
      return db.prepare(`INSERT OR IGNORE INTO freeze_ledger(user_id,delta,reason,effective_at,effective_local_date,period_key,idempotency_key,actor,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(entry.userId, entry.delta, entry.reason, entry.effectiveAt, entry.effectiveLocalDate,
        entry.periodKey ?? null, entry.idempotencyKey, entry.actor, entry.createdAt).changes > 0;
    },
    list(userId) {
      return db.prepare(`SELECT id,delta,reason,effective_at AS effectiveAt,effective_local_date AS effectiveLocalDate,
        period_key AS periodKey,idempotency_key AS idempotencyKey,actor,created_at AS createdAt
        FROM freeze_ledger WHERE user_id=? ORDER BY effective_at,id`).all(userId);
    },
    countUsedSince(userId, since) {
      return db.prepare(`SELECT count(*) AS count FROM freeze_ledger WHERE user_id=? AND reason='USED' AND effective_at>=?`)
        .get(userId, since).count;
    },
  };
}
