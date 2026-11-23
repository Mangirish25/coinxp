import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { shiftDate } from './gamification/dateMath.js';
import { todayInTimezone } from './utils/dates.js';

describe('Part 9 MIS-006/007 challenge lifecycle', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-only-secret-with-at-least-thirty-two-characters' }, logger: { info() {}, error() {} } });
    const response = await request(app).post('/api/auth/register').send({ email: 'challenge@example.com', password: 'securepass1', displayName: 'Challenge User' }).expect(201);
    cookie = response.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  function addXp(amount) {
    app.locals.gameEngine.adjust({ userId: 1, delta: amount, reason: 'Test balance for challenge flow.', actor: 'test' });
  }

  it('requires a daily limit, charges once, and refunds a cancelled pending challenge', async () => {
    addXp(300);
    await request(app).post('/api/challenges/discipline_7/start').set('Cookie', cookie).set('Idempotency-Key', 'challenge-key-1').send({}).expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('REQUIREMENT_NOT_MET'));
    await request(app).put('/api/budgets').set('Cookie', cookie).send({ scope: 'daily_limit', amount: '100' }).expect(200);
    const started = await request(app).post('/api/challenges/discipline_7/start').set('Cookie', cookie).set('Idempotency-Key', 'challenge-key-2').send({}).expect(201);
    expect(started.body).toMatchObject({ challengeSlug: 'discipline_7', status: 'PENDING', costXp: 100, qualifyingDays: 0, requiredDays: 6 });
    const replay = await request(app).post('/api/challenges/discipline_7/start').set('Cookie', cookie).set('Idempotency-Key', 'challenge-key-2').send({}).expect(200);
    expect(replay.body.id).toBe(started.body.id);
    expect(db.prepare('SELECT spendable_xp AS xp FROM user_progress WHERE user_id=1').get().xp).toBe(225);
    await request(app).post(`/api/challenges/runs/${started.body.id}/cancel`).set('Cookie', cookie).send({}).expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ cancelled: true, refundXp: 100, spendableXp: 325 }));
    expect(db.prepare('SELECT status FROM challenge_runs WHERE id=?').get(started.body.id).status).toBe('CANCELLED');
    expect(db.prepare('SELECT status FROM purchases WHERE id=?').get(started.body.purchaseId).status).toBe('REFUNDED');
    expect(db.prepare("SELECT sum(balance_delta) AS balanceDelta,sum(lifetime_delta) AS lifetimeDelta FROM xp_ledger WHERE user_id=1 AND entry_type='SPEND'").get())
      .toMatchObject({ balanceDelta: 0, lifetimeDelta: 0 });
  });

  it('evaluates closed challenge days and awards the first completion reward once', async () => {
    const today = todayInTimezone('Asia/Kolkata');
    const start = shiftDate(today, -14);
    const end = shiftDate(today, -1);
    const now = new Date().toISOString();
    const runId = Number(db.prepare(`INSERT INTO challenge_runs(user_id,challenge_slug,status,cost_xp,purchase_id,start_date,end_date,qualifying_days,required_days,xp_awarded,catalog_version,created_at)
      VALUES(1,'tracking_14','ACTIVE',50,NULL,?,?,0,13,0,'1.0.0',?)`).run(start,end,now).lastInsertRowid);
    for (let date = start; date <= end; date = shiftDate(date, 1)) {
      db.prepare(`INSERT INTO settlements(user_id,period_type,period_key,outcome,reason_code,details_json,settled_at,rule_version)
        VALUES(1,'day',?,'INELIGIBLE','TEST','{"xpTracked":true}',?,'0.1.0')`).run(date,now);
    }
    app.locals.gameEngine.advanceRewards(1);
    expect(db.prepare('SELECT status,qualifying_days AS qualifyingDays,xp_awarded AS xpAwarded FROM challenge_runs WHERE id=?').get(runId))
      .toMatchObject({ status: 'COMPLETED', qualifyingDays: 14, xpAwarded: 50 });
    expect(db.prepare("SELECT lifetime_delta AS delta FROM xp_ledger WHERE user_id=1 AND entitlement_key='MIS-007:tracking_14' AND entry_type='AWARD'").get().delta).toBe(50);
    const notice = db.prepare("SELECT data_json AS dataJson FROM user_notices WHERE user_id=1 AND code='CHALLENGE_COMPLETED'").get();
    expect(JSON.parse(notice.dataJson)).toMatchObject({ slug: 'tracking_14', qualifyingDays: 14, requiredDays: 13, xp: 50 });
    const details = (await request(app).get(`/api/challenges/runs/${runId}`).set('Cookie', cookie).expect(200)).body;
    expect(details.days).toHaveLength(14);
    expect(details.days.every(({ status, qualified }) => status === 'FINAL' && qualified === 1)).toBe(true);
  });
});
