export function createStreakRepository(db) {
  return {
    getState(userId, streakType) {
      return db.prepare(`SELECT user_id AS userId, streak_type AS streakType, status,
        current_run_id AS currentRunId, current_length AS currentLength, longest_length AS longestLength,
        last_processed_key AS lastProcessedKey, last_counted_key AS lastCountedKey,
        consecutive_frozen AS consecutiveFrozen, updated_at AS updatedAt
        FROM streak_state WHERE user_id=? AND streak_type=?`).get(userId, streakType);
    },
    ensureState(userId, streakType, now) {
      db.prepare(`INSERT OR IGNORE INTO streak_state(user_id,streak_type,status,updated_at)
        VALUES(?,?,'NONE',?)`).run(userId, streakType, now);
      return this.getState(userId, streakType);
    },
    createRun({ userId, streakType, startedKey, createdAt }) {
      return Number(db.prepare(`INSERT INTO streak_runs(user_id,streak_type,started_key,created_at)
        VALUES(?,?,?,?)`).run(userId, streakType, startedKey, createdAt).lastInsertRowid);
    },
    updateRun(id, { endedKey, endReason, countedDays, lengthOffset, lengthAtEnd, restoredFromRunId, restoredAtKey, genuineDaysSinceRestore }) {
      db.prepare(`UPDATE streak_runs SET ended_key=?,end_reason=?,counted_days=?,length_offset=?,length_at_end=?,
        restored_from_run_id=?,restored_at_key=?,genuine_days_since_restore=? WHERE id=?`)
        .run(endedKey, endReason, countedDays, lengthOffset, lengthAtEnd, restoredFromRunId, restoredAtKey, genuineDaysSinceRestore, id);
    },
    updateComeback(id, comebackJson) {
      db.prepare('UPDATE streak_runs SET comeback_json=? WHERE id=?').run(comebackJson, id);
    },
    getRun(id) {
      return db.prepare(`SELECT id,user_id AS userId,streak_type AS streakType,started_key AS startedKey,
        ended_key AS endedKey,end_reason AS endReason,counted_days AS countedDays,length_offset AS lengthOffset,
        length_at_end AS lengthAtEnd,restored_from_run_id AS restoredFromRunId,restored_at_key AS restoredAtKey,
        genuine_days_since_restore AS genuineDaysSinceRestore FROM streak_runs WHERE id=?`).get(id);
    },
    activeRun(userId, streakType) {
      return db.prepare(`SELECT r.id,r.user_id AS userId,r.streak_type AS streakType,r.started_key AS startedKey,
        r.counted_days AS countedDays,r.length_offset AS lengthOffset,r.restored_from_run_id AS restoredFromRunId,
        r.restored_at_key AS restoredAtKey,r.genuine_days_since_restore AS genuineDaysSinceRestore
        FROM streak_state s JOIN streak_runs r ON r.id=s.current_run_id
        WHERE s.user_id=? AND s.streak_type=? AND s.status='ACTIVE'`).get(userId, streakType);
    },
    previousRun(userId, streakType) {
      const row = db.prepare(`SELECT id,length_at_end AS length,ended_key AS endedKey,
        restored_from_run_id AS restoredFromRunId,genuine_days_since_restore AS genuineDaysSinceRestore
        FROM streak_runs WHERE user_id=? AND streak_type=? AND ended_key IS NOT NULL ORDER BY ended_key DESC,id DESC LIMIT 1`).get(userId, streakType);
      return row && { ...row, wasRestored: row.restoredFromRunId !== null };
    },
    saveState({ userId, streakType, status, currentRunId, currentLength, longestLength, lastProcessedKey, lastCountedKey, consecutiveFrozen, updatedAt }) {
      db.prepare(`INSERT INTO streak_state(user_id,streak_type,status,current_run_id,current_length,longest_length,
        last_processed_key,last_counted_key,consecutive_frozen,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id,streak_type) DO UPDATE SET status=excluded.status,current_run_id=excluded.current_run_id,
        current_length=excluded.current_length,longest_length=excluded.longest_length,last_processed_key=excluded.last_processed_key,
        last_counted_key=excluded.last_counted_key,consecutive_frozen=excluded.consecutive_frozen,updated_at=excluded.updated_at`)
        .run(userId, streakType, status, currentRunId, currentLength, longestLength, lastProcessedKey, lastCountedKey, consecutiveFrozen, updatedAt);
    },
    insertPeriod({ userId, streakType, periodKey, status, runId, reasonCode, processedAt }) {
      return db.prepare(`INSERT OR IGNORE INTO streak_periods(user_id,streak_type,period_key,status,run_id,reason_code,processed_at)
        VALUES(?,?,?,?,?,?,?)`).run(userId, streakType, periodKey, status, runId, reasonCode, processedAt).changes > 0;
    },
    period(userId, streakType, periodKey) {
      return db.prepare(`SELECT user_id AS userId,streak_type AS streakType,period_key AS periodKey,status,run_id AS runId,
        reason_code AS reasonCode,processed_at AS processedAt FROM streak_periods WHERE user_id=? AND streak_type=? AND period_key=?`)
        .get(userId, streakType, periodKey);
    },
    lengthAt(userId, streakType, periodKey) {
      const period = this.period(userId, streakType, periodKey);
      if (!period?.runId || !['COUNTED', 'FROZEN'].includes(period.status)) return 0;
      const run = db.prepare('SELECT length_offset AS lengthOffset FROM streak_runs WHERE id=? AND user_id=?').get(period.runId, userId);
      if (!run) return 0;
      const counted = db.prepare(`SELECT count(*) AS count FROM streak_periods WHERE user_id=? AND streak_type=? AND run_id=?
        AND period_key<=? AND status='COUNTED'`).get(userId, streakType, period.runId, periodKey).count;
      return Math.max(0, Number(run.lengthOffset) + Number(counted));
    },
    periods(userId, streakType, from, to) {
      return db.prepare(`SELECT period_key AS periodKey,status,reason_code AS reasonCode,processed_at AS processedAt
        FROM streak_periods WHERE user_id=? AND streak_type=? AND period_key>=? AND period_key<=? ORDER BY period_key`)
        .all(userId, streakType, from, to);
    },
    milestones(userId, streakType) {
      return db.prepare('SELECT milestone FROM streak_milestones WHERE user_id=? AND streak_type=?').all(userId, streakType).map((row) => row.milestone);
    },
    insertMilestone({ userId, streakType, milestone, reachedKey, runId, createdAt }) {
      return db.prepare(`INSERT OR IGNORE INTO streak_milestones(user_id,streak_type,milestone,reached_key,run_id,created_at)
        VALUES(?,?,?,?,?,?)`).run(userId, streakType, milestone, reachedKey, runId, createdAt).changes > 0;
    },
    calendar(userId, from, to) {
      return db.prepare(`SELECT p.streak_type AS streakType,p.period_key AS periodKey,p.status,p.reason_code AS reasonCode,
        CASE WHEN p.streak_type='TRACKING_DAILY' AND p.status IN ('COUNTED','FROZEN') AND p.run_id IS NOT NULL
          THEN COALESCE(r.length_offset,0)+(SELECT count(*) FROM streak_periods counted
            WHERE counted.user_id=p.user_id AND counted.streak_type=p.streak_type AND counted.run_id=p.run_id
              AND counted.status='COUNTED' AND counted.period_key<=p.period_key)
          ELSE 0 END AS streakLength
        FROM streak_periods p LEFT JOIN streak_runs r ON r.id=p.run_id AND r.user_id=p.user_id
        WHERE p.user_id=? AND p.period_key>=? AND p.period_key<=? ORDER BY p.period_key,p.streak_type`).all(userId, from, to);
    },
  };
}
