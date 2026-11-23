import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

const publicRoutes = new Set([
  'GET /api/health', 'GET /api/ready',
  'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/logout',
  'GET /api/gamification/rules',
]);
const customAuthRoutes = new Set(['GET /api/health/details']);
const paramsForSmokeTest = { id: '1', slug: 'sample', slot: 'daily' };

function routeCases(apiRouters) {
  const cases = [];
  for (const { prefix, router } of apiRouters) {
    let routerGuarded = false;
    for (const layer of router.stack) {
      if (layer.handle?.isRequireAuth) routerGuarded = true;
      if (!layer.route) continue;
      const localPath = Array.isArray(layer.route.path) ? layer.route.path[0] : layer.route.path;
      const path = `${prefix}${localPath === '/' ? '' : localPath}`.replace(/:([A-Za-z]\w*)/g, (_match, key) => paramsForSmokeTest[key] ?? '1');
      for (const method of Object.keys(layer.route.methods)) {
        const key = `${method.toUpperCase()} ${path}`;
        const routeGuarded = routerGuarded || layer.route.stack.some((handler) => handler.handle?.isRequireAuth);
        cases.push({ method, path, key, routeGuarded });
      }
    }
  }
  return cases;
}

describe('SEC-002 protected API route sweep', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    app = createApp({ db, config: {
      nodeEnv: 'test', clientOrigin: 'http://localhost:5173', jwtSecret: 'test-secret-long-enough-for-signing',
      opsHealthToken: 'test-ops-token',
    } });
  });

  afterEach(() => db.close());

  it('SEC-002 enumerates every mounted route and rejects private routes without a session', async () => {
    const cases = routeCases(app.locals.apiRouters);
    const privateCases = cases.filter(({ key }) => !publicRoutes.has(key));
    expect(privateCases).toHaveLength(65);

    for (const route of privateCases) {
      expect(route.routeGuarded || customAuthRoutes.has(route.key), `${route.method.toUpperCase()} ${route.path} must install requireAuth`).toBe(true);
      const response = await request(app)[route.method](route.path);
      expect(response.status, route.key).toBe(401);
      expect(response.body.error.code, route.key).toBe('UNAUTHENTICATED');
    }
  });
});
