import { CalendarClock, Circle, CircleCheck, CircleDashed, CircleX, Snowflake } from 'lucide-react';
import type { StreakSummary, StreakPeriodStatus } from '../types/streak';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const iconFor: Record<StreakPeriodStatus, typeof Circle> = {
  COUNTED: CircleCheck, FROZEN: Snowflake, EXEMPT: CircleDashed, MISSED: CircleX,
  DECLARED_CAPPED: CircleDashed, TODAY_OPEN: CalendarClock, NONE: Circle,
};
const labelFor: Record<StreakPeriodStatus, string> = {
  COUNTED: 'Counted', FROZEN: 'Protected by a freeze', EXEMPT: 'Timezone date exempt', MISSED: 'No tracked activity',
  DECLARED_CAPPED: 'Declared no-spend day', TODAY_OPEN: 'Today is still open', NONE: 'No streak activity',
};

export function WeekStrip({ week }: { week: StreakSummary['week'] }) {
  return <ol aria-label="This week’s tracking status" className="grid grid-cols-7 gap-1 sm:gap-2">
    {weekdays.map((weekday, index) => {
      const day = week[index];
      if (!day) return <li key={weekday} aria-label={`${weekday}: loading`} className="h-16 rounded-xl bg-canvas" />;
      const Icon = iconFor[day.status];
      const label = day.provisional ? 'Tracked today, awaiting settlement' : labelFor[day.status];
      return <li key={day.date} aria-label={`${weekday} ${day.date}, ${label}`} className="flex min-h-16 flex-col items-center justify-center rounded-xl border border-black/5 bg-canvas/60 px-1 py-2 text-center">
        <span className="text-[11px] text-ink-500">{weekday}</span>
        <Icon aria-hidden="true" className={`mt-1 h-4 w-4 ${day.provisional ? 'text-brand-700' : 'text-ink-600'}`} />
        <span className="sr-only">{label}</span>
      </li>;
    })}
  </ol>;
}
