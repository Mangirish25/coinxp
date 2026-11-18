const ownedTables = [
  'account_deletions','activity_backfill_runs','activity_items','badge_progress','badge_repeatable_periods','budget_history','budgets','celebration_claims',
  'case_actions','challenge_days','challenge_runs','daily_reviews','domain_events','entitlement_locks','freeze_ledger','gamification_flags',
  'integrity_cases','notification_preferences','purchases','request_idempotency','reward_holds','settlements',
  'streak_milestones','streak_periods','streak_runs','streak_state','timezone_changes','transaction_audit','transactions',
  'ui_preferences','user_badges','user_cosmetics','user_missions','user_notices','user_profile','user_progress','xp_ledger',
];
const repositoryCache = new WeakMap();

export function createAccountRepository(db) {
  if (repositoryCache.has(db)) return repositoryCache.get(db);
  const userProfile = db.prepare(`SELECT id,email,display_name AS displayName,timezone,created_at AS createdAt,updated_at AS updatedAt
    FROM users WHERE id=?`);
  const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name));
  const tableInfo = new Map(ownedTables.filter((table) => tableNames.has(table)).map((table) => [table, db.pragma(`table_info("${table}")`)]));
  const allOwnedTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all().map(({ name }) => name).filter((name) => name !== 'account_deletions' && name !== 'schema_migrations' && /^[a-z_][a-z0-9_]*$/i.test(name))
    .filter((name) => name === 'users' || db.pragma(`table_info("${name}")`).some(({ name: column }) => column === 'user_id'));
  const foreignKeys = new Map(allOwnedTables.map((table) => [table, db.pragma(`foreign_key_list("${table}")`).map(({ table: parent }) => parent)]));
  const deleteOrder = [];
  const visited = new Set();
  function visit(parent) {
    if (visited.has(parent)) return;
    visited.add(parent);
    for (const child of allOwnedTables) if (foreignKeys.get(child)?.includes(parent)) visit(child);
    deleteOrder.push(parent);
  }
  for (const table of allOwnedTables) visit(table);
  const pendingDeletion = db.prepare("SELECT requested_at AS requestedAt,scheduled_for AS scheduledFor,status FROM account_deletions WHERE user_id=?");

  const repository = {
    claimExport(userId, now, cutoff) {
      return db.prepare(`INSERT INTO account_export_limits(user_id,last_export_at) VALUES(?,?)
        ON CONFLICT(user_id) DO UPDATE SET last_export_at=excluded.last_export_at
        WHERE account_export_limits.last_export_at<=?`).run(userId, now, cutoff).changes === 1;
    },
    profile(userId) { return userProfile.get(userId) ?? null; },
    deletionStatus(userId) { return pendingDeletion.get(userId) ?? null; },
    scheduleDeletion(userId, requestedAt, scheduledFor) {
      const current = pendingDeletion.get(userId);
      if (current?.status === 'PENDING') return current;
      db.prepare(`INSERT INTO account_deletions(user_id,requested_at,scheduled_for,status)
        VALUES(?,?,?,'PENDING') ON CONFLICT(user_id) DO UPDATE SET requested_at=excluded.requested_at,
        scheduled_for=excluded.scheduled_for,status='PENDING',cancelled_at=NULL,completed_at=NULL`)
        .run(userId, requestedAt, scheduledFor);
      return pendingDeletion.get(userId);
    },
    restoreDeletion(userId, cancelledAt) {
      db.prepare("UPDATE account_deletions SET status='CANCELLED',cancelled_at=? WHERE user_id=? AND status='PENDING'")
        .run(cancelledAt, userId);
      return pendingDeletion.get(userId);
    },
    dueDeletions(now, limit = 50) {
      return db.prepare("SELECT user_id AS userId FROM account_deletions WHERE status='PENDING' AND scheduled_for<=? ORDER BY scheduled_for LIMIT ?")
        .all(now, limit);
    },
    purgeUser(userId, completedAt) {
      return db.transaction(() => {
        const row = pendingDeletion.get(userId);
        if (!row || row.status !== 'PENDING' || row.scheduledFor > completedAt) return false;
        db.prepare("UPDATE account_deletions SET status='PURGING' WHERE user_id=?").run(userId);
        for (const table of deleteOrder) {
          if (table === 'users') db.prepare('DELETE FROM users WHERE id=?').run(userId);
          else db.prepare(`DELETE FROM "${table}" WHERE user_id=?`).run(userId);
        }
        db.prepare("UPDATE account_deletions SET status='COMPLETED',completed_at=? WHERE user_id=?").run(completedAt, userId);
        return true;
      })();
    },
    *exportSections(userId) {
      const categories = db.prepare(`SELECT * FROM categories WHERE user_id IS NULL OR user_id=? ORDER BY user_id IS NOT NULL,id`).iterate(userId);
      yield ['categories', categories];
      for (const table of ownedTables) {
        if (!tableInfo.has(table)) continue;
        if (table === 'challenge_runs') {
          yield [table, db.prepare('SELECT * FROM challenge_runs WHERE user_id=? ORDER BY id').iterate(userId)];
        } else if (table === 'transactions' || table === 'budgets' || table === 'xp_ledger' || table === 'settlements') {
          yield [table, db.prepare(`SELECT * FROM "${table}" WHERE user_id=? ORDER BY id`).iterate(userId)];
        } else if (table === 'transaction_audit' || table === 'budget_history') {
          yield [table, db.prepare(`SELECT * FROM "${table}" WHERE user_id=? ORDER BY id`).iterate(userId)];
        } else if (table === 'challenge_days') {
          yield [table, db.prepare('SELECT d.* FROM challenge_days d JOIN challenge_runs r ON r.id=d.run_id WHERE r.user_id=? ORDER BY d.run_id,d.local_date').iterate(userId)];
        } else if (table === 'case_actions') {
          yield [table, db.prepare('SELECT a.* FROM case_actions a JOIN integrity_cases c ON c.id=a.case_id WHERE c.user_id=? ORDER BY a.id').iterate(userId)];
        } else {
          const columns = tableInfo.get(table);
          if (!columns.some(({ name }) => name === 'user_id')) continue;
          yield [table, db.prepare(`SELECT * FROM "${table}" WHERE user_id=? ORDER BY rowid`).iterate(userId)];
        }
      }
    },
  };
  repositoryCache.set(db, repository);
  return repository;
}
