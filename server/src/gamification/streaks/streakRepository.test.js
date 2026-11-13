import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../db/connection.js';
import { migrateDatabase } from '../../db/migrator.js';
import { createFreezeRepository } from './freezeRepository.js';
import { createStreakRepository } from './streakRepository.js';

describe('STR-003 streak persistence', () => {
  let db;
  afterEach(() => db?.close());

  it('keeps users isolated and reads freeze supply as of a cutoff', () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const userId = Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,created_at,updated_at)
      VALUES('streak@example.com','hash','Streak','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`).run().lastInsertRowid);
    const freezes = createFreezeRepository(db);
    const base = { userId, effectiveLocalDate: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z', actor: 'engine' };
    freezes.insert({ ...base, delta: 1, reason: 'STARTER', effectiveAt: '2026-01-01T00:00:00.000Z', idempotencyKey: 'STARTER' });
    freezes.insert({ ...base, delta: -1, reason: 'USED', effectiveAt: '2026-01-03T04:00:00.000Z', periodKey: '2026-01-02', idempotencyKey: 'FRZ:USE:2026-01-02' });
    expect(freezes.inventoryAsOf(userId, '2026-01-02T23:59:59.999Z')).toBe(1);
    expect(freezes.inventoryAsOf(userId, '2026-01-03T04:00:00.000Z')).toBe(0);
    expect(() => db.prepare('UPDATE freeze_ledger SET delta=0 WHERE id=1').run()).toThrow(/append-only/);
  });

  it('creates state lazily and records one immutable period per date', () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const userId = Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,created_at,updated_at)
      VALUES('state@example.com','hash','State','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`).run().lastInsertRowid);
    const streaks = createStreakRepository(db);
    expect(streaks.ensureState(userId, 'TRACKING_DAILY', '2026-01-01T00:00:00.000Z').status).toBe('NONE');
    expect(streaks.insertPeriod({ userId, streakType: 'TRACKING_DAILY', periodKey: '2026-01-01', status: 'COUNTED', reasonCode: 'XP_TRACKED', processedAt: '2026-01-02T00:00:00.000Z' })).toBe(true);
    expect(streaks.insertPeriod({ userId, streakType: 'TRACKING_DAILY', periodKey: '2026-01-01', status: 'MISSED', reasonCode: 'UNTRACKED', processedAt: '2026-01-03T00:00:00.000Z' })).toBe(false);
  });
});
