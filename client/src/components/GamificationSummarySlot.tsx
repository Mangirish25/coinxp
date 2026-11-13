import { GamificationSummaryCard } from './GamificationSummaryCard';
import { StreakSummaryCard } from './StreakSummaryCard';

export function GamificationSummarySlot() {
  return <div role="group" aria-label="Progress summaries" className="grid gap-4 xl:grid-cols-2">
    <GamificationSummaryCard />
    <StreakSummaryCard />
  </div>;
}
