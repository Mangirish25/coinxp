export function createAuditRepository(db) {
  const insertStatement = db.prepare(`INSERT INTO transaction_audit
    (transaction_id, user_id, action, before_json, after_json, changed_fields, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const historyStatement =
    db.prepare(`SELECT id, transaction_id AS transactionId, user_id AS userId,
    action, before_json AS beforeJson, after_json AS afterJson, changed_fields AS changedFields,
    reason, created_at AS createdAt
    FROM transaction_audit WHERE transaction_id = ? AND user_id = ?
    ORDER BY created_at DESC, id DESC`);

  return {
    insert({ transactionId, userId, action, before, after, changedFields, reason, createdAt }) {
      return Number(
        insertStatement.run(
          transactionId,
          userId,
          action,
          before === null ? null : JSON.stringify(before),
          after === null ? null : JSON.stringify(after),
          changedFields === null ? null : JSON.stringify(changedFields),
          reason,
          createdAt,
        ).lastInsertRowid,
      );
    },
    listForTransaction(userId, transactionId) {
      return historyStatement.all(transactionId, userId).map((row) => ({
        id: row.id,
        transactionId: row.transactionId,
        userId: row.userId,
        action: row.action,
        before: row.beforeJson === null ? null : JSON.parse(row.beforeJson),
        after: row.afterJson === null ? null : JSON.parse(row.afterJson),
        changedFields: row.changedFields === null ? null : JSON.parse(row.changedFields),
        reason: row.reason,
        createdAt: row.createdAt,
      }));
    },
  };
}
