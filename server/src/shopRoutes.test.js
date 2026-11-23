import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { createShopAdminService } from './services/shopAdminService.js';

describe('Part 9 XP shop and CR-10/11', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:'); migrateDatabase(db);
    app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: 'test-only-secret-with-at-least-thirty-two-characters' }, logger: { info() {}, error() {} } });
    const response = await request(app).post('/api/auth/register').send({ email: 'shop@example.com', password: 'securepass1', displayName: 'Shop User' }).expect(201);
    cookie = response.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  function addXp(amount) {
    app.locals.gameEngine.adjust({ userId: 1, delta: amount, reason: 'Test balance for shop purchase.', actor: 'test' });
  }

  it('XP-013: spends balance atomically, leaves lifetime and level unchanged, and replays idempotently', async () => {
    addXp(1000);
    await request(app).post('/api/shop/purchase').set('Cookie', cookie).send({ itemSlug: 'theme_forest' }).expect(400);
    const first = await request(app).post('/api/shop/purchase').set('Cookie', cookie).set('Idempotency-Key', 'theme-forest-1')
      .send({ itemSlug: 'theme_forest' }).expect(201);
    expect(first.body).toMatchObject({ itemSlug: 'theme_forest', costXp: 200, spendableXp: 800, lifetimeXp: 1000, level: 5 });
    const replay = await request(app).post('/api/shop/purchase').set('Cookie', cookie).set('Idempotency-Key', 'theme-forest-1')
      .send({ itemSlug: 'theme_forest' }).expect(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(db.prepare("SELECT lifetime_delta AS lifetimeDelta,balance_delta AS balanceDelta FROM xp_ledger WHERE entry_type='SPEND'").get())
      .toMatchObject({ lifetimeDelta: 0, balanceDelta: -200 });
    expect(db.prepare('SELECT lifetime_xp AS lifetimeXp,spendable_xp AS spendableXp,max_level_reached AS level FROM user_progress WHERE user_id=1').get())
      .toMatchObject({ lifetimeXp: 1000, spendableXp: 800, level: 5 });
    expect(db.prepare('SELECT count(*) AS count FROM purchases WHERE user_id=1').get().count).toBe(1);
    const notice = db.prepare("SELECT data_json AS dataJson FROM user_notices WHERE user_id=1 AND code='PURCHASE_COMPLETED'").get();
    expect(JSON.parse(notice.dataJson)).toMatchObject({ itemSlug: 'theme_forest', type: 'THEME', costXp: 200 });
  });

  it('CR-11: rolls back an XP spend when the freeze inventory is full', async () => {
    addXp(300);
    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    db.prepare(`INSERT INTO freeze_ledger(user_id,delta,reason,effective_at,effective_local_date,idempotency_key,actor,created_at)
      VALUES(1,1,'STARTER',?,?,?,'test',?),(1,1,'REGEN',?,?,?,'test',?)`)
      .run(now,date,'starter-seed',now,now,date,'regen-seed',now);
    await request(app).post('/api/shop/purchase').set('Cookie', cookie).set('Idempotency-Key', 'freeze-full-1')
      .send({ itemSlug: 'freeze' }).expect(409).expect(({ body }) => expect(body.error.code).toBe('FREEZE_INVENTORY_FULL'));
    expect(db.prepare('SELECT spendable_xp AS xp FROM user_progress WHERE user_id=1').get().xp).toBe(300);
    expect(db.prepare('SELECT count(*) AS count FROM purchases WHERE user_id=1').get().count).toBe(0);
    expect(db.prepare("SELECT count(*) AS count FROM xp_ledger WHERE entry_type='SPEND'").get().count).toBe(0);
  });

  it('XP-013: dry-run-first admin refund reverses a cosmetic purchase exactly once',async()=>{
    addXp(1000);
    const purchased=await request(app).post('/api/shop/purchase').set('Cookie',cookie).set('Idempotency-Key','refund-theme-1').send({itemSlug:'theme_forest'}).expect(201);
    await request(app).post('/api/profile/equip').set('Cookie',cookie).send({slot:'THEME',itemSlug:'theme_forest'}).expect(200);
    const admin=createShopAdminService({db,gameEngine:app.locals.gameEngine});
    const input={actor:'reviewer',note:'Reviewed the customer request and approved this refund.'};
    expect(admin.refund(purchased.body.id,input).dryRun).toBe(true);
    expect(admin.refund(purchased.body.id,input,{apply:true})).toMatchObject({applied:true,refundXp:200,spendableXp:1000});
    expect(admin.refund(purchased.body.id,input,{apply:true}).idempotent).toBe(true);
    expect(db.prepare('SELECT count(*) AS n FROM user_cosmetics WHERE user_id=1 AND item_slug=\'theme_forest\'').get().n).toBe(0);
    expect(db.prepare('SELECT equipped_theme FROM user_profile WHERE user_id=1').get().equipped_theme).toBeNull();
    expect(db.prepare("SELECT count(*) AS n FROM xp_ledger WHERE entry_type='SPEND' AND reverses_entry_id IS NOT NULL").get().n).toBe(1);
  });
});
