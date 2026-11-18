import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/connection.js';
import { migrateDatabase } from '../../db/migrator.js';

describe('CR-10 and Part 9 reward storage', () => {
  let db;
  afterEach(() => db?.close());

  it('supports reward notice kinds and progression-only holds', () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const now = new Date().toISOString();
    const userId = Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,created_at,updated_at)
      VALUES('reward-schema@example.com','hash','Rewards',?,?)`).run(now, now).lastInsertRowid);
    const caseId = Number(db.prepare(`INSERT INTO integrity_cases(user_id,status,risk_score,distinct_codes,opened_at)
      VALUES(?,'IN_REVIEW',0,0,?)`).run(userId, now).lastInsertRowid);
    expect(() => db.prepare(`INSERT INTO user_notices(user_id,kind,code,dedupe_key,created_at)
      VALUES(?,'REWARD','BADGE_UNLOCKED','badge:one',?)`).run(userId, now)).not.toThrow();
    expect(() => db.prepare(`INSERT INTO reward_holds(user_id,case_id,scope,status,auto,starts_at,ends_at,created_at)
      VALUES(?,?,'PROGRESSION_XP','ACTIVE',0,?,?,?)`).run(userId, caseId, now, now, now)).not.toThrow();
  });

  it('enforces balance-only, non-zero SPEND entries at the database boundary', () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const now = new Date().toISOString();
    const userId = Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,created_at,updated_at)
      VALUES('spend-schema@example.com','hash','Spend',?,?)`).run(now, now).lastInsertRowid);
    const insert = db.prepare(`INSERT INTO xp_ledger(user_id,entry_type,idempotency_key,lifetime_delta,balance_delta,period_type,period_key,
      reason_code,config_version,actor,created_at) VALUES(?,'SPEND',?, ?,?,'once','PURCHASE','PURCHASE_THEME','0.1.0','test',?)`);
    expect(() => insert.run(userId, 'spend-ok', 0, -10, now)).not.toThrow();
    expect(() => insert.run(userId, 'spend-lifetime', 10, -10, now)).toThrow(/balance-only/);
    expect(() => insert.run(userId, 'spend-zero', 0, 0, now)).toThrow(/balance-only/);
  });
});
