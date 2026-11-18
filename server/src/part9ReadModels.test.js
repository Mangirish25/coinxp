import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

describe('Part 9 activity and notification preferences', () => {
  let db; let app; let cookie;
  beforeEach(async () => {
    db=createDatabase(':memory:'); migrateDatabase(db);
    app=createApp({db,config:{clientOrigin:'http://localhost:5173',nodeEnv:'test',jwtSecret:'test-only-secret-with-at-least-thirty-two-characters'},logger:{info(){},error(){}}});
    const user=await request(app).post('/api/auth/register').send({email:'readmodels@example.com',password:'securepass1',displayName:'Read Models'}).expect(201);
    cookie=user.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(()=>db.close());
  it('EVT-012: activity cursor paging is private and stable',async()=>{
    for(let i=1;i<=3;i++) db.prepare(`INSERT INTO activity_items(user_id,kind,occurred_at,summary_code,data_json,dedupe_key) VALUES(1,'BADGE',?,'BADGE_UNLOCKED','{}',?)`).run(`2026-11-0${i}T00:00:00.000Z`,`feed-${i}`);
    db.prepare(`INSERT INTO activity_items(user_id,kind,occurred_at,summary_code,data_json,dedupe_key) VALUES(1,'MISSION','2026-11-04T00:00:00.000Z','MISSION_COMPLETED','{}','mission-feed')`).run();
    const first=await request(app).get('/api/activity?pageSize=2&kinds=BADGE').set('Cookie',cookie).expect(200);
    expect(first.body.data).toHaveLength(2); expect(first.body.nextCursor).toBeTruthy();
    const second=await request(app).get(`/api/activity?pageSize=2&kinds=BADGE&cursor=${first.body.nextCursor}`).set('Cookie',cookie).expect(200);
    expect(second.body.data).toHaveLength(1); expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expect((await request(app).get('/api/activity?kinds=MISSION').set('Cookie',cookie).expect(200)).body.data).toHaveLength(1);
    await request(app).get('/api/activity?cursor=bad').set('Cookie',cookie).expect(400);
  });
  it('NOT-004: mutable preferences save, locked categories stay enabled, and writes are owner-scoped',async()=>{
    const initial=await request(app).get('/api/notifications/preferences').set('Cookie',cookie).expect(200);
    expect(initial.body.preferences.find(({category})=>category==='REVIEW')).toMatchObject({enabled:true,mutable:false});
    await request(app).put('/api/notifications/preferences').set('Cookie',cookie).send({preferences:[{category:'REWARD',enabled:false}]}).expect(200)
      .expect(({body})=>expect(body.preferences.find(({category})=>category==='REWARD').enabled).toBe(false));
    await request(app).put('/api/notifications/preferences').set('Cookie',cookie).send({preferences:[{category:'REVIEW',enabled:false}]}).expect(422);
    expect(db.prepare('SELECT count(*) AS n FROM notification_preferences WHERE user_id=1').get().n).toBe(1);
  });
});
