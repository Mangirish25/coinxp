const ORDERABLE_COLUMNS = Object.freeze({
  transactionDate: 't.transaction_date',
  amount: 't.amount_paise',
  createdAt: 't.created_at',
});

const SELECT_TRANSACTIONS = `
  SELECT t.id, t.user_id AS userId, t.category_id AS categoryId, t.type,
    t.amount_paise AS amountPaise, t.description,
    t.transaction_date AS transactionDate, t.created_at AS createdAt,
    t.updated_at AS updatedAt, t.deleted_at AS deletedAt,
    c.name AS categoryName, c.icon AS categoryIcon, c.type AS categoryType
  FROM transactions t
  JOIN categories c ON c.id = t.category_id AND (c.user_id IS NULL OR c.user_id = t.user_id)
`;

function buildWhere(userId, filters = {}) {
  const clauses = ['t.user_id = ?'];
  const values = [userId];
  if (!filters.includeDeleted) clauses.push('t.deleted_at IS NULL');
  if (filters.type) {
    clauses.push('t.type = ?');
    values.push(filters.type);
  }
  if (filters.categoryId) {
    clauses.push('t.category_id = ?');
    values.push(filters.categoryId);
  }
  if (filters.from) {
    clauses.push('t.transaction_date >= ?');
    values.push(filters.from);
  }
  if (filters.to) {
    clauses.push('t.transaction_date <= ?');
    values.push(filters.to);
  }
  if (filters.q) {
    clauses.push("instr(lower(COALESCE(t.description, '')), lower(?)) > 0");
    values.push(filters.q);
  }
  if (filters.minAmountPaise !== undefined) {
    clauses.push('t.amount_paise >= ?');
    values.push(filters.minAmountPaise);
  }
  if (filters.maxAmountPaise !== undefined) {
    clauses.push('t.amount_paise <= ?');
    values.push(filters.maxAmountPaise);
  }
  return { sql: clauses.join(' AND '), values };
}

export function createTransactionRepository(db) {
  const byIdStatement = db.prepare(`${SELECT_TRANSACTIONS}
    WHERE t.id = ? AND t.user_id = ? AND (t.deleted_at IS NULL OR ? = 1)`);
  const insertStatement = db.prepare(`INSERT INTO transactions
    (user_id, category_id, type, amount_paise, description, transaction_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  return {
    findByIdForUser(userId, id, includeDeleted = false) {
      return byIdStatement.get(id, userId, includeDeleted ? 1 : 0);
    },
    create({ userId, categoryId, type, amountPaise, description, transactionDate, createdAt }) {
      const result = insertStatement.run(
        userId,
        categoryId,
        type,
        amountPaise,
        description,
        transactionDate,
        createdAt,
        createdAt,
      );
      return Number(result.lastInsertRowid);
    },
    listForUser(userId, filters) {
      const where = buildWhere(userId, filters);
      const total = db
        .prepare(`SELECT count(*) AS total FROM transactions t WHERE ${where.sql}`)
        .get(...where.values).total;
      const sortColumn = ORDERABLE_COLUMNS[filters.sort] ?? ORDERABLE_COLUMNS.transactionDate;
      const order = filters.order === 'asc' ? 'ASC' : 'DESC';
      const rows = db
        .prepare(
          `${SELECT_TRANSACTIONS}
        WHERE ${where.sql}
        ORDER BY ${sortColumn} ${order}, t.id DESC
        LIMIT ? OFFSET ?`,
        )
        .all(...where.values, filters.pageSize, (filters.page - 1) * filters.pageSize);
      return { rows, total };
    },
    updateOwned({ userId, id, changes, updatedAt }) {
      const columns = {
        type: 'type',
        amountPaise: 'amount_paise',
        categoryId: 'category_id',
        description: 'description',
        transactionDate: 'transaction_date',
      };
      const entries = Object.entries(changes).filter(([key]) => columns[key]);
      if (!entries.length) return 0;
      const assignments = entries.map(([key]) => `${columns[key]} = ?`);
      const values = entries.map(([, value]) => value);
      assignments.push('updated_at = ?');
      values.push(updatedAt, id, userId);
      return db
        .prepare(
          `UPDATE transactions SET ${assignments.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        )
        .run(...values).changes;
    },
    softDelete({ userId, id, deletedAt }) {
      return db
        .prepare(
          `UPDATE transactions SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        )
        .run(deletedAt, deletedAt, id, userId).changes;
    },
    restore({ userId, id, updatedAt }) {
      return db
        .prepare(
          `UPDATE transactions SET deleted_at = NULL, updated_at = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`,
        )
        .run(updatedAt, id, userId).changes;
    },
  };
}
