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
  events: Object.freeze({ retentionDays: 400, schemaVersion: 1, cleanupIntervalHours: 24, reconciliationDays: 45, workerBatchSize: 100 }),
  idempotency: Object.freeze({ ttlHours: 24, keyMaxLength: 100 }),
  clock: Object.freeze({ minuteBoundarySeconds: 60, responseTimeUnits: 1000 }),
  pagination: Object.freeze({ defaultPage: 1, defaultPageSize: 20, maxPageSize: 100, summaryLedgerCount: 10 }),
  units: Object.freeze({ zero: 0, one: 1, two: 2, monthLabelLength: 7, dateLength: 10, isoWeekAnchorDay: 4, isoThursdayOffset: 4, millisecondsPerSecond: 1000, secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24, daysPerWeek: 7, basisPoints: 10000, wallClockSearchAttempts: 4 }),
});

export { rulesConfig };
export default rulesConfig;
