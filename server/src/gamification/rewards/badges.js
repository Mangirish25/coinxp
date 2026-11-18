import { badgeTier } from './catalog.js';
import { freshStartDate, metricValue } from './metrics.js';

export function createBadgeService({ db, repository, config, clock, localDate, reconcileKey, publish, insertNotice }) {
  function metricFor(userId, family) {
    const measured = repository.badgeMetric(userId, family.metric, config);
    const snapshot = family.metric === 'FRESH_START' ? { trackedDates: measured } : { [family.metric]: measured };
    const value = metricValue(family.metric, snapshot, config);
    return {
      value,
      achievedOn: family.metric === 'FRESH_START'
        ? freshStartDate(snapshot.trackedDates ?? [], config.rewards.metrics.freshStart, config.units)
        : localDate(userId),
      source: { metric: family.metric, value },
    };
  }

  function orderedFamilies(families) {
    const order = new Map(config.rewards.badgeCategoryOrder.map((category, index) => [category, index]));
    return [...families].sort((left, right) =>
      order.get(left.category) - order.get(right.category) || left.slug.localeCompare(right.slug));
  }

  function evaluate(userId, families = config.rewards.badges, { awardXp = true, summaryNotice = false } = {}) {
    if (!config.rewards.badges.length) return [];
    const now = clock.now().toISOString();
    const unlocked = [];
    for (let pass = 0; pass < config.rewards.maxBadgeEvaluationPasses; pass += 1) {
      let changed = false;
      const passUnlocked = [];
      db.transaction(() => {
        for (const family of orderedFamilies(families)) {
          let metric;
          if (family.type === 'REPEATABLE') {
            const periods = repository.fullWeekPeriods(userId);
            for (const period of periods) repository.recordRepeatablePeriod(userId, family.slug, period, now);
            const earnedPeriods = repository.repeatablePeriods(userId, family.slug);
            metric = { value: earnedPeriods.length, achievedOn: earnedPeriods[0] ?? localDate(userId), source: { metric: family.metric, value: earnedPeriods.length } };
          } else {
            metric = metricFor(userId, family);
          }
          const timesEarned = family.type === 'REPEATABLE' ? metric.value : 0;
          repository.upsertBadgeProgress({ userId, slug: family.slug, metricValue: metric.value, timesEarned, updatedAt: now });
          const thresholds = family.type === 'PROGRESSIVE' ? family.tiers : [1];
          for (let index = 0; index < thresholds.length; index += 1) {
            const tier = index + 1;
            if (metric.value < thresholds[index] || repository.badge(userId, family.slug, tier)) continue;
            const { rarity, xp } = badgeTier(config.rewards, family, tier);
            const achievedOn = metric.achievedOn ?? localDate(userId);
            if (!repository.insertBadge({ userId, slug: family.slug, tier, rarity, xpAwarded: awardXp ? xp : 0, unlockedAt: now,
              achievedOn, source: metric.source, catalogVersion: config.rewards.catalogVersion })) continue;
            const key = family.type === 'REPEATABLE' ? `BAD-003:${family.slug}:1` : `BAD-003:${family.slug}:${tier}`;
            if (awardXp) reconcileKey({ userId, key, ruleId: 'BAD-003', periodType: 'once', periodKey: key, desired: true,
              value: xp, reasonCode: 'BADGE_UNLOCKED' });
            const result = { slug: family.slug, tier, rarity, xpAwarded: xp, achievedOn, name: family.slug.replaceAll('_', ' ') };
            passUnlocked.push(result);
            changed = true;
            publish('BADGE_UNLOCKED', userId, result, `BADGE:${userId}:${family.slug}:${tier}`);
            repository.insertActivity({ userId, kind: 'BADGE', refType: 'BADGE', refId: `${family.slug}:${tier}`,
              occurredAt: now, summaryCode: 'BADGE_UNLOCKED', data: result,
              dedupeKey: `BADGE:${userId}:${family.slug}:${tier}` });
          }
        }
        if (passUnlocked.length) {
          const names = passUnlocked.slice(0, config.rewards.notifications.maxBadgeNamesPerNotice).map(({ name, tier }) => `${name} (tier ${tier})`);
          insertNotice({ userId, kind: 'REWARD', code: summaryNotice ? 'BADGE_BACKFILL_SUMMARY' : 'BADGE_UNLOCKED',
            data: { badges: names, moreCount: Math.max(0, passUnlocked.length - names.length) },
            dedupeKey: `BADGES:${userId}:${passUnlocked.map(({ slug, tier }) => `${slug}:${tier}`).join('|')}`, createdAt: now });
        }
      })();
      unlocked.push(...passUnlocked);
      if (!changed) break;
    }
    return unlocked;
  }

  function catalog(userId) {
    const earned = repository.badges(userId);
    const progress = new Map(repository.badgeProgress(userId).map((row) => [row.badgeSlug, row]));
    const visible = [];
    let hiddenRemaining = 0;
    for (const family of orderedFamilies(config.rewards.badges)) {
      const rows = earned.filter((row) => row.badgeSlug === family.slug);
      if (family.hidden && rows.length === 0) {
        hiddenRemaining += 1;
        continue;
      }
      const value = metricFor(userId, family).value;
      const thresholds = family.type === 'PROGRESSIVE' ? family.tiers : [1];
      visible.push({
        slug: family.slug,
        category: family.category,
        type: family.type,
        rarity: family.type === 'PROGRESSIVE' ? null : family.rarity,
        hidden: Boolean(family.hidden),
        metric: family.metric,
        metricValue: value,
        timesEarned: progress.get(family.slug)?.timesEarned ?? 0,
        tiers: thresholds.map((threshold, index) => {
          const tier = index + 1;
          const badge = rows.find((row) => row.tier === tier);
          const tierInfo = badgeTier(config.rewards, family, tier);
          return { tier, threshold, rarity: tierInfo.rarity, xp: tierInfo.xp,
            status: badge?.status ?? 'LOCKED', achievedOn: badge?.achievedOn ?? null };
        }),
      });
    }
    return { data: visible, hiddenRemaining, catalogVersion: config.rewards.catalogVersion };
  }

  function releaseDeferred(userId) {
    const unlocked = [];
    for (const badge of repository.activeBadges(userId)) {
      const key = `BAD-003:${badge.badgeSlug}:${badge.tier}`;
      const entry = reconcileKey({ userId, key, ruleId: 'BAD-003', periodType: 'once', periodKey: key,
        desired: true, value: badge.xpAwarded, reasonCode: 'BADGE_UNLOCKED' });
      if (entry) unlocked.push({ slug: badge.badgeSlug, tier: badge.tier, xpAwarded: entry.lifetimeDelta });
    }
    return unlocked;
  }

  return { evaluate, catalog, releaseDeferred };
}
