const badgeMetrics = new Set([
  'FIRST_LIVE_TX',
  'REVIEWS_COMPLETED',
  'XP_TRACKED_DAYS',
  'LONGEST_TRACKING_STREAK',
  'LONGEST_WEEKLY_STREAK',
  'COUNTED_BUDGET_DAYS',
  'COUNTED_BUDGET_MONTHS',
  'PLANNER',
  'FULL_WEEK',
  'LEVEL',
  'CHALLENGES_COMPLETED',
  'CHALLENGE_DISCIPLINE_7',
  'COMEBACK_RESTORED',
  'FRESH_START',
]);

const missionConditions = new Set([
  'DAILY_LIMIT_SET_ON_DAY',
  'CATEGORY_BUDGET_SET_ON_DAY',
  'ALL_LIVE_CATEGORIZED',
  'LIVE_EXPENSE_HAS_NOTE',
  'TRACKED_DAYS_AT_LEAST',
  'COUNTED_BUDGET_DAYS_AT_LEAST',
  'REVIEWS_AT_LEAST',
  'CATEGORIZED_SHARE_AT_LEAST',
  'NEXT_MONTH_BUDGET_SET_LAST_7_DAYS',
  'TRACKED_SHARE_AT_LEAST',
  'COUNTED_BUDGET_DAYS_IMPROVED',
]);

const rarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const categories = ['TRACKING', 'STREAK', 'BUDGET', 'PROGRESS', 'CHALLENGE', 'HABIT'];
const badgeTypes = ['ONE_TIME', 'PROGRESSIVE', 'REPEATABLE'];
const missionSlots = ['DAILY', 'WEEKLY', 'MONTHLY'];
const shopTypes = ['FREEZE', 'THEME', 'FRAME'];

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Reward catalog contains duplicate ${label}.`);
}

export function assertRewardCatalog(rewards) {
  if (!rewards || typeof rewards.catalogVersion !== 'string' || !rewards.catalogVersion.trim()) {
    throw new Error('Reward catalog requires a version string.');
  }
  assertUnique(rewards.badges.map(({ slug }) => slug), 'badge slugs');
  for (const badge of rewards.badges) {
    if (!categories.includes(badge.category) || !badgeTypes.includes(badge.type)) {
      throw new Error(`Reward badge ${badge.slug} has an unknown category or type.`);
    }
    if (!badgeMetrics.has(badge.metric)) throw new Error(`Reward badge ${badge.slug} uses an unknown metric.`);
    if (badge.type === 'PROGRESSIVE') {
      if (!Array.isArray(badge.tiers) || badge.tiers.length === 0 || !badge.tiers.every((value) => Number.isSafeInteger(value) && value > 0)) {
        throw new Error(`Progressive badge ${badge.slug} requires integer thresholds.`);
      }
      for (let index = 1; index < badge.tiers.length; index += 1) {
        if (badge.tiers[index] <= badge.tiers[index - 1]) {
          throw new Error(`Progressive badge ${badge.slug} thresholds must ascend.`);
        }
      }
      for (const rarity of Object.values(badge.tierRarity ?? {})) {
        if (!rarities.includes(rarity)) throw new Error(`Progressive badge ${badge.slug} has an unknown rarity.`);
      }
    } else if (!rarities.includes(badge.rarity)) {
      throw new Error(`Badge ${badge.slug} has an unknown rarity.`);
    }
    if (badge.xp !== undefined && (!Number.isSafeInteger(badge.xp) || badge.xp < 0)) {
      throw new Error(`Badge ${badge.slug} XP must be a non-negative integer.`);
    }
  }

  const templates = rewards.missions.templates;
  assertUnique(templates.map(({ id }) => id), 'mission template ids');
  for (const template of templates) {
    if (!missionSlots.includes(template.slot) || !missionConditions.has(template.condition)) {
      throw new Error(`Mission ${template.id} has an unknown slot or condition.`);
    }
    if (!Number.isSafeInteger(template.priority) || template.priority < 0) {
      throw new Error(`Mission ${template.id} priority must be a non-negative integer.`);
    }
  }

  const challenges = rewards.challenges.library;
  assertUnique(challenges.map(({ slug }) => slug), 'challenge slugs');
  for (const challenge of challenges) {
    if (!Number.isSafeInteger(challenge.days) || challenge.days < 1 ||
        !Number.isSafeInteger(challenge.requiredQualifyingDays) || challenge.requiredQualifyingDays < 1 ||
        challenge.requiredQualifyingDays > challenge.days ||
        !Number.isSafeInteger(challenge.costXp) || challenge.costXp < 0 ||
        !Number.isSafeInteger(challenge.rewardXp) || challenge.rewardXp < 0) {
      throw new Error(`Challenge ${challenge.slug} has invalid integer bounds.`);
    }
  }

  assertUnique(rewards.shop.items.map(({ slug }) => slug), 'shop item slugs');
  for (const item of rewards.shop.items) {
    if (!shopTypes.includes(item.type) || !Number.isSafeInteger(item.costXp) || item.costXp < 0 ||
        !Number.isSafeInteger(item.minLevel) || item.minLevel < 1) {
      throw new Error(`Shop item ${item.slug} has an unknown type or invalid gate/price.`);
    }
  }
  return rewards;
}

export function badgeTier(rewards, family, tier) {
  const rarity = family.type === 'PROGRESSIVE'
    ? family.tierRarity?.[tier] ?? rewards.progressiveRarities[tier - 1]
    : family.rarity;
  return { rarity, xp: family.xp ?? rewards.rarityXp[rarity] };
}

export function economyReport(rules) {
  const { xp, streaks, rewards } = rules;
  const { daysPerYear, weeksPerYear, monthsPerYear } = rewards.economy;
  const baseRecurring = (xp.dailyTracking + xp.dailyReview + xp.dailyAdherence) * daysPerYear +
    xp.weeklyConsistency * weeksPerYear + xp.monthlyBudgetCompletion * monthsPerYear;
  const missionRecurring = rewards.missions.xp.DAILY * daysPerYear +
    rewards.missions.xp.WEEKLY * weeksPerYear + rewards.missions.xp.MONTHLY * monthsPerYear;
  const oneTimeBadges = rewards.badges.reduce((sum, family) => {
    if (family.type === 'PROGRESSIVE') {
      return sum + family.tiers.reduce((tierTotal, _threshold, index) =>
        tierTotal + badgeTier(rewards, family, index + 1).xp, 0);
    }
    return sum + badgeTier(rewards, family, 1).xp;
  }, 0);
  const streakMilestones = streaks.tracking.milestones.reduce((sum, milestone) => sum + milestone.xp, 0);
  const challengeRewards = rewards.challenges.library.reduce((sum, challenge) => sum + challenge.rewardXp, 0);
  const onboarding = xp.onboarding.firstTransaction + xp.onboarding.firstBudget + xp.onboarding.firstReview;
  const recurringTotal = baseRecurring + missionRecurring;
  const oneTimeTotal = streakMilestones + oneTimeBadges + challengeRewards + onboarding;
  const yearOneTotal = recurringTotal + oneTimeTotal;
  const basisPoints = rules.units.basisPoints;
  const baseShareBps = Math.floor((baseRecurring * basisPoints) / recurringTotal);
  const missionShareBps = Math.floor((missionRecurring * basisPoints) / recurringTotal);
  const oneTimeShareBps = Math.floor((oneTimeTotal * basisPoints) / yearOneTotal);
  return {
    baseRecurringXp: baseRecurring,
    missionRecurringXp: missionRecurring,
    recurringXp: recurringTotal,
    oneTimeXp: oneTimeTotal,
    yearOneXp: yearOneTotal,
    badgeXp: oneTimeBadges,
    streakMilestoneXp: streakMilestones,
    challengeXp: challengeRewards,
    baseShareBps,
    missionShareBps,
    oneTimeShareBps,
    passes: baseShareBps >= rewards.economy.baseMinShareBps &&
      missionShareBps <= rewards.economy.newRecurringMaxShareBps &&
      oneTimeShareBps <= rewards.economy.oneTimeMaxShareBps,
  };
}
