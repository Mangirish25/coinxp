export function createChallengeRepository(db) {
  return {
    transaction(work) { return db.transaction(work).immediate(); },
    active(userId) {
      const row = db.prepare(`SELECT id,user_id AS userId,challenge_slug AS challengeSlug,status,cost_xp AS costXp,purchase_id AS purchaseId,
        start_date AS startDate,end_date AS endDate,qualifying_days AS qualifyingDays,required_days AS requiredDays,closed_at AS closedAt,
        xp_awarded AS xpAwarded,catalog_version AS catalogVersion,created_at AS createdAt FROM challenge_runs
        WHERE user_id=? AND status IN ('PENDING','ACTIVE','DEFERRED') ORDER BY id LIMIT 1`).get(userId);
      return row ?? null;
    },
    run(userId, id) {
      return db.prepare(`SELECT id,user_id AS userId,challenge_slug AS challengeSlug,status,cost_xp AS costXp,purchase_id AS purchaseId,
        start_date AS startDate,end_date AS endDate,qualifying_days AS qualifyingDays,required_days AS requiredDays,closed_at AS closedAt,
        xp_awarded AS xpAwarded,catalog_version AS catalogVersion,created_at AS createdAt FROM challenge_runs WHERE id=? AND user_id=?`).get(id,userId) ?? null;
    },
    runs(userId) {
      return db.prepare(`SELECT id,challenge_slug AS challengeSlug,status,cost_xp AS costXp,start_date AS startDate,end_date AS endDate,
        qualifying_days AS qualifyingDays,required_days AS requiredDays,closed_at AS closedAt,xp_awarded AS xpAwarded,created_at AS createdAt
        FROM challenge_runs WHERE user_id=? ORDER BY id DESC LIMIT 20`).all(userId);
    },
    insertRun({ userId, slug, costXp, purchaseId, startDate, endDate, requiredDays, createdAt, catalogVersion }) {
      return Number(db.prepare(`INSERT INTO challenge_runs(user_id,challenge_slug,status,cost_xp,purchase_id,start_date,end_date,qualifying_days,required_days,xp_awarded,catalog_version,created_at)
        VALUES(?,?,'PENDING',?,?,?, ?,0,?,0,?,?)`).run(userId,slug,costXp,purchaseId,startDate,endDate,requiredDays,catalogVersion,createdAt).lastInsertRowid);
    },
    completedCount(userId, slug) { return db.prepare("SELECT count(*) AS count FROM challenge_runs WHERE user_id=? AND challenge_slug=? AND status='COMPLETED'").get(userId,slug).count; },
    recentlyCompleted(userId, slug, since) {
      return Boolean(db.prepare("SELECT 1 FROM challenge_runs WHERE user_id=? AND challenge_slug=? AND status='COMPLETED' AND closed_at>=? LIMIT 1").get(userId,slug,since));
    },
    setStatus(userId, id, status, closedAt = null, xpAwarded = null) {
      return db.prepare(`UPDATE challenge_runs SET status=?,closed_at=?,xp_awarded=COALESCE(?,xp_awarded),qualifying_days=(SELECT count(*) FROM challenge_days WHERE run_id=? AND status='FINAL' AND qualified=1)
        WHERE id=? AND user_id=? AND status IN ('PENDING','ACTIVE','DEFERRED')`).run(status,closedAt,xpAwarded,id,id,userId).changes > 0;
    },
    refreshProgress(userId, id) {
      return db.prepare(`UPDATE challenge_runs SET qualifying_days=(SELECT count(*) FROM challenge_days WHERE run_id=? AND status='FINAL' AND qualified=1)
        WHERE id=? AND user_id=?`).run(id,id,userId).changes > 0;
    },
    insertDay({ runId, date, qualified, details, status }) {
      if (status === 'DEFERRED') return db.prepare(`INSERT OR IGNORE INTO challenge_days(run_id,local_date,qualified,details_json,status) VALUES(?,?,0,?,'DEFERRED')`)
        .run(runId,date,JSON.stringify(details)).changes > 0;
      return db.prepare(`INSERT INTO challenge_days(run_id,local_date,qualified,details_json,status) VALUES(?,?,?,?,'FINAL')
        ON CONFLICT(run_id,local_date) DO UPDATE SET qualified=excluded.qualified,details_json=excluded.details_json,status='FINAL'
        WHERE challenge_days.status='DEFERRED'`).run(runId,date,qualified?1:0,JSON.stringify(details)).changes > 0;
    },
    day(runId, date) {
      const row = db.prepare('SELECT run_id AS runId,local_date AS localDate,qualified,details_json AS detailsJson,status FROM challenge_days WHERE run_id=? AND local_date=?').get(runId,date);
      return row ? { ...row, details: JSON.parse(row.detailsJson) } : null;
    },
    days(runId) {
      return db.prepare('SELECT local_date AS localDate,qualified,details_json AS detailsJson,status FROM challenge_days WHERE run_id=? ORDER BY local_date').all(runId)
        .map(({ detailsJson, ...row }) => ({ ...row, details: JSON.parse(detailsJson) }));
    },
    dayFacts(userId, date) {
      const settlement = db.prepare(`SELECT outcome,json_extract(details_json,'$.xpTracked') AS xpTracked FROM settlements
        WHERE user_id=? AND period_type='day' AND period_key=?`).get(userId,date);
      const review = db.prepare('SELECT xp_eligible AS xpEligible FROM daily_reviews WHERE user_id=? AND local_date=?').get(userId,date);
      const countedBudgetDay = Boolean(db.prepare(`SELECT 1 FROM settlements s WHERE s.user_id=? AND s.period_type='day' AND s.period_key=? AND s.outcome='PASS'
        AND EXISTS(SELECT 1 FROM xp_ledger l WHERE l.user_id=s.user_id AND l.entitlement_key='XP-003:'||s.period_key
          AND l.transition_no=(SELECT max(ll.transition_no) FROM xp_ledger ll WHERE ll.user_id=l.user_id AND ll.entitlement_key=l.entitlement_key)
          AND l.entry_type IN ('AWARD','REINSTATE'))`).get(userId,date));
      return { xpTracked: Boolean(settlement?.xpTracked), reviewDone: Boolean(review?.xpEligible), countedBudgetDay };
    },
    linkedPurchase(userId, purchaseId) {
      return db.prepare('SELECT id,ledger_entry_id AS ledgerEntryId,cost_xp AS costXp,status FROM purchases WHERE id=? AND user_id=?').get(purchaseId,userId) ?? null;
    },
    runByPurchase(userId,purchaseId) { return db.prepare(`SELECT id,status FROM challenge_runs WHERE user_id=? AND purchase_id=?`).get(userId,purchaseId)??null; },
    markRefunded(userId, purchaseId) { return db.prepare("UPDATE purchases SET status='REFUNDED' WHERE id=? AND user_id=? AND status='COMPLETED'").run(purchaseId,userId).changes > 0; },
    insertActivity({ userId, kind, id, status, occurredAt, data }) {
      return db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
        VALUES(?,?,?, ?,?,?,?,?)`).run(userId,kind,kind,String(id),occurredAt,`${kind}_${status}`,JSON.stringify(data),`${kind}:${id}:${status}`).changes > 0;
    },
    insertNotice({ userId, code, data, createdAt, dedupeKey }) {
      return db.prepare(`INSERT OR IGNORE INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at)
        VALUES(?,'REWARD',?,?,?,?)`).run(userId,code,JSON.stringify(data),dedupeKey,createdAt).changes > 0;
    },
  };
}
