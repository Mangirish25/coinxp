export function createIntegrityRepository(db) {
  return {
    recentFlags(userId, since) {
      return db.prepare(`SELECT code,status,severity_points AS severityPoints,created_at AS createdAt,local_date AS localDate
        FROM gamification_flags WHERE user_id=? AND created_at>=?`).all(userId,since);
    },
    autoHoldCountSince(userId, since) { return db.prepare(`SELECT count(*) AS count FROM reward_holds WHERE user_id=? AND auto=1 AND created_at>=?`).get(userId,since).count; },
    canNudgeSince(userId, since) { return !db.prepare(`SELECT 1 FROM user_notices WHERE user_id=? AND code='INTEGRITY_NUDGE' AND created_at>=? LIMIT 1`).get(userId,since); },
    openRiskCase({ userId, score, distinct, createdAt }) {
      const existing = db.prepare(`SELECT id FROM integrity_cases WHERE user_id=? AND status IN ('OPEN','IN_REVIEW') ORDER BY id DESC LIMIT 1`).get(userId);
      if (existing) { db.prepare('UPDATE integrity_cases SET risk_score=?,distinct_codes=? WHERE id=?').run(score,distinct,existing.id); return existing.id; }
      const result = db.prepare(`INSERT INTO integrity_cases(user_id,status,risk_score,distinct_codes,opened_at) VALUES(?,'IN_REVIEW',?,?,?)`).run(userId,score,distinct,createdAt);
      const caseId = Number(result.lastInsertRowid);
      db.prepare(`INSERT OR IGNORE INTO case_actions(case_id,action,actor,note,payload_json,idempotency_key,created_at)
        VALUES(?,'OPENED','system',NULL,'{}',?,?)`).run(caseId,`CASE${caseId}:OPENED:1`,createdAt);
      return caseId;
    },
    createAutoHold({ userId, caseId, startsAt, endsAt }) {
      const result = db.prepare(`INSERT INTO reward_holds(user_id,case_id,scope,status,auto,starts_at,ends_at,created_at)
        VALUES(?,?,'OUTCOME_XP','ACTIVE',1,?,?,?)`).run(userId,caseId,startsAt,endsAt,startsAt);
      const holdId = Number(result.lastInsertRowid);
      db.prepare(`INSERT OR IGNORE INTO case_actions(case_id,action,actor,note,payload_json,idempotency_key,created_at)
        VALUES(?,'AUTO_HOLD','system',NULL,?,?,?)`).run(caseId,JSON.stringify({holdId,endsAt}),`CASE${caseId}:AUTO_HOLD:${holdId}`,startsAt);
      return holdId;
    },
    attachRecentFlagsToCase(userId, caseId, since) { return db.prepare(`UPDATE gamification_flags SET case_id=? WHERE user_id=? AND created_at>=? AND case_id IS NULL`).run(caseId,userId,since).changes; },
    expiredHolds(userId, now) { return db.prepare(`SELECT id,case_id AS caseId FROM reward_holds WHERE user_id=? AND status='ACTIVE' AND ends_at<=?`).all(userId,now); },
    expireHold(id, now) { return db.prepare(`UPDATE reward_holds SET status='EXPIRED',released_at=? WHERE id=? AND status='ACTIVE'`).run(now,id).changes; },
    recordReleaseAction(caseId, holdId, now) { return db.prepare(`INSERT OR IGNORE INTO case_actions(case_id,action,actor,payload_json,idempotency_key,created_at)
      VALUES(?,'RELEASE_HOLD','system',?,?,?)`).run(caseId,JSON.stringify({holdId}),`HOLD${holdId}:RELEASE`,now).changes; },
    insertNotice({ userId, kind, code, data = {}, dedupeKey, createdAt, ledgerEntryId = null }) {
      const result = db.prepare(`INSERT OR IGNORE INTO user_notices
        (user_id,kind,code,data_json,ledger_entry_id,dedupe_key,created_at)
        VALUES(?,?,?,?,?,?,?)`).run(userId, kind, code, JSON.stringify(data), ledgerEntryId, dedupeKey, createdAt);
      return Number(result.lastInsertRowid) || null;
    },
    listNotices(userId, { page, pageSize, unreadOnly, kind }) {
      const where = ['user_id = ?']; const values = [userId];
      if (unreadOnly) where.push('read_at IS NULL');
      if (kind) { where.push('kind = ?'); values.push(kind); }
      const clause = where.join(' AND ');
      const total = db.prepare(`SELECT count(*) AS count FROM user_notices WHERE ${clause}`).get(...values).count;
      const data = db.prepare(`SELECT id,kind,code,data_json AS dataJson,ledger_entry_id AS ledgerEntryId,created_at AS createdAt,read_at AS readAt
        FROM user_notices WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values,pageSize,(page-1)*pageSize);
      return { data: data.map((row) => ({ ...row, data: JSON.parse(row.dataJson) })), total };
    },
    acknowledgeThrough(userId, upToId, readAt) {
      return db.prepare(`UPDATE user_notices SET read_at = COALESCE(read_at, ?)
        WHERE user_id = ? AND id <= ?`).run(readAt,userId,upToId).changes;
    },
    unreadCount(userId) { return db.prepare('SELECT count(*) AS count FROM user_notices WHERE user_id=? AND read_at IS NULL').get(userId).count; },
    activeHold(userId, now) {
      return db.prepare(`SELECT id,scope,ends_at AS holdUntil,case_id AS caseId FROM reward_holds
        WHERE user_id=? AND status='ACTIVE' AND starts_at<=? AND ends_at>? ORDER BY ends_at DESC,id DESC LIMIT 1`).get(userId,now,now) ?? null;
    },
    hasActiveHoldForScope(userId, scope, now) {
      return Boolean(db.prepare(`SELECT 1 FROM reward_holds WHERE user_id=? AND scope=? AND status='ACTIVE'
        AND starts_at<=? AND ends_at>? LIMIT 1`).get(userId,scope,now,now));
    },
    latestNotice(userId) { return db.prepare('SELECT code FROM user_notices WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId)?.code ?? null; },
    eligibleAppealCase(userId, now, since) {
      return db.prepare(`SELECT c.id,c.status,c.resolution,c.appeal_count AS appealCount FROM integrity_cases c
        WHERE c.user_id=? AND c.appeal_count=0 AND (EXISTS (SELECT 1 FROM reward_holds h WHERE h.case_id=c.id AND h.status='ACTIVE' AND h.ends_at>?)
          OR (c.status='RESOLVED' AND c.resolution IN ('CLAWBACK','RESTRICTED') AND c.resolved_at>=?))
        ORDER BY CASE WHEN c.status='RESOLVED' THEN 1 ELSE 0 END,c.opened_at DESC LIMIT 1`).get(userId,now,since) ?? null;
    },
    recordAppeal({ caseId, message, userId, createdAt, idempotencyKey }) {
      return db.transaction(() => {
        const row = db.prepare(`SELECT id FROM integrity_cases WHERE id=? AND user_id=? AND appeal_count=0`).get(caseId,userId);
        if (!row) return false;
        db.prepare(`INSERT INTO case_actions(case_id,action,actor,note,payload_json,idempotency_key,created_at)
          VALUES(?,'APPEAL','user',?,'{}',?,?)`).run(caseId,message,idempotencyKey,createdAt);
        db.prepare('UPDATE integrity_cases SET appeal_count=appeal_count+1 WHERE id=? AND user_id=?').run(caseId,userId);
        return true;
      })();
    },
    findUserCase(userId, caseId) { return db.prepare('SELECT id FROM integrity_cases WHERE id=? AND user_id=?').get(caseId,userId) ?? null; },
  };
}
