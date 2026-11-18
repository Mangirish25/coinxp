import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

describe('Part 9 MIS-001/MIS-002 mission assignment', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-only-secret-with-at-least-thirty-two-characters' }, logger: { info() {}, error() {} } });
    const response = await request(app).post('/api/auth/register').send({ email: 'mission@example.com', password: 'securepass1', displayName: 'Mission User' }).expect(201);
    cookie = response.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('requires authentication and assigns at most one mission per current slot', async () => {
    await request(app).get('/api/missions').expect(401);
    await request(app).get('/api/missions').set('Cookie', cookie).expect(200).expect(({ body }) => expect(body.data).toEqual([]));
    db.prepare('UPDATE users SET created_at=? WHERE id=1').run('2026-11-01T00:00:00.000Z');
    const first = await request(app).get('/api/missions').set('Cookie', cookie).expect(200);
    const again = await request(app).get('/api/missions').set('Cookie', cookie).expect(200);
    expect(first.body.data.map(({ slot }) => slot)).toEqual(['DAILY', 'WEEKLY']);
    expect(again.body.data.map(({ id }) => id)).toEqual(first.body.data.map(({ id }) => id));
    expect(db.prepare("SELECT count(*) AS count FROM user_missions WHERE user_id=1 AND status<>'REPLACED'").get().count).toBe(2);
    expect(first.body.data.every(({ params }) => params.catalogVersion === '1.0.0')).toBe(true);
  });

  it('MIS-005: replaces an assigned daily mission once using deterministic ranking', async () => {
    db.prepare('UPDATE users SET created_at=? WHERE id=1').run('2026-11-01T00:00:00.000Z');
    const before = await request(app).get('/api/missions').set('Cookie', cookie).expect(200);
    const original = before.body.data.find(({ slot }) => slot === 'DAILY');
    const replaced = await request(app).post('/api/missions/daily/reroll').set('Cookie', cookie).send({}).expect(200);
    expect(replaced.body).toMatchObject({ slot: 'DAILY', periodKey: original.periodKey, status: 'ASSIGNED', generationSeq: 1 });
    expect(replaced.body.templateId).not.toBe(original.templateId);
    expect(db.prepare('SELECT status FROM user_missions WHERE id=? AND user_id=1').get(original.id).status).toBe('REPLACED');
    await request(app).post('/api/missions/daily/reroll').set('Cookie', cookie).send({}).expect(409);
    await request(app).post('/api/missions/monthly/reroll').set('Cookie', cookie).send({}).expect(409);
  });
});
