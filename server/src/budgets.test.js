import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { todayInTimezone } from './utils/dates.js';
import { daysInMonth } from './services/budgetCalculator.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';
const shiftMonth = (month, offset) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

describe('budget endpoints', () => {
  let db;
  let app;
  let cookieA;
  let cookieB;
  let foodId;
  let salaryId;
  let customId;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const seed = db.prepare(
      'INSERT INTO categories (user_id, name, type, is_default, created_at) VALUES (NULL, ?, ?, 1, ?)',
    );
    seed.run('Food', 'expense', new Date().toISOString());
    seed.run('Salary', 'income', new Date().toISOString());
    foodId = db.prepare("SELECT id FROM categories WHERE name = 'Food'").get().id;
    salaryId = db.prepare("SELECT id FROM categories WHERE name = 'Salary'").get().id;
    app = createApp({
      db,
      config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret },
      logger: { info() {}, error() {} },
    });
    const first = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'budget-a@example.com',
        password: 'securepass1',
        displayName: 'Budget A',
        timezone: 'Asia/Tokyo',
      })
      .expect(201);
    const second = await request(app)
      .post('/api/auth/register')
      .send({ email: 'budget-b@example.com', password: 'securepass2', displayName: 'Budget B' })
      .expect(201);
    cookieA = first.headers['set-cookie'][0].split(';')[0];
    cookieB = second.headers['set-cookie'][0].split(';')[0];
    customId = (
      await request(app)
        .post('/api/categories')
        .set('Cookie', cookieA)
        .send({ name: 'Dining', type: 'expense' })
        .expect(201)
    ).body.id;
  });
  afterEach(() => db.close());

  const put = (cookie, payload) =>
    request(app).put('/api/budgets').set('Cookie', cookie).send(payload);
  const transaction = (cookie, payload) =>
    request(app).post('/api/transactions').set('Cookie', cookie).send(payload);

  it('sets, updates and no-ops budgets with append-only history', async () => {
    const payload = {
      scope: 'monthly_total',
      amount: '1000.00',
      month: todayInTimezone('Asia/Tokyo').slice(0, 7),
    };
    const created = await put(cookieA, payload).expect(200);
    expect(created.body).toMatchObject({
      scope: 'monthly_total',
      amountPaise: 100000,
      amount: '1000.00',
    });
    await put(cookieA, payload).expect(200);
    await put(cookieA, { ...payload, amount: '1250.00' }).expect(200);
    expect(db.prepare('SELECT count(*) AS count FROM budget_history').get().count).toBe(2);
    await request(app)
      .delete(`/api/budgets/${created.body.id}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(204);
    const history = db
      .prepare('SELECT action, old_amount_paise, new_amount_paise FROM budget_history ORDER BY id')
      .all();
    expect(history).toEqual([
      { action: 'set', old_amount_paise: null, new_amount_paise: 100000 },
      { action: 'update', old_amount_paise: 100000, new_amount_paise: 125000 },
      { action: 'delete', old_amount_paise: 125000, new_amount_paise: null },
    ]);
    expect(
      db.prepare('SELECT budget_id FROM budget_history ORDER BY id DESC LIMIT 1').get().budget_id,
    ).toBeNull();
    expect(() => db.prepare('UPDATE budget_history SET new_amount_paise = 1').run()).toThrow();
    expect(() => db.prepare('DELETE FROM budget_history').run()).toThrow();
  });

  it('resolves month overrides over defaults and falls back after override deletion', async () => {
    const month = todayInTimezone('Asia/Tokyo').slice(0, 7);
    const previousMonth = shiftMonth(month, -1);
    await put(cookieA, { scope: 'monthly_total', amount: '1000' }).expect(200);
    const override = await put(cookieA, {
      scope: 'monthly_total',
      amount: '500',
      month,
    }).expect(200);
    let status = await request(app)
      .get(`/api/budgets/status?month=${month}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal).toMatchObject({ budgetPaise: 50000, source: 'month' });
    await request(app)
      .delete(`/api/budgets/${override.body.id}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(204);
    status = await request(app)
      .get(`/api/budgets/status?month=${month}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal).toMatchObject({ budgetPaise: 100000, source: 'default' });
    expect(
      (await request(app).get(`/api/budgets/status?month=${previousMonth}`).set('Cookie', cookieA))
        .body.monthlyTotal.source,
    ).toBe('default');
  });

  it('validates category requirements, visibility, type, month range and amount precision', async () => {
    await put(cookieA, { scope: 'category_monthly', amount: '100' }).expect(422);
    await put(cookieA, { scope: 'category_monthly', amount: '100', categoryId: salaryId }).expect(
      422,
    );
    await put(cookieA, { scope: 'monthly_total', amount: '100', categoryId: foodId }).expect(422);
    await put(cookieA, { scope: 'category_monthly', amount: '100', categoryId: foodId }).expect(
      200,
    );
    const other = await request(app)
      .post('/api/categories')
      .set('Cookie', cookieB)
      .send({ name: 'Private food', type: 'expense' })
      .expect(201);
    await put(cookieA, {
      scope: 'category_monthly',
      amount: '100',
      categoryId: other.body.id,
    }).expect(422);
    await put(cookieA, { scope: 'monthly_total', amount: '5.555' }).expect(400);
    const tooFarMonth = shiftMonth(todayInTimezone('Asia/Tokyo').slice(0, 7), 13);
    await put(cookieA, { scope: 'monthly_total', amount: '100', month: tooFarMonth }).expect(422);
    await put(cookieA, { scope: 'monthly_total', amount: '100000001' }).expect(400);
  });

  it('calculates from transaction dates and excludes income and soft-deleted expenses', async () => {
    const nowMonth = todayInTimezone('Asia/Tokyo').slice(0, 7);
    const previous = new Date(`${nowMonth}-01T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const previousMonth = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentDate = `${nowMonth}-01`;
    const previousDate = `${previousMonth}-01`;
    const prior = await transaction(cookieA, {
      type: 'expense',
      amount: '10.00',
      categoryId: foodId,
      transactionDate: previousDate,
    }).expect(201);
    const current = await transaction(cookieA, {
      type: 'expense',
      amount: '25.00',
      categoryId: customId,
      transactionDate: currentDate,
    }).expect(201);
    await transaction(cookieA, {
      type: 'income',
      amount: '500.00',
      categoryId: salaryId,
      transactionDate: currentDate,
    }).expect(201);
    await put(cookieA, { scope: 'monthly_total', amount: '100', month: nowMonth }).expect(200);
    let status = await request(app)
      .get(`/api/budgets/status?month=${nowMonth}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal.spentPaise).toBe(2500);
    expect(status.body.unbudgetedSpending.categories[0].spentPaise).toBe(2500);
    await request(app)
      .patch(`/api/transactions/${current.body.id}`)
      .set('Cookie', cookieA)
      .send({ amount: '30.00' })
      .expect(200);
    status = await request(app)
      .get(`/api/budgets/status?month=${nowMonth}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal.spentPaise).toBe(3000);
    await request(app)
      .delete(`/api/transactions/${current.body.id}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(204);
    status = await request(app)
      .get(`/api/budgets/status?month=${nowMonth}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal.spentPaise).toBe(0);
    await request(app)
      .post(`/api/transactions/${current.body.id}/restore`)
      .set('Cookie', cookieA)
      .send({})
      .expect(200);
    status = await request(app)
      .get(`/api/budgets/status?month=${nowMonth}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal.spentPaise).toBe(3000);
    status = await request(app)
      .get(`/api/budgets/status?month=${previousMonth}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(status.body.monthlyTotal).toBeNull();
    expect(status.body.unbudgetedSpending.spentPaise).toBe(1000);
    expect(prior.body.transactionDate).toBe(previousDate);
  });

  it('computes daily spend in the user timezone and applies daily limits', async () => {
    const today = todayInTimezone('Asia/Tokyo');
    await put(cookieA, { scope: 'daily_limit', amount: '30' }).expect(200);
    await transaction(cookieA, {
      type: 'expense',
      amount: '12.34',
      categoryId: foodId,
      transactionDate: today,
    }).expect(201);
    await transaction(cookieA, {
      type: 'income',
      amount: '500',
      categoryId: salaryId,
      transactionDate: today,
    }).expect(201);
    const result = await request(app)
      .get('/api/budgets/daily-status')
      .set('Cookie', cookieA)
      .expect(200);
    expect(result.body).toMatchObject({
      date: today,
      limitPaise: 3000,
      spentPaise: 1234,
      remainingPaise: 1766,
      status: 'on_track',
    });
  });

  it('includes spending on both the first and last day of a month', async () => {
    const currentMonth = todayInTimezone('Asia/Tokyo').slice(0, 7);
    const previous = new Date(`${currentMonth}-01T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    const month = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
    await transaction(cookieA, {
      type: 'expense',
      amount: '1.00',
      categoryId: foodId,
      transactionDate: `${month}-01`,
    }).expect(201);
    await transaction(cookieA, {
      type: 'expense',
      amount: '2.00',
      categoryId: foodId,
      transactionDate: `${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
    }).expect(201);
    await put(cookieA, { scope: 'monthly_total', amount: '100', month }).expect(200);
    const result = await request(app)
      .get(`/api/budgets/status?month=${month}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(result.body.monthlyTotal.spentPaise).toBe(300);
  });

  it('calculates category status and reports category limits above the monthly total', async () => {
    const month = todayInTimezone('Asia/Tokyo').slice(0, 7);
    await transaction(cookieA, {
      type: 'expense',
      amount: '80.00',
      categoryId: foodId,
      transactionDate: `${month}-01`,
    }).expect(201);
    await put(cookieA, { scope: 'monthly_total', amount: '50', month }).expect(200);
    await put(cookieA, {
      scope: 'category_monthly',
      amount: '100',
      categoryId: foodId,
      month,
    }).expect(200);
    const result = await request(app)
      .get(`/api/budgets/status?month=${month}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(result.body.categories[0]).toMatchObject({
      categoryId: foodId,
      budgetPaise: 10000,
      spentPaise: 8000,
      percentUsed: 80,
      status: 'warning',
      source: 'month',
    });
    expect(result.body.warnings[0].code).toBe('CATEGORY_BUDGETS_EXCEED_TOTAL');
    expect(result.body.unbudgetedSpending.spentPaise).toBe(0);
  });

  it('isolates budgets and statuses by authenticated user', async () => {
    const row = await put(cookieA, { scope: 'monthly_total', amount: '1000' }).expect(200);
    await request(app).get('/api/budgets').set('Cookie', cookieB).expect(200, []);
    await request(app)
      .delete(`/api/budgets/${row.body.id}`)
      .set('Cookie', cookieB)
      .send({})
      .expect(404);
    expect(
      (await request(app).get('/api/budgets/status').set('Cookie', cookieB)).body.monthlyTotal,
    ).toBeNull();
    await request(app).get('/api/budgets').expect(401);
  });

  it('enforces duplicate uniqueness at both API and database levels', async () => {
    const set = await put(cookieA, { scope: 'daily_limit', amount: '10' }).expect(200);
    await put(cookieA, { scope: 'daily_limit', amount: '10' }).expect(200);
    expect(() =>
      db
        .prepare(
          `INSERT INTO budgets (user_id, scope, category_id, amount_paise, month, created_at, updated_at)
      VALUES (?, 'daily_limit', NULL, 1000, NULL, ?, ?)`,
        )
        .run(set.body.userId, new Date().toISOString(), new Date().toISOString()),
    ).toThrow();
  });
});
