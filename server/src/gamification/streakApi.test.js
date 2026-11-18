import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDatabase } from '../db/connection.js';
import { migrateDatabase } from '../db/migrator.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';

describe('Part 7 streak API', () => {
  let db;
  let app;
  let cookie;
  beforeEach(async () => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    const clock = { now: () => new Date('2026-11-13T12:00:00.000Z') };
    app = createApp({ db, clock, config: { clientOrigin: 'http://localhost:5173', nodeEnv: 'test', jwtSecret: secret }, logger: { info() {}, error() {} } });
    const result = await request(app).post('/api/auth/register')
      .send({ email: 'streak-api@example.com', password: 'securepass1', displayName: 'Streak API', timezone: 'UTC' }).expect(201);
    cookie = result.headers['set-cookie'][0].split(';')[0];
  });
  afterEach(() => db.close());

  it('requires auth and returns an empty, user-scoped initial state without creating old periods', async () => {
    await request(app).get('/api/streaks').expect(401);
    const response = await request(app).get('/api/streaks').set('Cookie', cookie).expect(200);
    expect(response.body.tracking).toMatchObject({ status: 'NONE', current: 0, longest: 0, trackedToday: false });
    expect(response.body.freezes).toMatchObject({ inventory: 0, cap: 2 });
    expect(response.body.week).toHaveLength(7);
    expect(response.body.week[0].date).toBe('2026-11-09');
    expect(response.body.week[6].date).toBe('2026-11-15');
    expect(response.body).toMatchObject({ lastPeriod: { date: response.body.through, status: 'NONE' }, milestones: { reached: [], next: { days: 3, xp: 10 } } });
    expect(db.prepare('SELECT count(*) AS count FROM streak_periods').get().count).toBe(0);
  });

  it('serves calendar and freeze ledger and validates the configured calendar range cap', async () => {
    const date = '2026-11-13';
    const calendar = await request(app).get(`/api/streaks/tracking/calendar?from=${date}&to=${date}`).set('Cookie', cookie).expect(200);
    expect(calendar.body.days).toHaveLength(1);
    expect(calendar.body.days[0]).toMatchObject({ date, status: 'TODAY_OPEN' });
    await request(app).get('/api/streaks/freezes').set('Cookie', cookie).expect(200);
    await request(app).get('/api/streaks/tracking/calendar?from=2025-01-01&to=2026-01-02').set('Cookie', cookie).expect(400);
    await request(app).get('/api/streaks/rules').set('Cookie', cookie).expect(200);
  });

  it('handles parallel summary requests without duplicating periods or milestone XP', async () => {
    const userId = db.prepare('SELECT id FROM users WHERE email=?').get('streak-api@example.com').id;
    db.prepare('UPDATE user_progress SET gamification_start_date=? WHERE user_id=?').run('2026-11-01', userId);
    for (const date of ['2026-11-10', '2026-11-11', '2026-11-12']) {
      db.prepare(`INSERT INTO settlements(user_id,period_type,period_key,outcome,reason_code,details_json,settled_at,rule_version)
        VALUES(?,'day',?,'INELIGIBLE','TRACKING_ONLY',?,'2026-11-13T00:00:00.000Z','0.1.0')`)
        .run(userId, date, JSON.stringify({ xpTracked: true, noSpendDeclared: false }));
    }
    const results = await Promise.all(Array.from({ length: 20 }, () => request(app).get('/api/streaks').set('Cookie', cookie).expect(200)));
    expect(results.every((result) => result.body.tracking.current === 3)).toBe(true);
    expect(db.prepare("SELECT count(*) AS count FROM streak_periods WHERE user_id=? AND streak_type='TRACKING_DAILY' AND status='COUNTED'").get(userId).count).toBe(3);
    expect(db.prepare("SELECT count(*) AS count FROM xp_ledger WHERE user_id=? AND rule_id='STR-006'").get(userId).count).toBe(1);
    const milestone = db.prepare("SELECT data_json AS dataJson FROM user_notices WHERE user_id=? AND code='STREAK_MILESTONE'").get(userId);
    expect(JSON.parse(milestone.dataJson)).toMatchObject({ milestone: 3, length: 3, xp: 10 });
    expect(db.prepare("SELECT count(*) AS count FROM user_notices WHERE user_id=? AND code='STREAK_MILESTONE'").get(userId).count).toBe(1);
    app.locals.gameEngine.advanceRewards(userId);
    const recap = db.prepare("SELECT data_json AS dataJson FROM user_notices WHERE user_id=? AND code='DAY_RECAP' AND data_json LIKE '%2026-11-12%' ").get(userId);
    expect(JSON.parse(recap.dataJson)).toMatchObject({ date: '2026-11-12', xpDelta: 10, streakBefore: 2, streakAfter: 3, streakStatus: 'COUNTED', entries: [{ ruleId: 'STR-006', delta: 10 }] });
    app.locals.gameEngine.advanceRewards(userId);
    expect(db.prepare("SELECT count(*) AS count FROM user_notices WHERE user_id=? AND code='DAY_RECAP'").get(userId).count).toBe(3);
  });
});
