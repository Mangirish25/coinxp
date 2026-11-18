import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';

describe('NOT-005 celebration notice routes', () => {
  let db; let app; let cookie; let noticeId;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret }, logger: { info() {}, error() {} } });
    const user = await request(app).post('/api/auth/register').send({ email: 'celebration@example.com', password: 'securepass1', displayName: 'Celebration User' }).expect(201);
    cookie = user.headers['set-cookie'][0].split(';')[0];
    noticeId = Number(db.prepare(`INSERT INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at)
      VALUES(1,'REWARD','BADGE_UNLOCKED','{"slug":"first_step","rarity":"COMMON","xp":10}','BADGE:1:first_step:1','2026-11-18T12:00:00.000Z')`).run().lastInsertRowid);
  });
  afterEach(() => db.close());

  it('requires auth and returns owner-scoped unread celebration notices', async () => {
    await request(app).get('/api/celebrations/pending').expect(401);
    const other = await request(app).post('/api/auth/register').send({ email: 'another-celebration@example.com', password: 'securepass1', displayName: 'Other User' }).expect(201);
    const otherCookie = other.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).get('/api/celebrations/pending').set('Cookie', otherCookie).expect(200)).body.data).toHaveLength(0);
    const pending = await request(app).get('/api/celebrations/pending').set('Cookie', cookie).expect(200);
    expect(pending.body.data).toEqual([expect.objectContaining({ id: noticeId, data: { slug: 'first_step', rarity: 'COMMON', xp: 10 } })]);
  });

  it('acknowledges through the requested user-owned notice id once and never replays it', async () => {
    await request(app).post('/api/celebrations/ack').set('Cookie', cookie).set('Content-Type', 'application/json').send({ upToId: noticeId }).expect(200);
    expect(db.prepare('SELECT read_at AS readAt FROM user_notices WHERE id=?').get(noticeId).readAt).not.toBeNull();
    expect((await request(app).get('/api/celebrations/pending').set('Cookie', cookie).expect(200)).body.data).toHaveLength(0);
  });

  it('NOT-005: claims unread celebrations for only one active client at a time', async () => {
    const first = await request(app).post('/api/celebrations/claim').set('Cookie', cookie).send({}).expect(200);
    expect(first.body.data).toEqual([expect.objectContaining({ id: noticeId, data: expect.objectContaining({ slug: 'first_step' }) })]);
    const secondDevice = await request(app).post('/api/celebrations/claim').set('Cookie', cookie).send({}).expect(200);
    expect(secondDevice.body.data).toEqual([]);
    const stranger = await request(app).post('/api/auth/register').send({ email: 'claim-stranger@example.com', password: 'securepass1', displayName: 'Other User' }).expect(201);
    const strangerCookie = stranger.headers['set-cookie'][0].split(';')[0];
    const otherUser = await request(app).post('/api/celebrations/claim').set('Cookie', strangerCookie).send({}).expect(200);
    expect(otherUser.body.data).toEqual([]);
  });
});
