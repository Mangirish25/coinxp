const ownedTables = [
  'activity_backfill_runs','activity_items','badge_progress','badge_repeatable_periods','budget_history','budgets',
  'case_actions','challenge_days','challenge_runs','daily_reviews','domain_events','entitlement_locks','freeze_ledger','gamification_flags',
  'integrity_cases','notification_preferences','purchases','request_idempotency','reward_holds','settlements',
  'streak_milestones','streak_periods','streak_runs','streak_state','timezone_changes','transaction_audit','transactions',
  'ui_preferences','user_badges','user_cosmetics','user_missions','user_notices','user_profile','user_progress','xp_ledger',
];

export function createAccountRepository(db) {
  const userProfile = db.prepare(`SELECT id,email,display_name AS displayName,timezone,created_at AS createdAt,updated_at AS updatedAt
    FROM users WHERE id=?`);
  const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(({ name }) => name));
  const tableInfo = new Map(ownedTables.filter((table) => tableNames.has(table)).map((table) => [table, db.pragma(`table_info("${table}")`)]));

  return {
    claimExport(userId, now, cutoff) {
      return db.prepare(`INSERT INTO account_export_limits(user_id,last_export_at) VALUES(?,?)
        ON CONFLICT(user_id) DO UPDATE SET last_export_at=excluded.last_export_at
        WHERE account_export_limits.last_export_at<=?`).run(userId, now, cutoff).changes === 1;
    },
    profile(userId) { return userProfile.get(userId) ?? null; },
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
}
