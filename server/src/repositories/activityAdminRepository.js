const eventTypes=['TRANSACTION_CREATED','TRANSACTION_UPDATED','TRANSACTION_DELETED','TRANSACTION_RESTORED','XP_EARNED','XP_DEDUCTED','STREAK_MILESTONE_REACHED','STREAK_BROKEN','STREAK_RESTORED','BADGE_UNLOCKED','BADGE_REVOKED','MISSION_ASSIGNED','MISSION_COMPLETED','MISSION_EXPIRED','MISSION_REROLLED','CHALLENGE_STARTED','CHALLENGE_DAY_EVALUATED','CHALLENGE_COMPLETED','CHALLENGE_FAILED','CHALLENGE_ABANDONED','CHALLENGE_CANCELLED','PURCHASE_COMPLETED','PURCHASE_REFUNDED','LEVEL_UP'];

export function createActivityAdminRepository(db) {
  return {
    sources(userId=null) {
      const userClause=userId===null?'':' AND user_id=?'; const args=userId===null?[]:[userId];
      const marks=eventTypes.map(()=>'?').join(',');
      const events=db.prepare(`SELECT event_id AS eventId,event_type AS eventType,user_id AS userId,payload_json AS payloadJson,
        occurred_at AS occurredAt,dedupe_key AS dedupeKey FROM domain_events WHERE event_type IN (${marks})${userClause} ORDER BY seq`).all(...eventTypes,...args)
        .map(({payloadJson,...row})=>({...row,event:JSON.parse(payloadJson)}));
      const audits=db.prepare(`SELECT a.id,a.transaction_id AS transactionId,a.user_id AS userId,a.action,a.changed_fields AS changedFields,
        a.before_json AS beforeJson,a.after_json AS afterJson,a.created_at AS occurredAt FROM transaction_audit a
        WHERE NOT EXISTS(SELECT 1 FROM domain_events e WHERE e.user_id=a.user_id AND e.event_type=CASE a.action WHEN 'create' THEN 'TRANSACTION_CREATED' WHEN 'update' THEN 'TRANSACTION_UPDATED' WHEN 'delete' THEN 'TRANSACTION_DELETED' ELSE 'TRANSACTION_RESTORED' END
          AND json_extract(e.payload_json,'$.data.transactionId')=a.transaction_id)${userId===null?'':' AND a.user_id=?'} ORDER BY a.id`).all(...args)
        .map((row)=>({...row,before:row.beforeJson?JSON.parse(row.beforeJson):null,after:row.afterJson?JSON.parse(row.afterJson):null,changedFields:row.changedFields?JSON.parse(row.changedFields):[]}));
      const ledger=db.prepare(`SELECT l.id,l.user_id AS userId,l.entry_type AS entryType,l.rule_id AS ruleId,l.lifetime_delta AS delta,
        l.reason_code AS reasonCode,l.created_at AS occurredAt FROM xp_ledger l WHERE l.entry_type<>'SPEND'
        AND NOT EXISTS(SELECT 1 FROM domain_events e WHERE e.user_id=l.user_id AND json_extract(e.payload_json,'$.data.ledgerId')=l.id)${userId===null?'':' AND l.user_id=?'} ORDER BY l.id`).all(...args);
      const purchases=db.prepare(`SELECT p.id,p.user_id AS userId,p.item_slug AS itemSlug,p.item_type AS itemType,p.status,p.created_at AS occurredAt
        FROM purchases p WHERE NOT EXISTS(SELECT 1 FROM activity_items a WHERE a.user_id=p.user_id AND a.ref_type='PURCHASE' AND a.ref_id=CAST(p.id AS TEXT))${userId===null?'':' AND p.user_id=?'} ORDER BY p.id`).all(...args);
      return {events,audits,ledger,purchases};
    },
    insert({userId,kind,refType,refId,occurredAt,summaryCode,data,dedupeKey}) {
      return db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
        VALUES(?,?,?,?,?,?,?,?)`).run(userId,kind,refType,refId,occurredAt,summaryCode,JSON.stringify(data),dedupeKey).changes>0;
    },
    recordRun({userId,actor,note,insertedCount,createdAt}) {
      return Number(db.prepare(`INSERT INTO activity_backfill_runs(user_id,actor,note,inserted_count,created_at) VALUES(?,?,?,?,?)`)
        .run(userId,actor,note,insertedCount,createdAt).lastInsertRowid);
    },
    transaction(work) { return db.transaction(work).immediate(); },
  };
}
