export function scoreIntegrity(flags, config) {
  const policy = config.integrity ?? config;
  const active = flags.filter((flag) => !['DISMISSED','EXPIRED'].includes(flag.status));
  const byCode = new Map();
  for (const flag of active) byCode.set(flag.code, (byCode.get(flag.code) ?? 0) + 1);
  let score = 0;
  for (const [code, count] of byCode) score += Math.min(count, policy.scoring.maxInstancesPerCode) * (policy.scoring.points[code] ?? 0);
  const distinctHoldEligible = [...byCode.keys()].filter((code) => byCode.get(code) > 0 && policy.scoring.holdEligible.includes(code)).length;
  return { score, distinctHoldEligible, byCode: Object.fromEntries(byCode) };
}

export function responseLadder({ flags, accountCreatedAt, now, autoHoldsLast90Days }, config) {
  const policy = config.integrity ?? config;
  const score = scoreIntegrity(flags, config);
  const accountAgeMs = now.getTime() - new Date(accountCreatedAt).getTime();
  const minimumAgeMs = policy.holds.minAccountAgeDaysForAutoHold * config.units.hoursPerDay * config.units.minutesPerHour * config.units.secondsPerMinute * config.units.millisecondsPerSecond;
  return {
    ...score,
    nudge: score.score >= policy.scoring.nudgeAt,
    openCase: score.score >= policy.scoring.caseAt,
    autoHold: score.score >= policy.scoring.holdAt && score.distinctHoldEligible >= policy.scoring.holdMinDistinctCodes
      && accountAgeMs >= minimumAgeMs && autoHoldsLast90Days < policy.holds.maxAutoPerRolling90Days,
  };
}
