import type { StreakSummary } from '../../types/streak';
import type { FlameState } from './flameSpec';

export function streakFlameState(summary: StreakSummary): FlameState {
  if (summary.tracking.settlingDate) return 'SETTLING';
  if (summary.tracking.atRisk) return 'AT_RISK';
  if (summary.tracking.trackedToday) return 'ACTIVE_TRACKED';
  if (summary.lastPeriod?.status === 'FROZEN') return 'FROZEN';
  if (summary.tracking.status === 'BROKEN') return 'BROKEN';
  if (summary.tracking.status === 'ACTIVE') return 'ACTIVE_UNTRACKED';
  return 'INACTIVE';
}

export function visibleFlameLength(summary: StreakSummary) {
  return summary.tracking.trackedToday ? Math.max(1, summary.tracking.current) : summary.tracking.current;
}
