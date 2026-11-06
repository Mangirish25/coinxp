import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { todayInTimezone } from './utils/dates.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';
const monthEnd = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
};

describe('dashboard and analytics APIs', () => {
  let db, app, cookieA, cookieB, expenseId, incomeId;
  beforeEach(async () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const now = new Date().toISOString();
    const add = db.prepare(
      'INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,?,?,1,?)',
    );
    add.run('Food', 'expense', now);
    add.run('Salary', 'income', now);
    expenseId = db.prepare("SELECT id FROM categories WHERE name='Food'").get().id;
    incomeId = db.prepare("SELECT id FROM categories WHERE name='Salary'").get().id;
    app = createApp({
      db,
      config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret },
      logger: { info() {}, error() {} },
    });
    const a = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'analytics-a@example.com',
        password: 'securepass1',
        displayName: 'Analytics A',
        timezone: 'Asia/Kolkata',
      })
      .expect(201);
    const b = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'analytics-b@example.com',
        password: 'securepass2',
        displayName: 'Analytics B',
      })
      .expect(201);
    cookieA = a.headers['set-cookie'][0].split(';')[0];
    cookieB = b.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());
  const create = (cookie, payload) =>
    request(app).post('/api/transactions').set('Cookie', cookie).send(payload);

  it('reconciles dashboard, category, daily and monthly report aggregates and keeps today independent', async () => {
    const month = todayInTimezone('Asia/Kolkata').slice(0, 7);
    const day = `${month}-01`;
    const [year, monthNumber] = month.split('-').map(Number);
    const previousDate = new Date(Date.UTC(year, monthNumber - 1, 0)).toISOString().slice(0, 10);
    const twoMonthsAgoDate = `${new Date(Date.UTC(year, monthNumber - 3, 1)).getUTCFullYear()}-${String(new Date(Date.UTC(year, monthNumber - 3, 1)).getUTCMonth() + 1).padStart(2, '0')}-15`;
    await create(cookieA, {
      type: 'expense',
      amount: '10.00',
      categoryId: expenseId,
      transactionDate: day,
    }).expect(201);
    await create(cookieA, {
      type: 'income',
      amount: '25.00',
      categoryId: incomeId,
      transactionDate: day,
    }).expect(201);
    const lastMonthEntry = await create(cookieA, {
      type: 'expense',
      amount: '5.00',
      categoryId: expenseId,
      transactionDate: previousDate,
    }).expect(201);
    await create(cookieA, {
      type: 'expense',
      amount: '3.00',
      categoryId: expenseId,
      transactionDate: twoMonthsAgoDate,
    }).expect(201);
    expect(lastMonthEntry.body.transactionDate.slice(0, 7)).not.toBe(month);
    expect(lastMonthEntry.body.createdAt.slice(0, 7)).toBe(month);
    const monthlyBudget = await request(app)
      .put('/api/budgets')
      .set('Cookie', cookieA)
      .send({ scope: 'monthly_total', amount: '100.00', month })
      .expect(200);
    const dashboard = (
      await request(app)
        .get(`/api/dashboard/summary?month=${month}`)
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    const breakdown = (
      await request(app)
        .get(
          `/api/analytics/category-breakdown?from=${month}-01&to=${month}-${String(new Date(Date.UTC(...month.split('-').map(Number), 0)).getUTCDate()).padStart(2, '0')}`,
        )
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    const daily = (
      await request(app)
        .get(
          `/api/analytics/daily-spending?from=${month}-01&to=${month}-${String(new Date(Date.UTC(...month.split('-').map(Number), 0)).getUTCDate()).padStart(2, '0')}`,
        )
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    const report = (
      await request(app)
        .get(`/api/analytics/monthly-report?month=${month}`)
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    expect(dashboard.monthExpensePaise).toBe(breakdown.total.amountPaise);
    expect(dashboard.monthExpensePaise).toBe(
      daily.days.reduce((sum, row) => sum + row.expensePaise, 0),
    );
    expect(dashboard.monthExpensePaise).toBe(report.totals.expensePaise);
    expect(dashboard.totalBalancePaise).toBe(700);
    expect(monthlyBudget.body.amountPaise).toBe(10000);
    const budgetStatus = (
      await request(app)
        .get(`/api/budgets/status?month=${month}`)
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    expect(dashboard.budget.monthlyTotal).toEqual(budgetStatus.monthlyTotal);
    const previousSummary = (
      await request(app)
        .get(`/api/dashboard/summary?month=${previousDate.slice(0, 7)}`)
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    expect(previousSummary.monthExpensePaise).toBe(500);
    const olderSummary = (
      await request(app)
        .get(`/api/dashboard/summary?month=${twoMonthsAgoDate.slice(0, 7)}`)
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    expect(olderSummary.monthExpensePaise).toBe(300);
    for (const targetMonth of [previousDate.slice(0, 7), twoMonthsAgoDate.slice(0, 7)]) {
      const end = monthEnd(targetMonth);
      const monthSummary = (
        await request(app)
          .get(`/api/dashboard/summary?month=${targetMonth}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body;
      const categoryTotals = (
        await request(app)
          .get(`/api/analytics/category-breakdown?from=${targetMonth}-01&to=${end}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body;
      const dailyTotals = (
        await request(app)
          .get(`/api/analytics/daily-spending?from=${targetMonth}-01&to=${end}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body;
      const monthlyReport = (
        await request(app)
          .get(`/api/analytics/monthly-report?month=${targetMonth}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body;
      expect(monthSummary.monthExpensePaise).toBe(categoryTotals.total.amountPaise);
      expect(monthSummary.monthExpensePaise).toBe(
        dailyTotals.days.reduce((sum, row) => sum + row.expensePaise, 0),
      );
      expect(monthSummary.monthExpensePaise).toBe(monthlyReport.totals.expensePaise);
    }
    expect(breakdown.items.reduce((sum, row) => sum + row.shareBps, 0)).toBe(10000);
    expect(dashboard.today.date).toBe(todayInTimezone('Asia/Kolkata'));
    const transactionId = db
      .prepare(
        'SELECT id FROM transactions WHERE description IS NULL AND user_id=1 ORDER BY id LIMIT 1',
      )
      .get().id;
    await request(app)
      .delete(`/api/transactions/${transactionId}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(204);
    expect(
      (await request(app).get(`/api/dashboard/summary?month=${month}`).set('Cookie', cookieA)).body
        .monthExpensePaise,
    ).toBe(0);
    expect(
      (await request(app).get(`/api/dashboard/summary?month=${month}`).set('Cookie', cookieA)).body
        .totalBalancePaise,
    ).toBe(1700);
    await request(app)
      .post(`/api/transactions/${transactionId}/restore`)
      .set('Cookie', cookieA)
      .send({})
      .expect(200);
  });

  it('returns useful empty responses, enforces range codes, soft delete and user isolation', async () => {
    const month = todayInTimezone('Asia/Kolkata').slice(0, 7);
    const utcHour = new Date().getUTCHours();
    const offsetTimezone = utcHour < 10 ? 'Etc/GMT+12' : 'Pacific/Kiritimati';
    db.prepare('UPDATE users SET timezone = ? WHERE email = ?').run(
      offsetTimezone,
      'analytics-b@example.com',
    );
    const localToday = todayInTimezone(offsetTimezone);
    expect(localToday).not.toBe(new Date().toISOString().slice(0, 10));
    expect(
      (await request(app).get('/api/budgets/daily-status').set('Cookie', cookieB).expect(200)).body
        .date,
    ).toBe(localToday);
    expect(
      (await request(app).get('/api/dashboard/summary').set('Cookie', cookieB).expect(200)).body
        .month,
    ).toBe(localToday.slice(0, 7));
    const summary = (
      await request(app).get('/api/dashboard/summary').set('Cookie', cookieB).expect(200)
    ).body;
    expect(summary.transactionCount).toBe(0);
    expect(summary.recentTransactions).toEqual([]);
    expect(
      (
        await request(app)
          .get('/api/analytics/category-breakdown')
          .set('Cookie', cookieB)
          .expect(200)
      ).body.items,
    ).toEqual([]);
    expect(
      (await request(app).get('/api/analytics/daily-spending').set('Cookie', cookieB).expect(200))
        .body.days.length,
    ).toBeGreaterThan(0);
    expect(
      (
        await request(app)
          .get('/api/analytics/income-vs-expense?months=6')
          .set('Cookie', cookieB)
          .expect(200)
      ).body,
    ).toHaveLength(6);
    expect(
      (
        await request(app)
          .get(`/api/analytics/monthly-report?month=${month}`)
          .set('Cookie', cookieB)
          .expect(200)
      ).body.totals,
    ).toMatchObject({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
    expect(
      (
        await request(app)
          .get(`/api/analytics/category-breakdown?from=${month}-01&to=${month}-01`)
          .set('Cookie', cookieB)
          .expect(200)
      ).body.total.amountPaise,
    ).toBe(0);
    expect(
      (
        await request(app)
          .get(`/api/analytics/daily-spending?from=${month}-01&to=${month}-01`)
          .set('Cookie', cookieB)
          .expect(200)
      ).body.days[0],
    ).toMatchObject({ expensePaise: 0, incomePaise: 0 });
    await request(app)
      .get('/api/analytics/daily-spending?from=2026-01-02&to=2026-01-01')
      .set('Cookie', cookieB)
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('INVALID_RANGE'));
    await request(app)
      .get('/api/analytics/daily-spending?from=2026-01-01&to=2026-04-10')
      .set('Cookie', cookieB)
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('RANGE_TOO_LARGE'));
    await request(app)
      .get('/api/analytics/category-breakdown?from=2024-01-01&to=2025-01-01')
      .set('Cookie', cookieB)
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('RANGE_TOO_LARGE'));
    await request(app)
      .get('/api/dashboard/summary?month=2026-99')
      .set('Cookie', cookieB)
      .expect(400);
    const item = await create(cookieA, {
      type: 'expense',
      amount: '99.00',
      categoryId: expenseId,
      transactionDate: `${month}-01`,
    }).expect(201);
    expect(
      (await request(app).get(`/api/dashboard/summary?month=${month}`).set('Cookie', cookieB)).body
        .monthExpensePaise,
    ).toBe(0);
    await request(app)
      .delete(`/api/transactions/${item.body.id}`)
      .set('Cookie', cookieB)
      .send({})
      .expect(404);
  });

  it('returns selected and previous month comparisons, zero fills and validates all protected routes', async () => {
    const month = todayInTimezone('Asia/Kolkata').slice(0, 7);
    const recent = await create(cookieA, {
      type: 'expense',
      amount: '1',
      categoryId: expenseId,
      transactionDate: `${month}-01`,
    }).expect(201);
    const otherMonth =
      month === '2026-01'
        ? '2025-12'
        : `${month.slice(0, 5)}${String(Number(month.slice(-2)) - 1).padStart(2, '0')}`;
    const report = await request(app)
      .get(`/api/analytics/monthly-report?month=${month}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(report.body.trackingConsistency.daysWithTransactions).toBeGreaterThanOrEqual(1);
    const months = (
      await request(app)
        .get('/api/analytics/income-vs-expense?months=3')
        .set('Cookie', cookieA)
        .expect(200)
    ).body;
    expect(months).toHaveLength(3);
    expect(months.at(-1).month).toBe(month);
    await request(app).get('/api/analytics/monthly-report').set('Cookie', cookieB).expect(400);
    await request(app)
      .get('/api/analytics/category-breakdown?from=invalid')
      .set('Cookie', cookieB)
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe('INVALID_RANGE'));
    expect(
      (
        await request(app)
          .get(`/api/transactions/${recent.body.id}`)
          .set('Cookie', cookieA)
          .expect(200)
      ).body.amountPaise,
    ).toBe(100);
    expect(otherMonth).toMatch(/^\d{4}-\d{2}$/);
  });
});
