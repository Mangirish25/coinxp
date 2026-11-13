export function createIntegrityRepository(db) {
  return {
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
