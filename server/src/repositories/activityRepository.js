export function createActivityRepository(db) {
  return {
    list(userId, { limit, beforeId, kinds }) {
      const where = ['user_id = ?']; const values = [userId];
      if (beforeId) { where.push('(occurred_at < ? OR (occurred_at = ? AND id < ?))'); values.push(beforeId.occurredAt,beforeId.occurredAt,beforeId.id); }
      if (kinds?.length) { where.push(`kind IN (${kinds.map(()=>'?').join(',')})`); values.push(...kinds); }
      values.push(limit + 1);
      const rows = db.prepare(`SELECT id,kind,ref_type AS refType,ref_id AS refId,occurred_at AS occurredAt,
        summary_code AS summaryCode,data_json AS dataJson FROM activity_items WHERE ${where.join(' AND ')}
        ORDER BY occurred_at DESC,id DESC LIMIT ?`).all(...values);
      const hasMore = rows.length > limit; const data = rows.slice(0, limit).map((row) => ({
        id: row.id, kind: row.kind, refType: row.refType, refId: row.refId,
        occurredAt: row.occurredAt, summaryCode: row.summaryCode, data: JSON.parse(row.dataJson),
      }));
      const last = data.at(-1);
      return { data, nextCursor: hasMore ? Buffer.from(JSON.stringify({ id:last.id, occurredAt:last.occurredAt })).toString('base64url') : null };
    },
  };
}
