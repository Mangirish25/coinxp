import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { migrateDatabase } from '../db/migrator.js';
import { createTimezoneChangeRepository } from './timezoneChangeRepository.js';

describe('STR-008 timezone history', () => {
  let db;
  afterEach(() => db?.close());

  it('persists skipped date labels and returns only the owner’s changes', () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const userId = Number(db.prepare(`INSERT INTO users(email,password_hash,display_name,created_at,updated_at)
      VALUES('zones@example.com','hash','Zones','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`).run().lastInsertRowid);
    const changes = createTimezoneChangeRepository(db);
    changes.insert({ userId, changedAt: '2026-01-03T00:00:00.000Z', oldTimezone: 'Pacific/Honolulu', newTimezone: 'Pacific/Kiritimati',
      oldLocalDate: '2026-01-02', newLocalDate: '2026-01-04', skippedDates: ['2026-01-03'] });
    expect(changes.list(userId)[0].skippedDates).toEqual(['2026-01-03']);
    expect(changes.countSkippedSince(userId, '2026-01-01T00:00:00.000Z')).toBe(1);
    expect(() => db.prepare('DELETE FROM timezone_changes WHERE user_id=?').run(userId)).toThrow(/append-only/);
  });
});
