import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { CELEBRATION_CONFIG } from './config/celebrationConfig.js';

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
    db.prepare('UPDATE celebration_claims SET expires_at=? WHERE notice_id=?').run('2000-01-01T00:00:00.000Z', noticeId);
    const recovered = await request(app).post('/api/celebrations/claim').set('Cookie', cookie).send({}).expect(200);
    expect(recovered.body.data.map(({ id }) => id)).toEqual([noticeId]);
    const stranger = await request(app).post('/api/auth/register').send({ email: 'claim-stranger@example.com', password: 'securepass1', displayName: 'Other User' }).expect(201);
    const strangerCookie = stranger.headers['set-cookie'][0].split(';')[0];
    const otherUser = await request(app).post('/api/celebrations/claim').set('Cookie', strangerCookie).send({}).expect(200);
    expect(otherUser.body.data).toEqual([]);
  });

  it('returns only the allowlisted presentation contract for every celebration code', async () => {
    const payload = {
      fromLevel: 1, toLevel: 2, titleBefore: 'Beginner', titleAfter: 'Explorer', titleChanged: true,
      lifetimeXp: 60, progressBps: 250, date: '2026-11-23', xpDelta: 10,
      entries: [{ ruleId: 'XP-001', delta: 10, reasonCode: 'FIRST_STEP', amountPaise: 9000 }],
      streakBefore: 1, streakAfter: 2, streakStatus: 'ACTIVE', runId: 12,
      milestone: 7, length: 7, xp: 20, inventoryAfter: 1, lengthAtEnd: 6,
      comebackEligibleUntil: '2026-11-30', fromLength: 2, toLength: 7,
      slug: 'first_step', tier: 1, rarity: 'COMMON', category: 'tracking', hidden: false,
      achievedOn: '2026-11-23', coalesced: [{ slug: 'spender', tier: 2, rarity: 'RARE', amount: 999 }],
      missionId: 3, templateId: 'MIS_DAILY_REVIEW', slot: 'DAILY', periodKey: '2026-11-23', xpAwarded: 15,
      challengeSlug: 'first-week', status: 'COMPLETED', qualifyingDays: 7, requiredDays: 7,
      id: 4, itemSlug: 'forest-theme', type: 'COSMETIC', itemType: 'COSMETIC', costXp: 50,
      spendableXp: 100, level: 2, amount: '₹90.00', amountPaise: 9000,
      transactionId: 55, description: 'Financial detail must not appear in a celebration.',
    };
    for (const [index, code] of CELEBRATION_CONFIG.codes.entries()) {
      db.prepare(`INSERT INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at)
        VALUES(1,'PROGRESS',?,?,?,?)`).run(code, JSON.stringify(payload), `contract:${index}`, `2026-11-18T12:00:${String(index).padStart(2, '0')}.000Z`);
    }

    const preview = await request(app).get('/api/celebrations/pending').set('Cookie', cookie).expect(200);
    expect(JSON.stringify(preview.body.data)).not.toMatch(/amountPaise|transactionId|description|₹90\.00/);
    const { body } = await request(app).post('/api/celebrations/claim').set('Cookie', cookie).send({}).expect(200);
    expect(body.data).toHaveLength(CELEBRATION_CONFIG.codes.length + 1);
    const levelUp = body.data.find(({ code }) => code === 'LEVEL_UP');
    expect(levelUp.data).toMatchObject({ fromLevel: 1, toLevel: 2, titleAfter: 'Explorer', progressBps: 250 });
    const recap = body.data.find(({ code }) => code === 'DAY_RECAP');
    expect(recap.data.entries).toEqual([{ ruleId: 'XP-001', delta: 10, reasonCode: 'FIRST_STEP' }]);
    const badge = body.data.find(({ code, data }) => code === 'BADGE_UNLOCKED' && data.coalesced);
    expect(badge.data.coalesced).toEqual([{ slug: 'spender', tier: 2, rarity: 'RARE' }]);
    const purchase = body.data.find(({ code }) => code === 'PURCHASE_COMPLETED');
    expect(purchase.data.costXp).toBe(50);
    expect(JSON.stringify(body.data)).not.toMatch(/amountPaise|transactionId|description|₹90\.00/);
  });
});
