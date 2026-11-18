import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { todayInTimezone } from './utils/dates.js';
import { createBadgeAdminService } from './services/badgeAdminService.js';

describe('Part 9 BAD-003 badge API', () => {
  let db; let app; let cookie; let categoryId;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    db.prepare(`INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,'Food','expense',1,?)`).run(new Date().toISOString());
    categoryId = db.prepare("SELECT id FROM categories WHERE name='Food'").get().id;
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-only-secret-with-at-least-thirty-two-characters' }, logger: { info() {}, error() {} } });
    const registered = await request(app).post('/api/auth/register').send({ email: 'badge@example.com', password: 'securepass1', displayName: 'Badge User' }).expect(201);
    cookie = registered.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('requires authentication and returns only the owner badge progress', async () => {
    await request(app).get('/api/badges').expect(401);
    const other = await request(app).post('/api/auth/register').send({ email: 'other-badge@example.com', password: 'securepass1', displayName: 'Other User' }).expect(201);
    const otherCookie = other.headers['set-cookie'][0].split(';')[0];
    await request(app).post('/api/transactions').set('Cookie', cookie).send({ type: 'expense', amount: '15', categoryId, transactionDate: todayInTimezone('Asia/Kolkata') }).expect(201);
    const owner = await request(app).get('/api/badges').set('Cookie', cookie).expect(200);
    const stranger = await request(app).get('/api/badges').set('Cookie', otherCookie).expect(200);
    expect(owner.body.data.find(({ slug }) => slug === 'first_step').tiers[0]).toMatchObject({ status: 'ACTIVE', achievedOn: todayInTimezone('Asia/Kolkata') });
    expect(stranger.body.data.find(({ slug }) => slug === 'first_step').tiers[0].status).toBe('LOCKED');
    expect(owner.body.hiddenRemaining).toBeGreaterThan(0);
  });

  it('BAD-003: unlocks the first transaction badge once and keeps it latched after deletion', async () => {
    const date = todayInTimezone('Asia/Kolkata');
    const transaction = await request(app).post('/api/transactions').set('Cookie', cookie)
      .send({ type: 'expense', amount: '15', categoryId, transactionDate: date }).expect(201);
    await request(app).post('/api/transactions').set('Cookie', cookie).set('Idempotency-Key', 'badge-repeat')
      .send({ type: 'expense', amount: '15', categoryId, transactionDate: date }).expect(201);
    expect(db.prepare("SELECT count(*) AS count FROM xp_ledger WHERE user_id=1 AND entitlement_key='BAD-003:first_step:1' AND entry_type='AWARD'").get().count).toBe(1);
    await request(app).delete(`/api/transactions/${transaction.body.id}`).set('Cookie', cookie).send({}).expect(204);
    const badges = await request(app).get('/api/badges').set('Cookie', cookie).expect(200);
    expect(badges.body.data.find(({ slug }) => slug === 'first_step').tiers[0].status).toBe('ACTIVE');
  });

  it('BAD-007: case-linked revocation reverses XP once and locks the tier', async () => {
    await request(app).post('/api/transactions').set('Cookie',cookie).send({type:'expense',amount:'15',categoryId,transactionDate:todayInTimezone('Asia/Kolkata')}).expect(201);
    const caseId=Number(db.prepare(`INSERT INTO integrity_cases(user_id,status,risk_score,distinct_codes,opened_at) VALUES(1,'IN_REVIEW',10,2,?)`).run(new Date().toISOString()).lastInsertRowid);
    const service=createBadgeAdminService({db,gameEngine:app.locals.gameEngine});
    const input={userId:1,slug:'first_step',tier:1,caseId,actor:'reviewer',note:'Reviewed evidence and approved badge revocation.'};
    expect(service.revoke(input).dryRun).toBe(true);
    expect(service.revoke(input,{apply:true})).toMatchObject({applied:true,xpReversal:-10,badge:{status:'REVOKED'}});
    expect(service.revoke(input,{apply:true}).idempotent).toBe(true);
    expect(db.prepare(`SELECT count(*) AS n FROM xp_ledger WHERE user_id=1 AND entitlement_key='BAD-003:first_step:1' AND entry_type='REVERSAL'`).get().n).toBe(1);
    expect(db.prepare(`SELECT count(*) AS n FROM entitlement_locks WHERE user_id=1 AND entitlement_key='BAD-003:first_step:1'`).get().n).toBe(1);
    app.locals.gameEngine.evaluateBadges(1,'first_step');
    expect(db.prepare(`SELECT status FROM user_badges WHERE user_id=1 AND badge_slug='first_step' AND tier=1`).get().status).toBe('REVOKED');
    const restoration={userId:1,slug:'first_step',tier:1,actor:'reviewer',note:'Review completed and badge eligibility confirmed.'};
    expect(service.restore(restoration).dryRun).toBe(true);
    expect(service.restore(restoration,{apply:true})).toMatchObject({applied:true,xpRestored:10,badge:{status:'ACTIVE'}});
    expect(service.restore(restoration,{apply:true}).idempotent).toBe(true);
    expect(db.prepare(`SELECT count(*) AS n FROM xp_ledger WHERE user_id=1 AND entitlement_key='BAD-003:first_step:1' AND entry_type='AWARD'`).get().n).toBe(1);
    expect(db.prepare(`SELECT count(*) AS n FROM entitlement_locks WHERE user_id=1 AND entitlement_key='BAD-003:first_step:1'`).get().n).toBe(0);
    expect(db.prepare(`SELECT count(*) AS n FROM case_actions WHERE case_id=? AND action='NOTE'`).get(caseId).n).toBe(2);
    expect(db.prepare(`SELECT count(*) AS n FROM user_notices WHERE user_id=1 AND code='BADGE_RESTORED'`).get().n).toBe(1);
  });
});
