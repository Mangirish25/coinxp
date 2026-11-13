export function createSettlementRepository(db) {
  return {
    get(userId, periodType, periodKey) {
      const row=db.prepare(`SELECT id,user_id AS userId,period_type AS periodType,period_key AS periodKey,outcome,reason_code AS reasonCode,
        details_json AS detailsJson,settled_at AS settledAt,rule_version AS ruleVersion FROM settlements WHERE user_id=? AND period_type=? AND period_key=?`)
        .get(userId,periodType,periodKey);
      return row&&{...row,details:JSON.parse(row.detailsJson)};
    },
    insert(row) {
      const result=db.prepare(`INSERT OR IGNORE INTO settlements(user_id,period_type,period_key,outcome,reason_code,details_json,settled_at,rule_version)
        VALUES(?,?,?,?,?,?,?,?)`).run(row.userId,row.periodType,row.periodKey,row.outcome,row.reasonCode,JSON.stringify(row.details),row.settledAt,row.ruleVersion);
      return result.changes>0;
    },
    list(userId, periodType, fromKey, toKey) {
      return db.prepare(`SELECT period_key AS periodKey,outcome,reason_code AS reasonCode,details_json AS detailsJson,settled_at AS settledAt
        FROM settlements WHERE user_id=? AND period_type=? AND period_key>=? AND period_key<=? ORDER BY period_key`)
        .all(userId,periodType,fromKey,toKey).map(row=>({...row,details:JSON.parse(row.detailsJson)}));
    },
    allDays(userId) {
      return db.prepare(`SELECT period_key AS periodKey,outcome,reason_code AS reasonCode,details_json AS detailsJson FROM settlements
        WHERE user_id=? AND period_type='day' ORDER BY period_key`).all(userId).map(row=>({...row,details:JSON.parse(row.detailsJson)}));
    },
    users() { return db.prepare('SELECT id,timezone FROM users ORDER BY id').all(); },
  };
}
