export function daysBetween(firstDate, secondDate, units) {
  const dayMilliseconds = units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond;
  return Math.round((Date.parse(`${secondDate}T00:00:00.000Z`) - Date.parse(`${firstDate}T00:00:00.000Z`)) / dayMilliseconds);
}

export function freshStartDate(trackedDates, { gapDays, minPriorTrackedDays, consecutiveDays }, units) {
  const dates = [...new Set(trackedDates)].sort();
  for (let index = minPriorTrackedDays; index < dates.length; index += 1) {
    const run = dates.slice(index, index + consecutiveDays);
    if (run.length !== consecutiveDays || run.some((date, offset) => offset > 0 && daysBetween(run[offset - 1], date, units) !== 1)) continue;
    const previousTrackedDate = dates[index - 1];
    if (daysBetween(previousTrackedDate, run[0], units) >= gapDays) return run[0];
  }
  return null;
}

export function metricValue(metric, metrics, config) {
  if (metric === 'FRESH_START') {
    return freshStartDate(metrics.trackedDates ?? [], config.rewards.metrics.freshStart, config.units) ? 1 : 0;
  }
  const value = metrics[metric];
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Metric ${metric} must be a non-negative safe integer.`);
  return value;
}
