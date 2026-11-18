import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';

describe('MOT-002 user motion and UI preferences', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret }, logger: { info() {}, error() {} } });
    const result = await request(app).post('/api/auth/register').send({ email: 'motion@example.com', password: 'securepass1', displayName: 'Motion User' }).expect(201);
    cookie = result.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('requires authentication and returns safe defaults', async () => {
    await request(app).get('/api/ui/preferences').expect(401);
    await request(app).get('/api/ui/preferences').set('Cookie', cookie).expect(200, { motionMode: 'SYSTEM', celebrations: 'ALL', sound: false, haptics: true, updatedAt: null });
  });

  it('validates and persists the user-scoped preference set idempotently', async () => {
    const values = { motionMode: 'REDUCED', celebrations: 'MAJOR', sound: false, haptics: true };
    const first = await request(app).put('/api/ui/preferences').set('Cookie', cookie).send(values).expect(200);
    expect(first.body).toMatchObject(values);
    const updatedAt = first.body.updatedAt;
    expect(await request(app).get('/api/ui/preferences').set('Cookie', cookie).expect(200).then(({ body }) => body)).toMatchObject(values);
    expect((await request(app).put('/api/ui/preferences').set('Cookie', cookie).send({ ...values, motionMode: 'unsafe' }).expect(400)).body.error.code).toBe('VALIDATION_ERROR');
    expect(db.prepare('SELECT count(*) AS n FROM ui_preferences').get().n).toBe(1);
    expect(updatedAt).toBeTruthy();
  });
});
