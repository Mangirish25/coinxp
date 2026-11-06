function mapRow(row) {
  return (
    row && {
      id: row.id,
      userId: row.userId,
      scope: row.scope,
      categoryId: row.categoryId,
      month: row.month,
      amountPaise: row.amountPaise,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
    }
  );
}

const select = `SELECT b.id, b.user_id AS userId, b.scope, b.category_id AS categoryId,
  b.month, b.amount_paise AS amountPaise, b.created_at AS createdAt,
  b.updated_at AS updatedAt, c.name AS categoryName, c.icon AS categoryIcon
  FROM budgets b LEFT JOIN categories c ON c.id = b.category_id AND (c.user_id = b.user_id OR c.user_id IS NULL)`;

export function createBudgetRepository(db) {
  return {
    findById(userId, id) {
      return mapRow(db.prepare(`${select} WHERE b.user_id = ? AND b.id = ?`).get(userId, id));
    },
    findByKey(userId, scope, categoryId, month) {
      return mapRow(
        db
          .prepare(
            `${select} WHERE b.user_id = ? AND b.scope = ?
        AND COALESCE(b.category_id, 0) = COALESCE(?, 0) AND COALESCE(b.month, '') = COALESCE(?, '')`,
          )
          .get(userId, scope, categoryId, month),
      );
    },
    listForUser(userId, filters = {}) {
      const clauses = ['b.user_id = ?'];
      const values = [userId];
      if (filters.month !== undefined) {
        clauses.push('b.month = ?');
        values.push(filters.month);
      }
      if (filters.scope) {
        clauses.push('b.scope = ?');
        values.push(filters.scope);
      }
      return db
        .prepare(
          `${select} WHERE ${clauses.join(' AND ')} ORDER BY b.scope, c.name COLLATE NOCASE, b.month`,
        )
        .all(...values)
        .map(mapRow);
    },
    listCategoryBudgets(userId) {
      return db
        .prepare(
          `${select} WHERE b.user_id = ? AND b.scope = 'category_monthly' ORDER BY b.category_id, b.month`,
        )
        .all(userId)
        .map(mapRow);
    },
    insert({ userId, scope, categoryId, month, amountPaise, createdAt }) {
      const result = db
        .prepare(
          `INSERT INTO budgets (user_id, scope, category_id, amount_paise, month, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, scope, categoryId, amountPaise, month, createdAt, createdAt);
      return this.findById(userId, Number(result.lastInsertRowid));
    },
    updateAmount({ userId, id, amountPaise, updatedAt }) {
      const result = db
        .prepare('UPDATE budgets SET amount_paise = ?, updated_at = ? WHERE user_id = ? AND id = ?')
        .run(amountPaise, updatedAt, userId, id);
      return result.changes ? this.findById(userId, id) : null;
    },
    deleteOwned(userId, id) {
      return (
        db.prepare('DELETE FROM budgets WHERE user_id = ? AND id = ?').run(userId, id).changes > 0
      );
    },
  };
}
