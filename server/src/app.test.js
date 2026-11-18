import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { createTestClock } from './gamification/clock.js';

describe('GET /api/health', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    app = createApp({
      db,
      config: { clientOrigin: 'http://localhost:5173' },
      logger: { info: vi.fn() },
    });
  });

  afterEach(() => db.close());

  it('queries the database and returns the health payload', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', db: 'connected' });
    expect(new Date(response.body.time).toISOString()).toBe(response.body.time);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('OPS-005 exposes readiness after migrations and protects operational details with a token', async () => {
    const appWithOpsToken = createApp({ db, config: {
      clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-secret-long-enough-for-signing',
      opsHealthToken: 'ops-test-token', dbPath: ':memory:',
    }, logger: { info: vi.fn() } });
    await request(appWithOpsToken).get('/api/ready').expect(200, { ready: true });
    await request(appWithOpsToken).get('/api/health/details').expect(401);
    const details = await request(appWithOpsToken).get('/api/health/details')
      .set('Authorization', 'Bearer ops-test-token').expect(200);
    expect(details.body).toMatchObject({ deadLetterEvents: 0, activeHolds: 0, lastBackupAt: null });
  });

  it('CR-21 exposes an injectable clock only in explicitly enabled tests', async () => {
    await request(app).post('/api/test/clock').send({ advanceMs: 1000 }).expect(404);
    const clock = createTestClock('2026-01-01T00:00:00.000Z');
    const testApp = createApp({ db, clock, config: {
      clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-secret-long-enough-for-signing', enableTestClock: true,
    }, logger: { info: vi.fn() } });
    await request(testApp).post('/api/test/clock').send({ advanceMs: 2000 })
      .expect(200, { now: '2026-01-01T00:00:02.000Z' });
    await request(testApp).post('/api/test/clock').send({ setTo: '2026-01-03T10:30:00.000Z' })
      .expect(200, { now: '2026-01-03T10:30:00.000Z' });
    await request(testApp).post('/api/test/clock').send({ setTo: 'bad' }).expect(400);
  });

  it('returns the consistent not-found error shape', async () => {
    await request(app)
      .get('/api/missing')
      .expect(404, {
        error: { code: 'NOT_FOUND', message: 'The requested endpoint was not found.' },
      });
  });
});
