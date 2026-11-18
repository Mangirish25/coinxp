import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

const secret = 'account-export-test-secret-32-characters';

describe('USR-008 owner-scoped account export', () => {
  let db;
  let app;
  beforeEach(() => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { nodeEnv: 'test', clientOrigin: 'http://localhost:5173', jwtSecret: secret }, logger: { info() {} } });
  });
  afterEach(() => db.close());

  async function register(email) {
    const response = await request(app).post('/api/auth/register').send({ email, password: 'safe-password-82', displayName: email.split('@')[0] }).expect(201);
    return { user: response.body, cookie: response.headers['set-cookie'][0].split(';')[0] };
  }

  it('streams the full account record sets without password hashes or another user data and limits exports to one per hour', async () => {
    const alice = await register('alice@example.com');
    const bob = await register('bob@example.com');
    const categoryId = Number(db.prepare("INSERT INTO categories(user_id,name,type,icon,is_default,created_at) VALUES(NULL,'Food','expense','Utensils',1,?)").run(new Date().toISOString()).lastInsertRowid);
    const at = new Date().toISOString();
    const addTransaction = db.prepare(`INSERT INTO transactions(user_id,category_id,type,amount_paise,description,transaction_date,created_at,updated_at)
      VALUES(?,?,'expense',1200,?,'2026-11-01',?,?)`);
    addTransaction.run(alice.user.id, categoryId, 'alice private note', at, at);
    addTransaction.run(bob.user.id, categoryId, 'bob private note', at, at);

    const exportResponse = await request(app).get('/api/account/export').set('Cookie', alice.cookie).expect(200);
    expect(exportResponse.headers['content-disposition']).toContain('coinxp-export.json');
    expect(exportResponse.headers['cache-control']).toContain('no-store');
    const serialized = JSON.stringify(exportResponse.body);
    expect(serialized).toContain('alice private note');
    expect(serialized).not.toContain('bob private note');
    expect(serialized).not.toContain('$argon2id$');
    expect(exportResponse.body.data.transactions).toHaveLength(1);
    expect(exportResponse.body.data.transaction_audit).toEqual([]);
    await request(app).get('/api/account/export').set('Cookie', alice.cookie).expect(429, {
      error: { code: 'RATE_LIMITED', message: 'An account export was already requested recently. Try again in about an hour.' },
    });
    await request(app).get('/api/account/export').expect(401);
  });
});
