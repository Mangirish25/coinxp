function count(db, sql, ...params) {
  return db.prepare(sql).get(...params).count;
}

export function createRewardRepository(db) {
  function activeKey(userId, key) {
    const row = db.prepare(`SELECT entry_type AS entryType FROM xp_ledger WHERE user_id=? AND entitlement_key=?
      ORDER BY transition_no DESC LIMIT 1`).get(userId, key);
    return row?.entryType === 'AWARD' || row?.entryType === 'REINSTATE';
  }

  return {
    badgeMetric(userId, metric) {
      switch (metric) {
        case 'FIRST_LIVE_TX':
          return activeKey(userId, 'XP-006:FIRST_TRANSACTION') ? 1 : 0;
        case 'REVIEWS_COMPLETED':
          return count(db, 'SELECT count(*) AS count FROM daily_reviews WHERE user_id=? AND xp_eligible=1', userId);
        case 'XP_TRACKED_DAYS':
          return count(db, `SELECT count(*) AS count FROM settlements WHERE user_id=? AND period_type='day'
            AND json_extract(details_json,'$.xpTracked')=1`, userId);
        case 'LONGEST_TRACKING_STREAK':
          return db.prepare(`SELECT longest_length AS count FROM streak_state WHERE user_id=? AND streak_type='TRACKING_DAILY'`)
            .get(userId)?.count ?? 0;
        case 'LONGEST_WEEKLY_STREAK':
          return db.prepare(`SELECT longest_length AS count FROM streak_state WHERE user_id=? AND streak_type='CONSISTENCY_WEEKLY'`)
            .get(userId)?.count ?? 0;
        case 'COUNTED_BUDGET_DAYS':
          return count(db, `SELECT count(*) AS count FROM settlements s WHERE s.user_id=? AND s.period_type='day' AND s.outcome='PASS'
            AND EXISTS(SELECT 1 FROM xp_ledger l WHERE l.user_id=s.user_id AND l.entitlement_key='XP-003:'||s.period_key
              AND l.transition_no=(SELECT max(latest.transition_no) FROM xp_ledger latest WHERE latest.user_id=l.user_id AND latest.entitlement_key=l.entitlement_key)
              AND l.entry_type IN ('AWARD','REINSTATE'))`, userId);
        case 'COUNTED_BUDGET_MONTHS':
          return count(db, `SELECT count(*) AS count FROM settlements s WHERE s.user_id=? AND s.period_type='month' AND s.outcome='PASS'
            AND EXISTS(SELECT 1 FROM xp_ledger l WHERE l.user_id=s.user_id AND l.entitlement_key='XP-005:'||s.period_key
              AND l.transition_no=(SELECT max(latest.transition_no) FROM xp_ledger latest WHERE latest.user_id=l.user_id AND latest.entitlement_key=l.entitlement_key)
              AND l.entry_type IN ('AWARD','REINSTATE'))`, userId);
        case 'PLANNER':
          return count(db, `SELECT count(DISTINCT scope) AS count FROM budget_history WHERE user_id=?
            AND action IN ('set','update') AND scope IN ('monthly_total','daily_limit','category_monthly')`, userId) === 3 ? 1 : 0;
        case 'FULL_WEEK':
          return count(db, `SELECT count(*) AS count FROM settlements WHERE user_id=? AND period_type='week'
            AND json_extract(details_json,'$.xpTrackedDays')=7`, userId);
        case 'LEVEL':
          return db.prepare('SELECT max_level_reached AS count FROM user_progress WHERE user_id=?').get(userId)?.count ?? 1;
        case 'CHALLENGES_COMPLETED':
          return count(db, `SELECT count(*) AS count FROM challenge_runs c WHERE c.user_id=? AND c.status='COMPLETED'
            AND NOT EXISTS(SELECT 1 FROM challenge_runs prior WHERE prior.user_id=c.user_id AND prior.challenge_slug=c.challenge_slug
              AND prior.status='COMPLETED' AND prior.id<c.id AND prior.closed_at>=datetime(c.closed_at,'-30 days'))`, userId);
        case 'CHALLENGE_DISCIPLINE_7':
          return count(db, `SELECT count(*) AS count FROM challenge_runs WHERE user_id=? AND status='COMPLETED' AND challenge_slug='discipline_7'`, userId) > 0 ? 1 : 0;
        case 'COMEBACK_RESTORED':
          return count(db, 'SELECT count(*) AS count FROM streak_runs WHERE user_id=? AND restored_from_run_id IS NOT NULL', userId) > 0 ? 1 : 0;
        case 'FRESH_START':
          return db.prepare(`SELECT period_key AS date FROM settlements WHERE user_id=? AND period_type='day'
            AND json_extract(details_json,'$.xpTracked')=1 ORDER BY period_key`).all(userId).map((row) => row.date);
        default:
          throw new Error(`Unsupported reward metric: ${metric}`);
      }
    },
    fullWeekPeriods(userId) {
      return db.prepare(`SELECT period_key AS periodKey FROM settlements WHERE user_id=? AND period_type='week'
        AND json_extract(details_json,'$.xpTrackedDays')=7 ORDER BY period_key`).all(userId).map((row) => row.periodKey);
    },
    badge(userId, slug, tier) {
      return db.prepare(`SELECT user_id AS userId,badge_slug AS badgeSlug,tier,rarity,xp_awarded AS xpAwarded,unlocked_at AS unlockedAt,
        achieved_on AS achievedOn,source_json AS sourceJson,status,revoked_at AS revokedAt,revoked_by AS revokedBy,case_id AS caseId,
        revoke_reason AS revokeReason,catalog_version AS catalogVersion FROM user_badges WHERE user_id=? AND badge_slug=? AND tier=?`)
        .get(userId, slug, tier) ?? null;
    },
    insertBadge({ userId, slug, tier, rarity, xpAwarded, unlockedAt, achievedOn, source, catalogVersion }) {
      const result = db.prepare(`INSERT OR IGNORE INTO user_badges(user_id,badge_slug,tier,rarity,xp_awarded,unlocked_at,achieved_on,
        source_json,status,catalog_version) VALUES(?,?,?,?,?,?,?,?,'ACTIVE',?)`)
        .run(userId, slug, tier, rarity, xpAwarded, unlockedAt, achievedOn, JSON.stringify(source), catalogVersion);
      return result.changes > 0;
    },
    badges(userId) {
      return db.prepare(`SELECT badge_slug AS badgeSlug,tier,rarity,xp_awarded AS xpAwarded,unlocked_at AS unlockedAt,
        achieved_on AS achievedOn,source_json AS sourceJson,status FROM user_badges WHERE user_id=? ORDER BY unlocked_at,badge_slug,tier`)
        .all(userId).map((row) => ({ ...row, source: JSON.parse(row.sourceJson) }));
    },
    upsertBadgeProgress({ userId, slug, metricValue, timesEarned, updatedAt }) {
      db.prepare(`INSERT INTO badge_progress(user_id,badge_slug,metric_value,times_earned,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,badge_slug) DO UPDATE SET metric_value=excluded.metric_value,
          times_earned=MAX(badge_progress.times_earned,excluded.times_earned),updated_at=excluded.updated_at`)
        .run(userId, slug, metricValue, timesEarned, updatedAt);
    },
    badgeProgress(userId) {
      return db.prepare(`SELECT badge_slug AS badgeSlug,metric_value AS metricValue,times_earned AS timesEarned
        FROM badge_progress WHERE user_id=?`).all(userId);
    },
    recordRepeatablePeriod(userId, slug, periodKey, createdAt) {
      return db.prepare('INSERT OR IGNORE INTO badge_repeatable_periods(user_id,badge_slug,period_key,created_at) VALUES(?,?,?,?)')
        .run(userId, slug, periodKey, createdAt).changes > 0;
    },
    repeatablePeriods(userId, slug) {
      return db.prepare('SELECT period_key AS periodKey FROM badge_repeatable_periods WHERE user_id=? AND badge_slug=? ORDER BY period_key')
        .all(userId, slug).map((row) => row.periodKey);
    },
    activeBadges(userId) {
      return db.prepare(`SELECT badge_slug AS badgeSlug,tier,xp_awarded AS xpAwarded,rarity,achieved_on AS achievedOn
        FROM user_badges WHERE user_id=? AND status='ACTIVE' ORDER BY badge_slug,tier`).all(userId);
    },
    insertActivity({ userId, kind, refType, refId, occurredAt, summaryCode, data, dedupeKey }) {
      return db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
        VALUES(?,?,?,?,?,?,?,?)`).run(userId,kind,refType,refId,occurredAt,summaryCode,JSON.stringify(data),dedupeKey).changes > 0;
    },
  };
}
