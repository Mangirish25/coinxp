import rules from '../rules.config.js';

export function createLedgerRepository(db) {
  const numeric = (row, keys) => row && Object.fromEntries(Object.entries(row).map(([key, value]) => [key, keys.includes(key) && typeof value === 'bigint' ? safeInteger(value) : value]));
  return {
    ensureProgress(userId, startDate, now) {
      db.prepare(`INSERT OR IGNORE INTO user_progress(user_id,lifetime_xp,spendable_xp,max_level_reached,gamification_start_date,updated_at)
        VALUES (?,0,0,1,?,?)`).run(userId, startDate, now);
      return this.progress(userId);
    },
    progress(userId) {
      const row = db.prepare(`SELECT user_id AS userId,lifetime_xp AS lifetimeXp,spendable_xp AS spendableXp,
        max_level_reached AS maxLevelReached,gamification_start_date AS gamificationStartDate,
        last_ledger_id AS lastLedgerId,last_seen_ledger_id AS lastSeenLedgerId,last_settled_date AS lastSettledDate,updated_at AS updatedAt
        FROM user_progress WHERE user_id=?`).safeIntegers().get(userId);
      return numeric(row, ['userId','lifetimeXp','spendableXp','maxLevelReached','lastLedgerId','lastSeenLedgerId']);
    },
    getLedger(id) {
      return db.prepare('SELECT * FROM xp_ledger WHERE id=?').safeIntegers().get(id);
    },
    sourceAwardForKey(userId,key) {
      return numeric(db.prepare(`SELECT id,lifetime_delta AS lifetimeDelta,balance_delta AS balanceDelta FROM xp_ledger
        WHERE user_id=? AND entitlement_key=? AND entry_type IN ('AWARD','REINSTATE') ORDER BY transition_no DESC LIMIT 1`)
        .safeIntegers().get(userId,key), ['id','lifetimeDelta','balanceDelta']);
    },
    latestForKey(userId, key) {
      return numeric(db.prepare(`SELECT id,user_id AS userId,entry_type AS entryType,rule_id AS ruleId,entitlement_key AS entitlementKey,
        transition_no AS transitionNo,idempotency_key AS idempotencyKey,lifetime_delta AS lifetimeDelta,balance_delta AS balanceDelta,
        period_type AS periodType,period_key AS periodKey,reverses_entry_id AS reversesEntryId,source_event_id AS sourceEventId,
        reason_code AS reasonCode,note,config_version AS configVersion,actor,created_at AS createdAt
        FROM xp_ledger WHERE user_id=? AND entitlement_key=? ORDER BY transition_no DESC LIMIT 1`).safeIntegers().get(userId,key), ['id','userId','transitionNo','lifetimeDelta','balanceDelta','reversesEntryId']);
    },
    activeAmountForDay(userId, date) {
      const row = db.prepare(`SELECT COALESCE(SUM(lifetime_delta),0) AS amount FROM xp_ledger
        WHERE user_id=? AND period_type='day' AND period_key=? AND rule_id IN ('XP-001','XP-002','XP-003')`).safeIntegers().get(userId,date);
      return safeInteger(row.amount);
    },
    insert(entry) {
      const result = db.prepare(`INSERT INTO xp_ledger(user_id,entry_type,rule_id,entitlement_key,transition_no,idempotency_key,
        lifetime_delta,balance_delta,period_type,period_key,reverses_entry_id,source_event_id,reason_code,note,config_version,actor,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(entry.userId,entry.entryType,entry.ruleId,entry.entitlementKey,entry.transitionNo,
        entry.idempotencyKey,entry.lifetimeDelta,entry.balanceDelta,entry.periodType,entry.periodKey,entry.reversesEntryId,
        entry.sourceEventId,entry.reasonCode,entry.note,entry.configVersion,entry.actor,entry.createdAt);
      return Number(result.lastInsertRowid);
    },
    updateProgress(userId, { lifetimeXp, spendableXp, maxLevelReached, lastLedgerId, updatedAt }) {
      db.prepare(`UPDATE user_progress SET lifetime_xp=?,spendable_xp=?,max_level_reached=?,last_ledger_id=?,updated_at=? WHERE user_id=?`)
        .run(lifetimeXp,spendableXp,maxLevelReached,lastLedgerId,updatedAt,userId);
    },
    totals(userId) {
      return numeric(db.prepare(`SELECT COALESCE(SUM(lifetime_delta),0) AS lifetimeXp,COALESCE(SUM(balance_delta),0) AS spendableXp,
        COALESCE(MAX(id),0) AS lastLedgerId FROM xp_ledger WHERE user_id=?`).safeIntegers().get(userId), ['lifetimeXp','spendableXp','lastLedgerId']);
    },
    rebuildProgress(userId, { lifetimeXp, spendableXp, maxLevelReached, lastLedgerId, updatedAt }) {
      db.prepare(`UPDATE user_progress SET lifetime_xp=?,spendable_xp=?,max_level_reached=?,last_ledger_id=?,updated_at=? WHERE user_id=?`)
        .run(lifetimeXp, spendableXp, maxLevelReached, lastLedgerId, updatedAt, userId);
    },
    list(userId, { page, pageSize, ruleId, from, to }) {
      const clauses=['user_id=?']; const values=[userId];
      if(ruleId){clauses.push('rule_id=?');values.push(ruleId);}
      if(from){clauses.push('created_at>=?');values.push(`${from}T00:00:00.000Z`);}
      if(to){clauses.push('created_at<=?');values.push(`${to}T23:59:59.999Z`);}
      const where=clauses.join(' AND ');
      const total=db.prepare(`SELECT count(*) AS count FROM xp_ledger WHERE ${where}`).get(...values).count;
      const rows=db.prepare(`SELECT id,entry_type AS entryType,rule_id AS ruleId,entitlement_key AS entitlementKey,transition_no AS transitionNo,
        lifetime_delta AS lifetimeDelta,balance_delta AS balanceDelta,period_type AS periodType,period_key AS periodKey,
        reverses_entry_id AS reversesEntryId,source_event_id AS sourceEventId,reason_code AS reasonCode,note,created_at AS createdAt
        FROM xp_ledger WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).safeIntegers().all(...values,pageSize,(page-1)*pageSize)
        .map((row)=>numeric(row,['id','transitionNo','lifetimeDelta','balanceDelta','reversesEntryId']));
      return {rows,total};
    },
    lastEntries(userId, limit) {
      return db.prepare(`SELECT id,entry_type AS entryType,rule_id AS ruleId,entitlement_key AS entitlementKey,transition_no AS transitionNo,
        lifetime_delta AS lifetimeDelta,balance_delta AS balanceDelta,period_type AS periodType,period_key AS periodKey,
        reverses_entry_id AS reversesEntryId,source_event_id AS sourceEventId,reason_code AS reasonCode,note,created_at AS createdAt
        FROM xp_ledger WHERE user_id=? ORDER BY id DESC LIMIT ?`).safeIntegers().all(userId,limit)
        .map((row)=>numeric(row,['id','transitionNo','lifetimeDelta','balanceDelta','reversesEntryId']));
    },
    unseen(userId, afterId) {
      return db.prepare(`SELECT id,entry_type AS entryType,rule_id AS ruleId,entitlement_key AS entitlementKey,lifetime_delta AS delta,
        reason_code AS reasonCode,note,created_at AS createdAt FROM xp_ledger WHERE user_id=? AND id>? ORDER BY id`).safeIntegers().all(userId,afterId)
        .map((row)=>numeric(row,['id','delta']));
    },
    ownsLedgerId(userId, ledgerId) { return db.prepare('SELECT 1 AS yes FROM xp_ledger WHERE id=? AND user_id=?').get(ledgerId,userId)!==undefined; },
    acknowledge(userId, ledgerId, now) {
      return db.prepare(`UPDATE user_progress SET last_seen_ledger_id=MAX(last_seen_ledger_id,?),updated_at=? WHERE user_id=?`).run(ledgerId,now,userId).changes;
    },
    listKeys(userId, prefix = null) {
      return prefix === null
        ? db.prepare(`SELECT DISTINCT entitlement_key AS key FROM xp_ledger WHERE user_id=? AND entitlement_key IS NOT NULL`).all(userId).map((row)=>row.key)
        : db.prepare(`SELECT DISTINCT entitlement_key AS key FROM xp_ledger WHERE user_id=? AND entitlement_key LIKE ?`).all(userId,`${prefix}%`).map((row)=>row.key);
    },
    raiseFlag(userId, code, date, details, now) {
      const dedupeKey = `${code}:${date}`;
      return db.prepare(`INSERT OR IGNORE INTO gamification_flags(user_id,code,local_date,details_json,created_at,severity_points,evidence_json,detector_version,dedupe_key)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(userId,code,date,JSON.stringify(details),now,rules.integrity.scoring.points[code] ?? 0,JSON.stringify(details),rules.integrity.detectors.version,dedupeKey).changes > 0;
    },
    flag(userId, code, date, details, now) { return this.raiseFlag(userId,code,date,details,now); },
    listFlags(userId) { return db.prepare(`SELECT code,local_date AS localDate,details_json AS detailsJson,created_at AS createdAt,status FROM gamification_flags WHERE user_id=? ORDER BY id DESC`).all(userId).map(row=>({...row,details:JSON.parse(row.detailsJson)})); },
    isKeyLocked(userId,key) {
      const entitlementLock=db.prepare(`SELECT 1 AS yes FROM entitlement_locks WHERE user_id=? AND entitlement_key=? LIMIT 1`).get(userId,key);
      if(entitlementLock)return true;
      const row=db.prepare(`SELECT 1 AS yes FROM gamification_flags WHERE user_id=? AND code='KEY_LOCKED' AND instr(details_json,?)>0 LIMIT 1`).get(userId,key);
      return row!==undefined;
    },
    lockEntitlement(userId,key,reason,now) {
      return db.prepare(`INSERT OR IGNORE INTO entitlement_locks(user_id,entitlement_key,reason,created_at) VALUES(?,?,?,?)`).run(userId,key,reason,now).changes > 0;
    },
    recentFlagCount(userId,code,since) { return db.prepare(`SELECT count(*) AS count FROM gamification_flags WHERE user_id=? AND code=? AND created_at>=?`).get(userId,code,since).count; },
    updateLastSettled(userId, date, now) { db.prepare('UPDATE user_progress SET last_settled_date=?,updated_at=? WHERE user_id=?').run(date,now,userId); },
  };
}

function safeInteger(value) {
  const result=typeof value==='bigint'?value:BigInt(value??0);
  if(result>BigInt(Number.MAX_SAFE_INTEGER)||result<BigInt(Number.MIN_SAFE_INTEGER))throw new RangeError('XP total exceeds the safe integer range.');
  return Number(result);
}
