import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db/connection.js';
import { migrateDatabase } from '../src/db/migrator.js';
import { todayInTimezone } from '../src/utils/dates.js';

const db = createDatabase(':memory:');
migrateDatabase(db);
const stamp = new Date().toISOString();
const userId = Number(
  db
    .prepare(
      `INSERT INTO users(email,password_hash,display_name,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
    )
    .run('perf@example.com', 'not-used', 'Perf User', 'Asia/Kolkata', stamp, stamp).lastInsertRowid,
);
const categoryId = Number(
  db
    .prepare(
      `INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,'Food','expense',1,?)`,
    )
    .run(stamp).lastInsertRowid,
);
const incomeId = Number(
  db
    .prepare(
      `INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,'Salary','income',1,?)`,
    )
    .run(stamp).lastInsertRowid,
);
const insert = db.prepare(
  `INSERT INTO transactions(user_id,category_id,type,amount_paise,description,transaction_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)`,
);
db.transaction(() => {
  for (let i = 0; i < 20_000; i++) {
    const date = new Date(Date.UTC(2026, 0, 1) + (i % 365) * 86400000).toISOString().slice(0, 10);
    const isIncome = i % 5 === 0;
    insert.run(
      userId,
      isIncome ? incomeId : categoryId,
      isIncome ? 'income' : 'expense',
      1000 + (i % 100),
      'benchmark',
      date,
      stamp,
      stamp,
    );
  }
})();
const secret = 'performance-only-secret-with-at-least-thirty-two-characters';
const app = createApp({
  db,
  config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret },
  logger: { info() {}, error() {} },
});
const cookie = `coinxp_auth=${jwt.sign({}, secret, { subject: String(userId), expiresIn: '7d' })}`;
const month = todayInTimezone('Asia/Kolkata').slice(0, 7);
const today = todayInTimezone('Asia/Kolkata');
const bounds = (() => {
  const [y, m] = month.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(end).padStart(2, '0')}` };
})();
const endpoints = [
  ['dashboard summary', `/api/dashboard/summary?month=${month}`],
  ['category breakdown', `/api/analytics/category-breakdown?from=${bounds.from}&to=${bounds.to}`],
  ['daily spending', `/api/analytics/daily-spending?from=${bounds.from}&to=${bounds.to}`],
  ['income vs expense', '/api/analytics/income-vs-expense?months=6'],
  ['monthly report', `/api/analytics/monthly-report?month=${month}`],
];
for (const [label, path] of endpoints) {
  const before = performance.now();
  const response = await request(app).get(path).set('Cookie', cookie);
  const elapsed = performance.now() - before;
  console.log(`${label}: ${elapsed.toFixed(1)} ms (HTTP ${response.status})`);
}
console.log(
  `Seeded transactions: ${db.prepare('SELECT count(*) AS n FROM transactions').get().n}; benchmark range includes ${bounds.from} through ${bounds.to}; today ${today}.`,
);
const plans = db
  .prepare(
    `EXPLAIN QUERY PLAN SELECT transaction_date, SUM(amount_paise) FROM transactions WHERE user_id=? AND deleted_at IS NULL AND transaction_date>=? AND transaction_date<=? GROUP BY transaction_date`,
  )
  .all(userId, bounds.from, bounds.to);
console.log('Daily aggregate query plan:', plans.map((row) => row.detail).join(' | '));
const categoryPlans = db
  .prepare(
    `EXPLAIN QUERY PLAN SELECT category_id, SUM(amount_paise) FROM transactions WHERE user_id=? AND deleted_at IS NULL AND type='expense' AND transaction_date>=? AND transaction_date<=? GROUP BY category_id`,
  )
  .all(userId, bounds.from, bounds.to);
console.log('Category aggregate query plan:', categoryPlans.map((row) => row.detail).join(' | '));
const allTimePlans = db
  .prepare(
    `EXPLAIN QUERY PLAN SELECT SUM(amount_paise) FROM transactions WHERE user_id=? AND deleted_at IS NULL`,
  )
  .all(userId);
console.log('All-time aggregate query plan:', allTimePlans.map((row) => row.detail).join(' | '));
db.close();
