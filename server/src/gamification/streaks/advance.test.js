import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/connection.js';
import { migrateDatabase } from '../../db/migrator.js';
import { createGamificationEngine } from '../engine.js';
import { createStreakAdvancer } from './advance.js';

describe('STR-003 date-driven advancement', () => {
  let db;
  afterEach(() => db?.close());

  it('advances sealed XP-tracked dates once and awards a milestone entitlement once', () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const now = new Date('2026-01-06T12:00:00.000Z');
    const clock = { now: () => new Date(now) };
    const userId = Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,timezone,created_at,updated_at)
      VALUES('advance@example.com','hash','Advance','UTC','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`).run().lastInsertRowid);
    for (let day = 1; day <= 5; day += 1) {
      const date = `2026-01-0${day}`;
      db.prepare(`INSERT INTO settlements(user_id,period_type,period_key,outcome,reason_code,details_json,settled_at,rule_version)
        VALUES(?,'day',?,'INELIGIBLE','TRACKING_ONLY',?,'2026-01-06T00:00:00.000Z','0.1.0')`)
        .run(userId, date, JSON.stringify({ xpTracked: day <= 3, noSpendDeclared: false }));
    }
    const gameEngine = createGamificationEngine({ db, clock });
    const advancer = createStreakAdvancer({ db, gameEngine, clock });
    const first = advancer.advanceUser(userId);
    expect(first.tracking).toMatchObject({ status: 'BROKEN', currentLength: 0, longestLength: 3 });
    expect(db.prepare("SELECT count(*) AS count FROM streak_periods WHERE user_id=? AND streak_type='TRACKING_DAILY'").get(userId).count).toBe(5);
    expect(db.prepare("SELECT status FROM streak_periods WHERE user_id=? AND streak_type='TRACKING_DAILY' AND period_key='2026-01-04'").get(userId).status).toBe('FROZEN');
    expect(db.prepare("SELECT count(*) AS count FROM xp_ledger WHERE user_id=? AND rule_id='STR-006'").get(userId).count).toBe(1);
    advancer.advanceUser(userId);
    expect(db.prepare("SELECT count(*) AS count FROM xp_ledger WHERE user_id=? AND rule_id='STR-006'").get(userId).count).toBe(1);
    expect(db.prepare("SELECT count(*) AS count FROM domain_events WHERE user_id=? AND event_type='STREAK_MILESTONE_REACHED' AND status='PUBLISHED'").get(userId).count).toBe(1);
  });
});
