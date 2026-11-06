import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { rupeesToPaise } from './utils/money.js';
import { todayInTimezone } from './utils/dates.js';
import { createAuditRepository } from './repositories/auditRepository.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';

describe('transaction and category APIs', () => {
  let db;
  let app;
  let cookieA;
  let cookieB;
  let expenseCategory;
  let incomeCategory;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const seed = db.prepare(
      `INSERT INTO categories (user_id, name, type, is_default, created_at) VALUES (NULL, ?, ?, 1, ?)`,
    );
    seed.run('Food', 'expense', new Date().toISOString());
    seed.run('Salary', 'income', new Date().toISOString());
    expenseCategory = db.prepare("SELECT id FROM categories WHERE name = 'Food'").get().id;
    incomeCategory = db.prepare("SELECT id FROM categories WHERE name = 'Salary'").get().id;
    app = createApp({
      db,
      config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret },
      logger: { info() {}, error() {} },
    });
    const bodyA = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'securepass1', displayName: 'User A' })
      .expect(201);
    const bodyB = await request(app)
      .post('/api/auth/register')
      .send({ email: 'b@example.com', password: 'securepass2', displayName: 'User B' })
      .expect(201);
    cookieA = bodyA.headers['set-cookie'][0].split(';')[0];
    cookieB = bodyB.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('applies transaction schema migrations idempotently', () => {
    const appliedBefore = db.prepare('SELECT count(*) AS count FROM schema_migrations').get().count;
    migrateDatabase(db);
    expect(db.prepare('SELECT count(*) AS count FROM schema_migrations').get().count).toBe(
      appliedBefore,
    );
    expect(
      db
        .prepare("PRAGMA table_info('categories')")
        .all()
        .some((column) => column.name === 'deleted_at'),
    ).toBe(true);
  });

  const create = (cookie, body = {}) =>
    request(app)
      .post('/api/transactions')
      .set('Cookie', cookie)
      .send({
        type: 'expense',
        amount: '250.50',
        categoryId: expenseCategory,
        transactionDate: '2024-03-12',
        description: 'Lunch',
        ...body,
      });

  it('stores exact paise, returns decimal strings, and audits transaction creation', async () => {
    const response = await create(cookieA).expect(201);
    expect(response.body).toMatchObject({
      amountPaise: 25050,
      amount: '250.50',
      transactionDate: '2024-03-12',
      categoryName: 'Food',
    });
    expect(response.body.createdAt.slice(0, 10)).not.toBe(response.body.transactionDate);
    const row = db
      .prepare('SELECT amount_paise FROM transactions WHERE id = ?')
      .get(response.body.id);
    expect(row.amount_paise).toBe(25050);
    expect(
      (
        await request(app)
          .get(`/api/transactions/${response.body.id}/history`)
          .set('Cookie', cookieA)
      ).body[0].action,
    ).toBe('create');
  });

  it('accepts income and rejects malformed, negative, excessive, and mismatched amounts/categories', async () => {
    await create(cookieA, { type: 'income', categoryId: incomeCategory, amount: '0.10' }).expect(
      201,
    );
    await create(cookieA, { amount: '250.505' }).expect(400);
    await create(cookieA, { amount: '-2' }).expect(400);
    await create(cookieA, { amount: '100000001' }).expect(400);
    await create(cookieA, { type: 'income' }).expect(422);
  });

  it('enforces category visibility and full transaction ownership', async () => {
    const ownCategory = await request(app)
      .post('/api/categories')
      .set('Cookie', cookieA)
      .send({ name: 'My food', type: 'expense' })
      .expect(201);
    await create(cookieB, { categoryId: ownCategory.body.id }).expect(422);
    const made = await create(cookieA).expect(201);
    await request(app).get(`/api/transactions/${made.body.id}`).set('Cookie', cookieB).expect(404);
    await request(app)
      .patch(`/api/transactions/${made.body.id}`)
      .set('Cookie', cookieB)
      .send({ description: 'intrude' })
      .expect(404);
    await request(app)
      .delete(`/api/transactions/${made.body.id}`)
      .set('Cookie', cookieB)
      .send({})
      .expect(404);
    await request(app)
      .get(`/api/transactions/${made.body.id}/history`)
      .set('Cookie', cookieB)
      .expect(404);
  });

  it('updates once with history, while an unchanged patch creates no row', async () => {
    const made = await create(cookieA).expect(201);
    await request(app)
      .patch(`/api/transactions/${made.body.id}`)
      .set('Cookie', cookieA)
      .send({ amount: '260.00', reason: 'Corrected receipt' })
      .expect(200);
    let entries = await request(app)
      .get(`/api/transactions/${made.body.id}/history`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(entries.body[0]).toMatchObject({
      action: 'update',
      changedFields: ['amountPaise'],
      reason: 'Corrected receipt',
    });
    const updatedAt = entries.body[0].after.updatedAt;
    await request(app)
      .patch(`/api/transactions/${made.body.id}`)
      .set('Cookie', cookieA)
      .send({ amount: '260.00' })
      .expect(200);
    entries = await request(app)
      .get(`/api/transactions/${made.body.id}/history`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(entries.body).toHaveLength(2);
    expect(entries.body[0].after.updatedAt).toBe(updatedAt);
  });

  it('soft deletes, omits deleted rows, restores, and returns 404 on a second delete', async () => {
    const made = await create(cookieA).expect(201);
    await request(app)
      .delete(`/api/transactions/${made.body.id}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(204);
    expect(
      (await request(app).get('/api/transactions').set('Cookie', cookieA)).body.data,
    ).toHaveLength(0);
    await request(app)
      .delete(`/api/transactions/${made.body.id}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(404);
    await request(app)
      .post(`/api/transactions/${made.body.id}/restore`)
      .set('Cookie', cookieA)
      .send({})
      .expect(200);
    const history = await request(app)
      .get(`/api/transactions/${made.body.id}/history`)
      .set('Cookie', cookieA);
    expect(history.body.map((entry) => entry.action)).toEqual(['restore', 'delete', 'create']);
  });

  it('filters inclusively and paginates results', async () => {
    await create(cookieA, { transactionDate: '2024-03-10', description: 'Coffee' }).expect(201);
    await create(cookieA, { transactionDate: '2024-03-11', description: 'Coffee shop' }).expect(
      201,
    );
    await create(cookieA, { transactionDate: '2024-03-12', description: 'Groceries' }).expect(201);
    const result = await request(app)
      .get('/api/transactions?from=2024-03-10&to=2024-03-11&q=coffee&page=1&pageSize=1&sort=amount')
      .set('Cookie', cookieA)
      .expect(200);
    expect(result.body.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(result.body.data).toHaveLength(1);
  });

  it('accepts a date one day ahead, rejects dates further ahead, and allows valid historical dates', async () => {
    const today = todayInTimezone('Asia/Kolkata');
    const [year, month, day] = today.split('-').map(Number);
    const oneDayAhead = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    const twoDaysAhead = new Date(Date.UTC(year, month - 1, day + 2)).toISOString().slice(0, 10);
    await create(cookieA, { transactionDate: oneDayAhead }).expect(201);
    await create(cookieA, { transactionDate: twoDaysAhead }).expect(422);
    await create(cookieA, { transactionDate: '2022-01-01' }).expect(201);
  });

  it('rejects duplicate custom categories ignoring letter case', async () => {
    await request(app)
      .post('/api/categories')
      .set('Cookie', cookieA)
      .send({ name: 'Groceries', type: 'expense' })
      .expect(201);
    const duplicate = await request(app)
      .post('/api/categories')
      .set('Cookie', cookieA)
      .send({ name: ' groceries ', type: 'expense' })
      .expect(409);
    expect(duplicate.body.error.code).toBe('CATEGORY_EXISTS');
  });

  it('protects categories and refuses deleting one in active use', async () => {
    await request(app)
      .patch(`/api/categories/${expenseCategory}`)
      .set('Cookie', cookieA)
      .send({ name: 'Renamed' })
      .expect(403);
    const custom = await request(app)
      .post('/api/categories')
      .set('Cookie', cookieA)
      .send({ name: 'Other Food', type: 'expense' })
      .expect(201);
    await create(cookieA, { categoryId: custom.body.id }).expect(201);
    await request(app)
      .delete(`/api/categories/${custom.body.id}`)
      .set('Cookie', cookieA)
      .send({})
      .expect(409);
  });

  it('keeps the committed response successful if the event handler throws', async () => {
    const throwingApp = createApp({
      db,
      config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret },
      gamificationHandler: () => {
        throw new Error('handler broke');
      },
      logger: { info() {}, error() {} },
    });
    await request(throwingApp)
      .post('/api/transactions')
      .set('Cookie', cookieA)
      .send({
        type: 'expense',
        amount: '12.50',
        categoryId: expenseCategory,
        transactionDate: '2024-03-12',
      })
      .expect(201);
    expect(db.prepare('SELECT count(*) AS count FROM transactions').get().count).toBe(1);
    expect(throwingApp).toBeDefined();
  });

  it('emits no update event or audit row when the patch makes no changes', async () => {
    const events = [];
    const eventApp = createApp({
      db,
      config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret },
      gamificationHandler: (event) => events.push(event),
      logger: { info() {}, error() {} },
    });
    const created = await request(eventApp)
      .post('/api/transactions')
      .set('Cookie', cookieA)
      .send({
        type: 'expense',
        amount: '1.00',
        categoryId: expenseCategory,
        transactionDate: '2024-03-12',
        description: 'Same',
      })
      .expect(201);
    await request(eventApp)
      .patch(`/api/transactions/${created.body.id}`)
      .set('Cookie', cookieA)
      .send({
        type: 'expense',
        amount: '1.00',
        categoryId: expenseCategory,
        transactionDate: '2024-03-12',
        description: 'Same',
      })
      .expect(200);
    expect(events.map((event) => event.event)).toEqual(['TRANSACTION_CREATED']);
    expect(
      db
        .prepare('SELECT count(*) AS count FROM transaction_audit WHERE transaction_id = ?')
        .get(created.body.id).count,
    ).toBe(1);
  });

  it('exposes only append and read audit repository operations and rejects direct mutation', async () => {
    const created = await create(cookieA).expect(201);
    expect(Object.keys(createAuditRepository(db)).sort()).toEqual(['insert', 'listForTransaction']);
    expect(() =>
      db
        .prepare('UPDATE transaction_audit SET reason = ? WHERE transaction_id = ?')
        .run('altered', created.body.id),
    ).toThrow();
    expect(() =>
      db.prepare('DELETE FROM transaction_audit WHERE transaction_id = ?').run(created.body.id),
    ).toThrow();
  });

  it('keeps 0.10 exact through repeated money conversions', async () => {
    const amounts = Array.from({ length: 1000 }, () => rupeesToPaise('0.10'));
    expect(amounts.reduce((sum, value) => sum + value, 0)).toBe(10000);
  });
});
