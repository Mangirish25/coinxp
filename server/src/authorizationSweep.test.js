import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

// SEC-002: keep this explicit inventory aligned with the API route table.
// Health/readiness, public auth entry points, and public gamification rules are intentionally excluded.
const protectedRoutes = [
  ['get', '/api/auth/me'], ['patch', '/api/auth/timezone'], ['post', '/api/auth/change-password'],
  ['get', '/api/categories'], ['post', '/api/categories'], ['patch', '/api/categories/1'], ['delete', '/api/categories/1'],
  ['get', '/api/transactions'], ['post', '/api/transactions'], ['get', '/api/transactions/unexpected-quota'],
  ['get', '/api/transactions/1/history'], ['post', '/api/transactions/1/restore'], ['get', '/api/transactions/1'],
  ['patch', '/api/transactions/1'], ['delete', '/api/transactions/1'],
  ['get', '/api/budgets'], ['put', '/api/budgets'], ['get', '/api/budgets/status'], ['get', '/api/budgets/daily-status'], ['delete', '/api/budgets/1'],
  ['get', '/api/dashboard/summary'], ['get', '/api/analytics/category-breakdown'],
  ['get', '/api/analytics/daily-spending'], ['get', '/api/analytics/income-vs-expense'], ['get', '/api/analytics/monthly-report'],
  ['get', '/api/gamification/summary'], ['get', '/api/gamification/ledger'], ['get', '/api/gamification/daily-review/today'],
  ['post', '/api/gamification/daily-review'], ['post', '/api/gamification/feed/ack'],
  ['get', '/api/streaks'], ['get', '/api/streaks/tracking/calendar'], ['get', '/api/streaks/freezes'], ['get', '/api/streaks/rules'],
  ['get', '/api/integrity/status'], ['get', '/api/integrity/notices'], ['post', '/api/integrity/notices/ack'], ['post', '/api/integrity/appeals'],
  ['get', '/api/badges'], ['get', '/api/missions'], ['get', '/api/missions/history'], ['post', '/api/missions/daily/reroll'],
  ['get', '/api/shop'], ['get', '/api/shop/purchases'], ['post', '/api/shop/purchase'],
  ['get', '/api/challenges'], ['post', '/api/challenges/sample/start'], ['get', '/api/challenges/runs/1'],
  ['post', '/api/challenges/runs/1/cancel'], ['post', '/api/challenges/runs/1/abandon'],
  ['get', '/api/profile'], ['post', '/api/profile/showcase'], ['post', '/api/profile/equip'], ['get', '/api/activity'],
  ['get', '/api/notifications/preferences'], ['put', '/api/notifications/preferences'],
  ['get', '/api/celebrations/pending'], ['post', '/api/celebrations/claim'], ['post', '/api/celebrations/ack'],
  ['get', '/api/ui/preferences'], ['put', '/api/ui/preferences'], ['get', '/api/account/export'],
  ['delete', '/api/account'], ['post', '/api/account/restore'],
];

describe('SEC-002 protected API route sweep', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    app = createApp({ db, config: {
      nodeEnv: 'test', clientOrigin: 'http://localhost:5173', jwtSecret: 'test-secret-long-enough-for-signing',
    } });
  });

  afterEach(() => db.close());

  it.each(protectedRoutes)('%s %s rejects unauthenticated access', async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
