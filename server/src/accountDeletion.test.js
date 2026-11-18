import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createAccountService } from './services/accountService.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { createTestClock } from './gamification/clock.js';

const secret = 'account-deletion-test-secret-long-enough';
const password = 'safe-password-82';

describe('USR-008 account deletion grace, restore and erasure', () => {
  let db;
  let clock;
  let app;
  beforeEach(() => {
    db = createDatabase(':memory:'); migrateDatabase(db); clock = createTestClock('2026-01-01T00:00:00.000Z');
    app = createApp({ db, clock, config: { nodeEnv: 'test', clientOrigin: 'http://localhost:5173', jwtSecret: secret }, logger: { info() {} } });
  });
  afterEach(() => db.close());

  async function register(email) {
    const response = await request(app).post('/api/auth/register').send({ email, password, displayName: 'Account Owner' }).expect(201);
    return { user: response.body, cookie: response.headers['set-cookie'][0].split(';')[0] };
  }

  it('schedules with current password, blocks normal access, and restores after login during grace', async () => {
    const account = await register('restore@example.com');
    const scheduled = await request(app).delete('/api/account').set('Cookie', account.cookie).send({ password }).expect(202);
    expect(new Date(scheduled.body.scheduledFor).getTime() - clock.now().getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(scheduled.headers['set-cookie'][0]).toContain('coinxp_auth=;');
    const login = await request(app).post('/api/auth/login').send({ email: 'restore@example.com', password }).expect(423);
    expect(login.body.error.code).toBe('ACCOUNT_PENDING_DELETION');
    const recoveryCookie = login.headers['set-cookie'][0].split(';')[0];
    await request(app).get('/api/budgets').set('Cookie', recoveryCookie).expect(423);
    await request(app).post('/api/account/restore').set('Cookie', recoveryCookie).send({}).expect(200, account.user);
    expect(db.prepare('SELECT status FROM account_deletions WHERE user_id=?').get(account.user.id).status).toBe('CANCELLED');
    await request(app).get('/api/auth/me').set('Cookie', recoveryCookie).expect(200, account.user);
  });

  it('hard-erases user-owned finance and append-only history after the grace period', async () => {
    const account = await register('erase@example.com');
    const categoryId = Number(db.prepare("INSERT INTO categories(user_id,name,type,icon,is_default,created_at) VALUES(NULL,'Food','expense','Utensils',1,?)")
      .run(clock.now().toISOString()).lastInsertRowid);
    await request(app).post('/api/transactions').set('Cookie', account.cookie).send({
      type: 'expense', amount: '25.00', categoryId, description: 'private history', transactionDate: '2026-01-01',
    }).expect(201);
    await request(app).delete('/api/account').set('Cookie', account.cookie).send({ password }).expect(202);
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(createAccountService({ db, clock }).purgeDue()).toBe(1);
    expect(db.prepare('SELECT 1 FROM users WHERE id=?').get(account.user.id)).toBeUndefined();
    expect(db.prepare('SELECT status FROM account_deletions WHERE user_id=?').get(account.user.id).status).toBe('COMPLETED');
    expect(db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE user_id=?').get(account.user.id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM transaction_audit WHERE user_id=?').get(account.user.id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_progress WHERE user_id=?').get(account.user.id).n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM categories WHERE user_id IS NULL AND name='Food'").get().n).toBe(1);
  });
});
