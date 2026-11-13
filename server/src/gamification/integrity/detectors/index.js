const amountOf = (row) => Number(row.amountPaise ?? 0);

export const detectors = Object.freeze({
  HIGH_EDIT_CHURN: (data, config, rules) => data.settledEdits?.length >= config.editsOnSettledDays || data.keyTransitions?.some((row) => row.transitions >= rules.churn.flagAtTransitions),
  BULK_BACKFILL: (data, config) => (data.nonLiveCreates ?? 0) >= config.nonLiveCreates,
  LIMIT_RAISED_AFTER_FAIL: (data, config) => data.failedLimitChange?.increaseBps >= config.minIncreaseBps,
  LIMIT_SAWTOOTH: (data, config) => (data.limitChanges?.length ?? 0) >= config.changes,
  LIMIT_RESCUE_PATTERN: (data, config) => (data.rescueDays ?? []).filter((row) => row.reductionBps >= config.minReductionBps).length >= config.days,
  MICRO_ENTRY_PATTERN: (data, config, rules) => (data.trackedDayAmounts ?? []).filter((row) => amountOf(row) < rules.tracking.minQualifyingAmountPaise * config.belowMinMultiple).length >= config.days,
  AT_LIMIT_CLUSTER: (data, config, rules) => {
    const tracked = (data.limitDays ?? []).filter((row) => row.tracked);
    return tracked.length >= config.minTrackedDays && tracked.filter((row) => row.shareBps >= config.bandLowBps).length * rules.units.basisPoints >= tracked.length * config.shareBps;
  },
  API_BURST: (data, config) => (data.rateLimitRejections ?? 0) >= config.rejections,
  TZ_HOPPING: (data, config) => (data.timezoneChanges ?? 0) >= config.changes,
  TZ_EXEMPT_REPEAT: (data, config) => (data.timezoneExemptions ?? 0) >= config.exemptions,
  NOSPEND_PATTERN: (data, config) => (data.noSpendDeclarations ?? 0) >= config.declaredDays,
  FREEZE_USED_RAPID: (data, config) => (data.freezeUses ?? 0) >= config.used,
  UNEXPECTED_FLAG_PATTERN: (data, config) => (data.consecutiveQuotaMonths ?? 0) >= config.consecutiveMonthsAtQuota,
});

export function runDetectors(windowData, config) {
  const integrity = config.integrity ?? config;
  return Object.entries(detectors).flatMap(([code, detect]) => {
    if (!detect(windowData, integrity.detectors[code], config)) return [];
    return [{ code, windowKey: windowData.windowKey, evidence: windowData.evidence?.[code] ?? {} }];
  });
}
