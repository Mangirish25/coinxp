import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { shiftDate, localInstantToUtc } from './gamification/dateMath.js';
import { todayInTimezone } from './utils/dates.js';

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

  it('MIS-008: returns paged mission history scoped to the authenticated owner', async () => {
    const now='2026-11-01T00:00:00.000Z';
    for (const [periodKey,status] of [['2026-11-01','COMPLETED'],['2026-11-02','EXPIRED']]) db.prepare(`INSERT INTO user_missions(user_id,slot,period_key,template_id,status,generation_seq,params_json,assigned_at,closed_at,xp_awarded,catalog_version)
      VALUES(1,'DAILY',?,'dm_set_limit',?,0,'{}',?,?,5,'1.0.0')`).run(periodKey,status,now,now);
    const other=await request(app).post('/api/auth/register').send({email:'mission-other@example.com',password:'securepass1',displayName:'Other'}).expect(201);
    db.prepare(`INSERT INTO user_missions(user_id,slot,period_key,template_id,status,generation_seq,params_json,assigned_at,catalog_version)
      VALUES(2,'DAILY','2026-11-03','dm_notes','COMPLETED',0,'{}',?,'1.0.0')`).run(now);
    const result=await request(app).get('/api/missions/history?page=1&pageSize=1').set('Cookie',cookie).expect(200);
    expect(result.body.data).toHaveLength(1); expect(result.body.data[0].periodKey).toBe('2026-11-02'); expect(result.body.pagination.total).toBe(2);
    expect((await request(app).get('/api/missions/history').set('Cookie',other.headers['set-cookie'][0].split(';')[0]).expect(200)).body.pagination.total).toBe(1);
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

  it('MIS-003/004: freezes a completed daily mission and awards its configured XP', async () => {
    const today = todayInTimezone('Asia/Kolkata');
    const date = shiftDate(today, -1);
    db.prepare('UPDATE users SET created_at=? WHERE id=1').run('2026-11-01T00:00:00.000Z');
    const params = JSON.stringify({ catalogVersion: '1.0.0' });
    const assignedAt = localInstantToUtc(date, 5, 'Asia/Kolkata');
    const missionId = Number(db.prepare(`INSERT INTO user_missions(user_id,slot,period_key,template_id,status,generation_seq,params_json,assigned_at,catalog_version)
      VALUES(1,'DAILY',?,'dm_set_limit','ASSIGNED',0,?,?,'1.0.0')`).run(date, params, assignedAt).lastInsertRowid);
    const setAt = localInstantToUtc(date, 8, 'Asia/Kolkata');
    db.prepare(`INSERT INTO budget_history(user_id,budget_id,scope,category_id,month,action,old_amount_paise,new_amount_paise,created_at)
      VALUES(1,NULL,'daily_limit',NULL,NULL,'set',NULL,10000,?)`).run(setAt);
    app.locals.gameEngine.advanceRewards(1);
    expect(db.prepare('SELECT status,xp_awarded AS xpAwarded FROM user_missions WHERE id=?').get(missionId)).toMatchObject({ status: 'COMPLETED', xpAwarded: 5 });
    expect(db.prepare("SELECT lifetime_delta AS delta FROM xp_ledger WHERE user_id=1 AND entitlement_key=? AND entry_type='AWARD'").get(`MIS-004:${missionId}`).delta).toBe(5);
    expect(db.prepare("SELECT count(*) AS count FROM user_notices WHERE user_id=1 AND code='MISSION_COMPLETED'").get().count).toBe(1);
    const notice = db.prepare("SELECT data_json AS dataJson FROM user_notices WHERE user_id=1 AND code='MISSION_COMPLETED'").get();
    expect(JSON.parse(notice.dataJson)).toMatchObject({ slot: 'DAILY', templateId: 'dm_set_limit', xp: 5 });
  });
});
