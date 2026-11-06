export function createBudgetHistoryRepository(db) {
  const insertStatement = db.prepare(`INSERT INTO budget_history
    (user_id, budget_id, scope, category_id, month, action, old_amount_paise, new_amount_paise, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const listStatement = db.prepare(`SELECT id, user_id AS userId, budget_id AS budgetId,
    scope, category_id AS categoryId, month, action, old_amount_paise AS oldAmountPaise,
    new_amount_paise AS newAmountPaise, created_at AS createdAt
    FROM budget_history WHERE user_id = ? ORDER BY created_at DESC, id DESC`);
  return {
    insert(entry) {
      return Number(
        insertStatement.run(
          entry.userId,
          entry.budgetId,
          entry.scope,
          entry.categoryId,
          entry.month,
          entry.action,
          entry.oldAmountPaise,
          entry.newAmountPaise,
          entry.createdAt,
        ).lastInsertRowid,
      );
    },
    listForUser(userId) {
      return listStatement.all(userId);
    },
  };
}
