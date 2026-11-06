function safeNumber(value, name = 'aggregate') {
  const integer = typeof value === 'bigint' ? value : BigInt(value ?? 0);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError(`${name} exceeds the safe integer range.`);
  return Number(integer);
}

function numericRow(row, columns) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      columns.includes(key) ? safeNumber(value, key) : value,
    ]),
  );
}

const categoryJoin = `LEFT JOIN categories c ON c.id = t.category_id AND (c.user_id IS NULL OR c.user_id = t.user_id)`;

export function createAnalyticsRepository(db) {
  return {
    dashboardTotals(userId, { monthStart, monthEnd, previousStart, previousEnd }) {
      const row = db
        .prepare(
          `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS allIncomePaise,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS allExpensePaise,
        COALESCE(SUM(CASE WHEN type = 'income' AND transaction_date >= ? AND transaction_date <= ? THEN amount_paise ELSE 0 END), 0) AS monthIncomePaise,
        COALESCE(SUM(CASE WHEN type = 'expense' AND transaction_date >= ? AND transaction_date <= ? THEN amount_paise ELSE 0 END), 0) AS monthExpensePaise,
        COALESCE(SUM(CASE WHEN type = 'income' AND transaction_date >= ? AND transaction_date <= ? THEN amount_paise ELSE 0 END), 0) AS previousIncomePaise,
        COALESCE(SUM(CASE WHEN type = 'expense' AND transaction_date >= ? AND transaction_date <= ? THEN amount_paise ELSE 0 END), 0) AS previousExpensePaise,
        COUNT(CASE WHEN transaction_date >= ? AND transaction_date <= ? THEN 1 END) AS transactionCount
        FROM transactions WHERE user_id = ? AND deleted_at IS NULL`,
        )
        .safeIntegers()
        .get(
          monthStart,
          monthEnd,
          monthStart,
          monthEnd,
          previousStart,
          previousEnd,
          previousStart,
          previousEnd,
          monthStart,
          monthEnd,
          userId,
        );
      return numericRow(row, [
        'allIncomePaise',
        'allExpensePaise',
        'monthIncomePaise',
        'monthExpensePaise',
        'previousIncomePaise',
        'previousExpensePaise',
        'transactionCount',
      ]);
    },
    recentTransactions(userId, limit) {
      const rows = db
        .prepare(
          `SELECT t.id, t.type, t.amount_paise AS amountPaise,
        t.transaction_date AS transactionDate, t.created_at AS createdAt,
        t.description, t.category_id AS categoryId, c.name AS categoryName, c.icon AS categoryIcon
        FROM transactions t ${categoryJoin}
        WHERE t.user_id = ? AND t.deleted_at IS NULL
        ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC LIMIT ?`,
        )
        .safeIntegers()
        .all(userId, limit);
      return rows.map((row) => numericRow(row, ['id', 'amountPaise', 'categoryId']));
    },
    topExpenseCategories(userId, from, to, limit) {
      const rows = db
        .prepare(
          `SELECT t.category_id AS categoryId, c.name, c.icon,
        SUM(t.amount_paise) AS spentPaise, COUNT(*) AS transactionCount
        FROM transactions t ${categoryJoin}
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type = 'expense'
          AND t.transaction_date >= ? AND t.transaction_date <= ?
        GROUP BY t.category_id, c.name, c.icon
        ORDER BY spentPaise DESC, c.name COLLATE NOCASE ASC LIMIT ?`,
        )
        .safeIntegers()
        .all(userId, from, to, limit);
      return rows.map((row) => numericRow(row, ['categoryId', 'spentPaise', 'transactionCount']));
    },
    categoryBreakdown(userId, from, to, type) {
      const rows = db
        .prepare(
          `SELECT t.category_id AS categoryId, c.name, c.icon,
        SUM(t.amount_paise) AS amountPaise, COUNT(*) AS count
        FROM transactions t ${categoryJoin}
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type = ?
          AND t.transaction_date >= ? AND t.transaction_date <= ?
        GROUP BY t.category_id, c.name, c.icon ORDER BY amountPaise DESC, c.name COLLATE NOCASE ASC`,
        )
        .safeIntegers()
        .all(userId, type, from, to);
      return rows.map((row) => numericRow(row, ['categoryId', 'amountPaise', 'count']));
    },
    dailyAggregates(userId, from, to) {
      const rows = db
        .prepare(
          `SELECT transaction_date AS date,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expensePaise,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS incomePaise
        FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND transaction_date >= ? AND transaction_date <= ?
        GROUP BY transaction_date ORDER BY transaction_date`,
        )
        .safeIntegers()
        .all(userId, from, to);
      return rows.map((row) => numericRow(row, ['expensePaise', 'incomePaise']));
    },
    monthlyAggregates(userId, from, to) {
      const rows = db
        .prepare(
          `SELECT substr(transaction_date, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS incomePaise,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expensePaise
        FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND transaction_date >= ? AND transaction_date <= ?
        GROUP BY substr(transaction_date, 1, 7) ORDER BY month`,
        )
        .safeIntegers()
        .all(userId, from, to);
      return rows.map((row) => numericRow(row, ['incomePaise', 'expensePaise']));
    },
    categoryExpenseComparisons(userId, currentStart, currentEnd, previousStart, previousEnd) {
      const rows = db
        .prepare(
          `SELECT t.category_id AS categoryId, c.name, c.icon,
        COALESCE(SUM(CASE WHEN t.transaction_date >= ? AND t.transaction_date <= ? THEN t.amount_paise ELSE 0 END), 0) AS currentPaise,
        COALESCE(SUM(CASE WHEN t.transaction_date >= ? AND t.transaction_date <= ? THEN t.amount_paise ELSE 0 END), 0) AS previousPaise
        FROM transactions t ${categoryJoin}
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type = 'expense'
          AND t.transaction_date >= ? AND t.transaction_date <= ?
        GROUP BY t.category_id, c.name, c.icon`,
        )
        .safeIntegers()
        .all(
          currentStart,
          currentEnd,
          previousStart,
          previousEnd,
          userId,
          previousStart,
          currentEnd,
        );
      return rows.map((row) => numericRow(row, ['categoryId', 'currentPaise', 'previousPaise']));
    },
    topExpenseTransactions(userId, from, to, limit) {
      const rows = db
        .prepare(
          `SELECT t.id, t.amount_paise AS amountPaise, t.transaction_date AS transactionDate,
        t.description, t.category_id AS categoryId, c.name AS categoryName, c.icon AS categoryIcon
        FROM transactions t ${categoryJoin}
        WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.type = 'expense'
          AND t.transaction_date >= ? AND t.transaction_date <= ?
        ORDER BY t.amount_paise DESC, t.transaction_date DESC, t.id DESC LIMIT ?`,
        )
        .safeIntegers()
        .all(userId, from, to, limit);
      return rows.map((row) => numericRow(row, ['id', 'amountPaise', 'categoryId']));
    },
    trackingDays(userId, from, to) {
      const row = db
        .prepare(
          `SELECT COUNT(DISTINCT transaction_date) AS daysTracked
        FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND transaction_date >= ? AND transaction_date <= ?`,
        )
        .safeIntegers()
        .get(userId, from, to);
      return safeNumber(row.daysTracked, 'daysTracked');
    },
  };
}
