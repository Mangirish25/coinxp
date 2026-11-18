import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

describe('Part 9 USR-007 private profile', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-only-secret-with-at-least-thirty-two-characters' }, logger: { info() {}, error() {} } });
    const response = await request(app).post('/api/auth/register').send({ email: 'profile@example.com', password: 'securepass1', displayName: 'Profile User' }).expect(201);
    cookie = response.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('returns private progress without any financial transaction data', async () => {
    await request(app).get('/api/profile').expect(401);
    const profile = await request(app).get('/api/profile').set('Cookie', cookie).expect(200);
    expect(profile.body).toMatchObject({ displayName: 'Profile User', level: 1, title: 'Beginner', lifetimeXp: 0, spendableXp: 0,
      badgeCounts: {}, showcase: [], equippedTheme: null, equippedFrame: null, completedChallenges: 0, recentActivity: [] });
    expect(profile.body).not.toHaveProperty('transactions');
    expect(profile.body).not.toHaveProperty('amountPaise');
  });

  it('USR-007: validates showcase ownership and cosmetic ownership', async () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO user_badges(user_id,badge_slug,tier,rarity,xp_awarded,unlocked_at,achieved_on,source_json,status,catalog_version)
      VALUES(1,'first_step',1,'COMMON',10,?,?, '{}','ACTIVE','1.0.0')`).run(now,now.slice(0,10));
    await request(app).post('/api/profile/showcase').set('Cookie',cookie).send({ slugs: ['first_step'] }).expect(200)
      .expect(({ body }) => expect(body.showcase).toEqual(['first_step']));
    await request(app).post('/api/profile/showcase').set('Cookie',cookie).send({ slugs: ['not-owned'] }).expect(422);
    await request(app).post('/api/profile/equip').set('Cookie',cookie).send({ slot: 'THEME', itemSlug: 'theme_midnight' }).expect(403);
    app.locals.gameEngine.adjust({ userId:1,delta:3000,reason:'Test cosmetic ownership with a valid level.',actor:'test' });
    await request(app).post('/api/shop/purchase').set('Cookie',cookie).set('Idempotency-Key','profile-frame-1').send({ itemSlug:'frame_bronze' }).expect(201);
    await request(app).post('/api/profile/equip').set('Cookie',cookie).send({ slot:'FRAME',itemSlug:'frame_bronze' }).expect(200)
      .expect(({ body }) => expect(body.equippedFrame).toBe('frame_bronze'));
    const other = await request(app).post('/api/auth/register').send({ email:'profile-other@example.com',password:'securepass1',displayName:'Other' }).expect(201);
    const otherCookie = other.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).get('/api/profile').set('Cookie',otherCookie).expect(200)).body.showcase).toEqual([]);
  });
});
