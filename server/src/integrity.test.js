import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { todayInTimezone } from './utils/dates.js';
import { createIntegrityAdminService } from './services/integrityAdminService.js';

describe('Part 8 integrity transparency API', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config:{ clientOrigin:'http://localhost:5173',nodeEnv:'test',jwtSecret:'test-only-secret-with-at-least-thirty-two-characters' }, logger:{info(){},error(){}} });
    const response = await request(app).post('/api/auth/register').send({email:'integrity@example.com',password:'securepass1',displayName:'Integrity User'}).expect(201);
    cookie = response.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('NOT-003: lists localized notice copy and acknowledges monotonically', async () => {
    db.prepare(`INSERT INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at) VALUES(1,'REVIEW','APPEAL_RECEIVED','{}','appeal:1',?)`).run(new Date().toISOString());
    const list = await request(app).get('/api/integrity/notices?unreadOnly=true').set('Cookie',cookie).expect(200);
    expect(list.body.data[0]).toMatchObject({code:'APPEAL_RECEIVED',message:'Your appeal has been received for review.'});
    await request(app).post('/api/integrity/notices/ack').set('Cookie',cookie).send({upToId:list.body.data[0].id}).expect(200);
    expect((await request(app).get('/api/integrity/status').set('Cookie',cookie)).body.unreadNotices).toBe(0);
  });

  it('ABU-012: accepts one appeal for an eligible active hold', async () => {
    const now = new Date().toISOString();
    const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const caseId = Number(db.prepare(`INSERT INTO integrity_cases(user_id,status,risk_score,distinct_codes,opened_at) VALUES(1,'IN_REVIEW',12,2,?)`).run(now).lastInsertRowid);
    db.prepare(`INSERT INTO reward_holds(user_id,case_id,scope,status,auto,starts_at,ends_at,created_at) VALUES(1,?,'OUTCOME_XP','ACTIVE',1,?,?,?)`).run(caseId,now,end,now);
    expect((await request(app).get('/api/integrity/status').set('Cookie',cookie)).body).toMatchObject({holdActive:true,scope:'OUTCOME_XP',canAppeal:true});
    await request(app).post('/api/integrity/appeals').set('Cookie',cookie).send({message:'Please review this hold.'}).expect(201);
    await request(app).post('/api/integrity/appeals').set('Cookie',cookie).send({message:'Please review this hold.'}).expect(409);
    expect(db.prepare('SELECT action FROM case_actions WHERE case_id=?').get(caseId).action).toBe('APPEAL');
  });

  it('ABU-009/010: requires two distinct signals and starts an outcome-only hold', async () => {
    db.prepare('UPDATE users SET created_at=? WHERE id=1').run('2026-09-01T00:00:00.000Z');
    const engine = app.locals.gameEngine;
    for (const day of ['2026-11-10','2026-11-11']) engine.recordIntegritySignal(1,'LIMIT_RESCUE_PATTERN',day,{dates:[day],ids:[1]});
    expect((await request(app).get('/api/integrity/status').set('Cookie',cookie)).body.holdActive).toBe(false);
    engine.recordIntegritySignal(1,'MICRO_ENTRY_PATTERN','2026-11-12',{dates:['2026-11-12'],ids:[2]});
    engine.recordIntegritySignal(1,'MICRO_ENTRY_PATTERN','2026-11-13',{dates:['2026-11-13'],ids:[3]});
    expect((await request(app).get('/api/integrity/status').set('Cookie',cookie)).body).toMatchObject({holdActive:true,scope:'OUTCOME_XP'});
    expect(db.prepare("SELECT count(*) AS count FROM integrity_cases WHERE user_id=1 AND status='IN_REVIEW'").get().count).toBe(1);
    expect(db.prepare("SELECT count(*) AS count FROM reward_holds WHERE user_id=1 AND auto=1 AND scope='OUTCOME_XP'").get().count).toBe(1);
  });

  it('BUD-003: emits a deduplicated local-day warning at the configured threshold', async () => {
    db.prepare(`INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,'Food','expense',1,?)`).run(new Date().toISOString());
    const categoryId=db.prepare("SELECT id FROM categories WHERE name='Food'").get().id;
    const date=todayInTimezone('Asia/Kolkata');
    await request(app).put('/api/budgets').set('Cookie',cookie).send({scope:'daily_limit',amount:'100'}).expect(200);
    await request(app).post('/api/transactions').set('Cookie',cookie).send({type:'expense',amount:'80',categoryId,transactionDate:date}).expect(201);
    let row=db.prepare("SELECT count(*) AS count FROM user_notices WHERE user_id=1 AND code='BUDGET_DAILY_NEAR'").get();
    expect(row.count).toBe(1);
    await request(app).post('/api/transactions').set('Cookie',cookie).send({type:'expense',amount:'1',categoryId,transactionDate:date}).expect(201);
    row=db.prepare("SELECT count(*) AS count FROM user_notices WHERE user_id=1 AND code='BUDGET_DAILY_NEAR'").get();
    expect(row.count).toBe(1);
  });

  it('ABU-011/DEL-006: records an audited case dismissal and makes a repeated resolution a no-op', () => {
    const now=new Date().toISOString();
    const caseId=Number(db.prepare(`INSERT INTO integrity_cases(user_id,status,risk_score,distinct_codes,opened_at) VALUES(1,'IN_REVIEW',8,1,?)`).run(now).lastInsertRowid);
    db.prepare(`INSERT INTO gamification_flags(user_id,code,local_date,details_json,created_at,severity_points,evidence_json,detector_version,dedupe_key,case_id)
      VALUES(1,'HIGH_EDIT_CHURN','2026-11-10','{}',?,2,'{}','1.0.0','admin-test-flag',?)`).run(now,caseId);
    db.prepare(`INSERT INTO reward_holds(user_id,case_id,scope,status,auto,starts_at,ends_at,created_at) VALUES(1,?,'OUTCOME_XP','ACTIVE',1,?,?,?)`)
      .run(caseId,now,new Date(Date.now()+86400000).toISOString(),now);
    const admin=createIntegrityAdminService({db,clock:{now:()=>new Date()}});
    const input={caseId,action:'DISMISS',actor:'reviewer',note:'Reviewed evidence and cleared the case.'};
    expect(admin.applyCaseAction(input)).toMatchObject({applied:true,action:'DISMISS'});
    expect(admin.applyCaseAction(input)).toMatchObject({applied:false,action:'DISMISS'});
    expect(db.prepare('SELECT status,resolution FROM integrity_cases WHERE id=?').get(caseId)).toMatchObject({status:'RESOLVED',resolution:'DISMISSED'});
    expect(db.prepare('SELECT status FROM gamification_flags WHERE case_id=?').get(caseId).status).toBe('DISMISSED');
    expect(db.prepare('SELECT status FROM reward_holds WHERE case_id=?').get(caseId).status).toBe('RELEASED');
    expect(db.prepare("SELECT count(*) AS count FROM case_actions WHERE case_id=? AND action='DISMISS'").get(caseId).count).toBe(1);
    expect(() => db.prepare('DELETE FROM case_actions WHERE case_id=?').run(caseId)).toThrow(/append-only/);
  });

  it('XP-012/CR-9: applies a bounded, case-linked clawback and locks the entitlement', async () => {
    db.prepare(`INSERT INTO categories(user_id,name,type,is_default,created_at) VALUES(NULL,'Food','expense',1,?)`).run(new Date().toISOString());
    const categoryId=db.prepare("SELECT id FROM categories WHERE name='Food'").get().id;
    const date=todayInTimezone('Asia/Kolkata');
    await request(app).post('/api/transactions').set('Cookie',cookie).send({type:'expense',amount:'25',categoryId,transactionDate:date}).expect(201);
    const award=db.prepare("SELECT id FROM xp_ledger WHERE user_id=1 AND rule_id='XP-001' AND entry_type='AWARD'").get();
    const now=new Date().toISOString();
    const caseId=Number(db.prepare(`INSERT INTO integrity_cases(user_id,status,risk_score,distinct_codes,opened_at) VALUES(1,'IN_REVIEW',8,2,?)`).run(now).lastInsertRowid);
    const admin=createIntegrityAdminService({db,engine:app.locals.gameEngine});
    expect(()=>app.locals.gameEngine.adjust({userId:1,delta:-1,reason:'A sufficiently long admin note.',actor:'reviewer'})).toThrow(/case/i);
    const input={caseId,action:'CLAWBACK',entryIds:[award.id],actor:'reviewer',note:'Reviewed evidence; tracking award was not earned.'};
    expect(admin.applyCaseAction(input)).toMatchObject({applied:true,removedXp:10});
    expect(admin.applyCaseAction(input)).toMatchObject({applied:false,action:'CLAWBACK'});
    expect(db.prepare('SELECT lifetime_xp AS lifetimeXp FROM user_progress WHERE user_id=1').get().lifetimeXp).toBe(25);
    expect(db.prepare("SELECT reason,case_id AS caseId FROM entitlement_locks WHERE entitlement_key LIKE 'XP-001:%'").get()).toMatchObject({reason:'CLAWBACK',caseId});
    expect(db.prepare("SELECT reason_code AS reasonCode FROM xp_ledger WHERE reason_code='INTEGRITY_CLAWBACK'").get().reasonCode).toBe('INTEGRITY_CLAWBACK');
    expect(db.prepare("SELECT count(*) AS count FROM user_notices WHERE user_id=1 AND code='CLAWBACK_APPLIED'").get().count).toBe(1);
  });
});
