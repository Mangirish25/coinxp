export function createTimezoneExemptions(timezoneChanges) {
  return {
    isExempt(userId, date) {
      return timezoneChanges.list(userId).some((change) => change.skippedDates.includes(date));
    },
  };
}
