export function createTimezoneChangeRepository(db) {
  return {
    insert({ userId, changedAt, oldTimezone, newTimezone, oldLocalDate, newLocalDate, skippedDates }) {
      db.prepare(`INSERT INTO timezone_changes(user_id,changed_at,old_tz,new_tz,old_local_date,new_local_date,skipped_dates_json)
        VALUES(?,?,?,?,?,?,?)`).run(userId, changedAt, oldTimezone, newTimezone, oldLocalDate, newLocalDate, JSON.stringify(skippedDates));
    },
    list(userId) {
      return db.prepare(`SELECT changed_at AS changedAt,old_tz AS oldTimezone,new_tz AS newTimezone,
        old_local_date AS oldLocalDate,new_local_date AS newLocalDate,skipped_dates_json AS skippedDatesJson
        FROM timezone_changes WHERE user_id=? ORDER BY changed_at`).all(userId)
        .map((row) => ({ ...row, skippedDates: JSON.parse(row.skippedDatesJson) }));
    },
    countSkippedSince(userId, since) {
      return db.prepare(`SELECT count(*) AS count FROM timezone_changes changes,json_each(changes.skipped_dates_json) skipped
        WHERE changes.user_id=? AND changes.changed_at>=?`).get(userId, since).count;
    },
  };
}
