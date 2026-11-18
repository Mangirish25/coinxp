export function createBadgeAdminRepository(db) {
  return {
    badge(userId,slug,tier) { return db.prepare(`SELECT user_id AS userId,badge_slug AS slug,tier,status,xp_awarded AS xpAwarded
      FROM user_badges WHERE user_id=? AND badge_slug=? AND tier=?`).get(userId,slug,tier)??null; },
    caseForUser(caseId,userId) { return db.prepare('SELECT id FROM integrity_cases WHERE id=? AND user_id=?').get(caseId,userId)??null; },
    revoke({userId,slug,tier,actor,caseId,note,at}) {
      return db.prepare(`UPDATE user_badges SET status='REVOKED',revoked_at=?,revoked_by=?,case_id=?,revoke_reason=?
        WHERE user_id=? AND badge_slug=? AND tier=? AND status='ACTIVE'`).run(at,actor,caseId,note,userId,slug,tier).changes>0;
    },
    action({caseId,actor,note,payload,key,at}) {
      return db.prepare(`INSERT OR IGNORE INTO case_actions(case_id,action,actor,note,payload_json,idempotency_key,created_at)
        VALUES(?,'NOTE',?,?,?, ?,?)`).run(caseId,actor,note,JSON.stringify({action:'BADGE_REVOKED',...payload}),key,at).changes>0;
    },
    notice({userId,slug,tier,at}) {
      db.prepare(`INSERT OR IGNORE INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at)
        VALUES(?,'REWARD','BADGE_REVOKED',?,?,?)`).run(userId,JSON.stringify({slug,tier}),`BADGE:${userId}:${slug}:${tier}:REVOKED`,at);
    },
    activity({userId,slug,tier,at}) {
      db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
        VALUES(?,'BADGE','BADGE',?,?,'BADGE_REVOKED',?,?)`).run(userId,`${slug}:${tier}`,at,JSON.stringify({slug,tier}),`BADGE:${userId}:${slug}:${tier}:REVOKED`);
    },
  };
}
