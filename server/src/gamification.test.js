import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { todayInTimezone } from './utils/dates.js';
import { derivedLevel, levelThreshold } from './gamification/levels.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';

describe('Part 6 XP engine', () => {
  let db;
  let app;
  let cookie;
  let categoryId;
  let today;

  beforeEach(async () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    db.prepare('INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,?,?,1,?)')
      .run('Food', 'expense', new Date().toISOString());
    categoryId = db.prepare("SELECT id FROM categories WHERE name='Food'").get().id;
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret }, logger: { info() {}, error() {} } });
    const registered = await request(app).post('/api/auth/register').send({ email: 'xp@example.com', password: 'securepass1', displayName: 'XP User', timezone: 'Asia/Kolkata' }).expect(201);
    cookie = registered.headers['set-cookie'][0].split(';')[0];
    today = todayInTimezone('Asia/Kolkata');
  });
  afterEach(() => db.close());

  it('uses the quadratic level thresholds with a monotonic cap', () => {
    expect(levelThreshold(2)).toBe(100);
    expect(derivedLevel(99)).toBe(1);
    expect(derivedLevel(100)).toBe(2);
    expect(derivedLevel(Number.MAX_SAFE_INTEGER)).toBe(100);
  });

  it('awards eligible tracking and review XP, then appends reversals on delete', async () => {
    const created = await request(app).post('/api/transactions').set('Cookie', cookie)
      .send({ type: 'expense', amount: '25.00', categoryId, transactionDate: today }).expect(201);
    expect(created.body.gamification.xpDelta).toBe(35);
    const summary = await request(app).get('/api/gamification/summary').set('Cookie', cookie).expect(200);
    expect(summary.body.lifetimeXp).toBe(35);
    await request(app).post('/api/gamification/daily-review').set('Cookie', cookie).send({ noSpend: false }).expect(201);
    const afterReview = await request(app).get('/api/gamification/summary').set('Cookie', cookie).expect(200);
    expect(afterReview.body.lifetimeXp).toBe(75);
    await request(app).delete(`/api/transactions/${created.body.id}`).set('Cookie', cookie).send({}).expect(204);
    const afterDelete = await request(app).get('/api/gamification/summary').set('Cookie', cookie).expect(200);
    expect(afterDelete.body.lifetimeXp).toBe(25);
    expect(db.prepare("SELECT count(*) AS count FROM xp_ledger WHERE user_id=1 AND entry_type='REVERSAL'").get().count).toBe(3);
    expect(() => db.prepare('UPDATE xp_ledger SET note=? WHERE id=1').run('changed')).toThrow(/append-only/);
  });

  it('supports transaction Idempotency-Key and rejects reuse with a different body', async () => {
    const body = { type: 'expense', amount: '10.00', categoryId, transactionDate: today };
    const first = await request(app).post('/api/transactions').set('Cookie', cookie).set('Idempotency-Key', 'request-key-1').send(body).expect(201);
    const replay = await request(app).post('/api/transactions').set('Cookie', cookie).set('Idempotency-Key', 'request-key-1').send(body).expect(200);
    expect(replay.body.id).toBe(first.body.id);
    await request(app).post('/api/transactions').set('Cookie', cookie).set('Idempotency-Key', 'request-key-1').send({ ...body, amount: '11.00' }).expect(422);
    expect(db.prepare('SELECT count(*) AS count FROM transactions').get().count).toBe(1);
  });

  it('keeps XP summaries, ledgers, and feed cursors isolated by user', async () => {
    const other = await request(app).post('/api/auth/register').send({ email: 'other-xp@example.com', password: 'securepass1', displayName: 'Other XP' }).expect(201);
    const otherCookie = other.headers['set-cookie'][0].split(';')[0];
    const created = await request(app).post('/api/transactions').set('Cookie', cookie)
      .send({ type: 'expense', amount: '25.00', categoryId, transactionDate: today }).expect(201);
    const ownerLedger = await request(app).get('/api/gamification/ledger').set('Cookie', cookie).expect(200);
    expect(ownerLedger.body.data.length).toBeGreaterThan(0);
    const otherLedger = await request(app).get('/api/gamification/ledger').set('Cookie', otherCookie).expect(200);
    expect(otherLedger.body.data).toEqual([]);
    const otherSummary = await request(app).get('/api/gamification/summary').set('Cookie', otherCookie).expect(200);
    expect(otherSummary.body.lifetimeXp).toBe(0);
    await request(app).post('/api/gamification/feed/ack').set('Cookie', otherCookie).send({ upToLedgerId: ownerLedger.body.data[0].id }).expect(422);
    expect(created.body.gamification.xpDelta).toBe(35);
  });

  it('publishes public rules, gates private routes, and reports disabled summaries consistently', async () => {
    const publicRules = (await request(app).get('/api/gamification/rules').expect(200)).body;
    expect(publicRules.configVersion).toBe('0.1.0');
    expect(publicRules.integrity).toBeUndefined();
    await request(app).get('/api/gamification/ledger').expect(401);
    const summary = await request(app).get('/api/gamification/summary').set('Cookie', cookie).expect(200);
    expect(summary.body).toMatchObject({ lifetimeXp: 0, spendableXp: 0, level: 1, title: 'Beginner' });
  });

  it('records a timezone change and applies the configured cooldown', async () => {
    await request(app).patch('/api/auth/timezone').set('Cookie', cookie).send({ timezone: 'UTC' }).expect(200);
    const event = db.prepare("SELECT count(*) AS count FROM domain_events WHERE user_id=1 AND event_type='TIMEZONE_CHANGED'").get();
    expect(event.count).toBe(1);
    const cooldown = await request(app).patch('/api/auth/timezone').set('Cookie', cookie).send({ timezone: 'Europe/London' }).expect(429);
    expect(cooldown.body.error.code).toBe('TIMEZONE_COOLDOWN');
  });

  it('settles daily adherence from the local start-of-day budget snapshot', async () => {
    db.close();
    let instant = new Date('2026-11-07T18:00:00.000Z');
    const clock = { now: () => new Date(instant) };
    db = createDatabase(':memory:');
    migrateDatabase(db);
    db.prepare('INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,?,?,1,?)')
      .run('Food', 'expense', instant.toISOString());
    categoryId = db.prepare("SELECT id FROM categories WHERE name='Food'").get().id;
    app = createApp({ db, clock, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret }, logger: { info() {}, error() {} } });
    const registered = await request(app).post('/api/auth/register').send({ email: 'settlement@example.com', password: 'securepass1', displayName: 'Settlement', timezone: 'Asia/Kolkata' }).expect(201);
    cookie = registered.headers['set-cookie'][0].split(';')[0];
    await request(app).put('/api/budgets').set('Cookie', cookie).send({ scope: 'daily_limit', amount: '150.00' }).expect(200);
    instant = new Date('2026-11-08T02:30:00.000Z');
    await request(app).post('/api/transactions').set('Cookie', cookie).send({ type: 'expense', amount: '100.00', categoryId, transactionDate: '2026-11-08' }).expect(201);
    instant = new Date('2026-11-08T22:30:00.000Z');
    const outcome = app.locals.gameEngine.settleUser(registered.body.id);
    expect(outcome.through).toBe('2026-11-08');
    expect(db.prepare("SELECT outcome FROM settlements WHERE user_id=? AND period_type='day' AND period_key='2026-11-08'").get(registered.body.id).outcome).toBe('PASS');
    const summary = await request(app).get('/api/gamification/summary').set('Cookie', cookie).expect(200);
    expect(summary.body.lifetimeXp).toBe(80);
  });
});
