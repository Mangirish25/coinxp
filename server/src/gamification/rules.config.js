// Defaults are Proposed by CoinXP Part 6 spec v0.1. Rule math reads values only here.
export const CONFIG_VERSION = '0.1.0';

const rulesConfig = Object.freeze({
  xp: Object.freeze({
    dailyTracking: 10,
    dailyReview: 15,
    dailyAdherence: 20,
    weeklyConsistency: 50,
    monthlyBudgetCompletion: 100,
    onboarding: Object.freeze({ firstTransaction: 25, firstBudget: 25, firstReview: 25 }),
    dailyRuleCap: 100,
  }),
  levels: Object.freeze({
    base: 50,
    maxLevel: 100,
    titles: Object.freeze([
      Object.freeze({ from: 1, title: 'Beginner' }),
      Object.freeze({ from: 2, title: 'Budget Explorer' }),
      Object.freeze({ from: 3, title: 'Smart Spender' }),
      Object.freeze({ from: 4, title: 'Financial Strategist' }),
      Object.freeze({ from: 5, title: 'Wealth Builder' }),
      Object.freeze({ from: 10, title: 'Habit Architect' }),
      Object.freeze({ from: 25, title: 'Financial Sage' }),
    ]),
  }),
  tracking: Object.freeze({ minQualifyingAmountPaise: 500, noSpendDeclarationsPerWeekCap: 2 }),
  weekly: Object.freeze({ requiredTrackedDays: 5, daysPerWeek: 7, minEligibleDays: 3 }),
  monthly: Object.freeze({ minTrackedShareBps: 6000, minEligibleDays: 14 }),
  settlement: Object.freeze({ cutoffLocalHour: 4, sealAfterDays: 90, schedulerIntervalMinutes: 15, lateWindowHours: 4 }),
  guards: Object.freeze({ limitRealism: Object.freeze({ enabled: true, factor: 3, dailyLookbackDays: 28, dailyMinBaselineDays: 14, monthlyLookbackMonths: 3, monthlyMinMonths: 2, monthlyMinTrackedShareBps: 6000 }) }),
  churn: Object.freeze({ flagAtTransitions: 4, lockAtTransitions: 20 }),
  retry: Object.freeze({ maxAttempts: 5, backoffSeconds: Object.freeze([30, 120, 600, 3600, 21600]), maxConflictRetries: 3 }),
  rateLimits: Object.freeze({ transactionWritesPerMinute: 60, reviewPerMinute: 10, windowSeconds: 60, bulkBackfillThreshold: 30 }),
  timezone: Object.freeze({ changeCooldownDays: 7, observationWindowDays: 30, flagChangeCount: 4 }),
  streaks: Object.freeze({
    tracking: Object.freeze({ minRunLengthForFreeze: 3, freeze: Object.freeze({ maxHeld: 2, maxConsecutiveFrozen: 2, starterAtLength: 3, starterCount: 1, regenEveryCountedDays: 14 }),
      milestones: Object.freeze([{ days: 3, xp: 10 }, { days: 7, xp: 25 }, { days: 14, xp: 50 }, { days: 30, xp: 100 }, { days: 60, xp: 150 }, { days: 100, xp: 250 }, { days: 180, xp: 400 }, { days: 365, xp: 600 }]),
      comeback: Object.freeze({ enabled: true, minPrevLength: 10, maxGapDays: 3, afterCountedDays: 3, retentionBps: 5000, cooldownGenuineDays: 14 }) }),
    secondary: Object.freeze({ budgetDaily: Object.freeze({ enabled: true }), consistencyWeekly: Object.freeze({ enabled: true }), budgetMonthly: Object.freeze({ enabled: true }) }),
    atRisk: Object.freeze({ localHour: 18 }), calendar: Object.freeze({ maxRangeDays: 366 }),
    reminders: Object.freeze({ maxPerDay: 1, windowStartHour: 18, windowEndHour: 21, quietStartHour: 22, quietEndHour: 8, maxNotificationsPerDay: 2 }),
    timezone: Object.freeze({ exemptSkippedDates: true }),
  }),
  events: Object.freeze({ retentionDays: 400, schemaVersion: 1, cleanupIntervalHours: 24, reconciliationDays: 45, workerBatchSize: 100 }),
  idempotency: Object.freeze({ ttlHours: 24, keyMaxLength: 100 }),
  clock: Object.freeze({ minuteBoundarySeconds: 60, responseTimeUnits: 1000 }),
  pagination: Object.freeze({ defaultPage: 1, defaultPageSize: 20, maxPageSize: 100, summaryLedgerCount: 10 }),
  units: Object.freeze({ zero: 0, one: 1, two: 2, monthLabelLength: 7, dateLength: 10, isoWeekAnchorDay: 4, isoThursdayOffset: 4, millisecondsPerSecond: 1000, secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24, daysPerWeek: 7, basisPoints: 10000, wallClockSearchAttempts: 4 }),
});

export { rulesConfig };
export default rulesConfig;
