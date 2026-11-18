import { badgeTier } from '../rewards/catalog.js';

function safeXp(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  return BigInt(value);
}

export function theoreticalMaximum({ settledDays, closedWeeks, closedMonths }, config) {
  const xp = config.xp;
  const milestones = config.streaks.tracking.milestones;
  const onboarding = BigInt(
    xp.onboarding.firstTransaction + xp.onboarding.firstBudget + xp.onboarding.firstReview,
  );
  const daily =
    (BigInt(xp.dailyTracking) + BigInt(xp.dailyReview) + BigInt(xp.dailyAdherence)) *
    safeXp(settledDays, 'settledDays');
  const weekly = BigInt(xp.weeklyConsistency) * safeXp(closedWeeks, 'closedWeeks');
  const monthly = BigInt(xp.monthlyBudgetCompletion) * safeXp(closedMonths, 'closedMonths');
  const milestoneXp = milestones
    .filter(({ days }) => days <= settledDays)
    .reduce((sum, { xp: amount }) => sum + BigInt(amount), 0n);
  const rewardBadges = config.rewards.badges.reduce((totalXp, family) => {
    if (family.type === 'PROGRESSIVE') {
      return totalXp + family.tiers.reduce((familyXp, _threshold, index) =>
        familyXp + BigInt(badgeTier(config.rewards, family, index + 1).xp), 0n);
    }
    return totalXp + BigInt(badgeTier(config.rewards, family, 1).xp);
  }, 0n);
  const missions = BigInt(config.rewards.missions.xp.DAILY) * safeXp(settledDays, 'settledDays') +
    BigInt(config.rewards.missions.xp.WEEKLY) * safeXp(closedWeeks, 'closedWeeks') +
    BigInt(config.rewards.missions.xp.MONTHLY) * safeXp(closedMonths, 'closedMonths');
  const challenges = config.rewards.challenges.library.reduce((sum, challenge) => sum + BigInt(challenge.rewardXp), 0n);
  const total = onboarding + daily + weekly + monthly + milestoneXp + rewardBadges + missions + challenges;
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Theoretical XP ceiling exceeds the safe integer range.');
  return Number(total);
}

export function checkTheoreticalCeiling(
  { lifetimeXp, positiveAdjustmentXp, theoreticalMaxXp },
  toleranceXp = 0,
) {
  for (const [name, value] of Object.entries({
    lifetimeXp,
    positiveAdjustmentXp,
    theoreticalMaxXp,
    toleranceXp,
  })) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  const earned = BigInt(lifetimeXp) - BigInt(positiveAdjustmentXp);
  const maximum = BigInt(theoreticalMaxXp) + BigInt(toleranceXp);
  return { earnedXp: Number(earned), maximumXp: Number(maximum), exceeded: earned > maximum };
}
