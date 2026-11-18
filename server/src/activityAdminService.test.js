import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { createActivityAdminService } from './services/activityAdminService.js';

describe('EVT-012 activity backfill',()=>{
  let db;
  afterEach(()=>db?.close());
  it('is dry-run by default, idempotent on apply, and audited with actor and note',()=>{
    db=createDatabase(':memory:');migrateDatabase(db);
    const at='2026-11-18T10:00:00.000Z';
    const userId=Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,created_at,updated_at) VALUES('activity@example.com','hash','Activity User',?,?)`).run(at,at).lastInsertRowid);
    const event={eventId:'event-badge-1',eventType:'BADGE_UNLOCKED',userId,occurredAt:at,data:{slug:'first_step',tier:1,rarity:'COMMON',xpAwarded:10}};
    db.prepare(`INSERT INTO domain_events(event_id,event_type,user_id,payload_json,schema_version,occurred_at,status,dedupe_key)
      VALUES(?,?,?,?,1,?,'PUBLISHED','BADGE:1:first_step:1')`).run(event.eventId,event.eventType,userId,JSON.stringify(event),at);
    const service=createActivityAdminService({db,clock:{now:()=>new Date(at)}});const input={userId,actor:'operator',note:'Rebuild missing activity rows from canonical records.'};
    expect(service.backfill(input).counts.events).toBe(1);
    expect(db.prepare('SELECT count(*) AS n FROM activity_items WHERE user_id=?').get(userId).n).toBe(0);
    expect(service.backfill(input,{apply:true}).inserted).toBe(1);
    expect(service.backfill(input,{apply:true}).inserted).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM activity_backfill_runs WHERE user_id=? AND actor=? AND note=?').get(userId,'operator',input.note).n).toBe(2);
    expect(db.prepare('SELECT summary_code AS code FROM activity_items WHERE user_id=?').get(userId).code).toBe('BADGE_UNLOCKED');
  });
});
