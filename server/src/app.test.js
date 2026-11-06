import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

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

  it('returns the consistent not-found error shape', async () => {
    await request(app)
      .get('/api/missing')
      .expect(404, {
        error: { code: 'NOT_FOUND', message: 'The requested endpoint was not found.' },
      });
  });
});
