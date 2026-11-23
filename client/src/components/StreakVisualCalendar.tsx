import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Circle, CircleDashed, Clock3, Minus, Snowflake, Tag } from 'lucide-react';
import { useMotionPreferences } from '../motion/MotionProvider';
import type { StreakCalendar, StreakPeriodStatus, StreakSummary } from '../types/streak';

type Day = StreakCalendar['days'][number] & { provisional?: boolean };
type WeekDay = StreakSummary['week'][number];

const statusInfo: Record<StreakPeriodStatus, { label: string; short: string; Icon: typeof Check; className: string }> = {
  COUNTED: { label: 'Counted', short: 'Counted', Icon: Check, className: 'bg-emerald-100 border-emerald-600 text-emerald-900' },
  FROZEN: { label: 'Protected by freeze', short: 'Frozen', Icon: Snowflake, className: 'bg-sky-100 border-sky-600 text-sky-900' },
  EXEMPT: { label: 'Travel gap', short: 'Travel gap', Icon: Clock3, className: 'bg-violet-50 border-violet-500 text-violet-900' },
  MISSED: { label: 'Missed', short: 'Missed', Icon: Minus, className: 'bg-slate-100 border-slate-400 text-slate-700' },
  DECLARED_CAPPED: { label: 'Declared, not eligible for a streak', short: 'Declared', Icon: Tag, className: 'bg-amber-50 border-amber-500 text-amber-900' },
  TODAY_OPEN: { label: 'Today is still open', short: 'Today open', Icon: CircleDashed, className: 'bg-white border-brand-600 text-brand-800' },
  NONE: { label: 'No streak activity', short: 'No activity', Icon: Circle, className: 'bg-canvas border-slate-300 text-slate-500' },
};
const weekdayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekCells(days: Day[], year: number) {
  const firstWeekday = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leading = (firstWeekday + 6) % 7;
  const cells: Array<Day | null> = [...Array.from({ length: leading }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  return { cells, weeks: Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7)) };
}

export function StreakVisualCalendar({ year, days, week }: { year: number; days: Day[]; week: WeekDay[] }) {
  const { effectiveMode } = useMotionPreferences();
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const { cells, weeks } = useMemo(() => weekCells(days, year), [days, year]);
  const [activeDate, setActiveDate] = useState(days[0]?.date ?? '');
  useEffect(() => setActiveDate(days[0]?.date ?? ''), [days]);
  const monthLabels = weeks.map((_week, column) => {
    const date = cells.slice(column * 7, column * 7 + 7).find((day) => day?.date.endsWith('-01'))?.date;
    return date ? monthNames[Number(date.slice(5, 7)) - 1] : '';
  });

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
    if (!offset) return;
    event.preventDefault();
    let index = cells.findIndex((day) => day?.date === date);
    let target = index + offset;
    while (target >= 0 && target < cells.length && !cells[target]) target += Math.sign(offset);
    const next = cells[target];
    if (next) { setActiveDate(next.date); cellRefs.current.get(next.date)?.focus(); }
  }

  const trackedCount = days.filter(({ status }) => status === 'COUNTED').length;
  const freezeCount = days.filter(({ status }) => status === 'FROZEN').length;
  return <div className="space-y-5">
    <section aria-labelledby="streak-week-title">
      <h3 id="streak-week-title" className="font-semibold">This week</h3>
      <ul className="mt-3 grid grid-cols-7 gap-2">
        {week.map((day, index) => {
          const info = statusInfo[day.status]; const Icon = info.Icon;
          return <li key={day.date} className="min-w-0 text-center">
            <span className="text-xs text-ink-500">{weekdayNames[index]?.slice(0, 2)}</span>
            <div aria-label={`${day.date}: ${day.provisional ? 'Tracked today, not yet settled' : info.label}`} title={`${day.date}: ${day.provisional ? 'Tracked today, not yet settled' : info.label}`}
              className={`mx-auto mt-1 grid h-10 w-10 place-items-center rounded-full border-2 ${info.className} ${day.provisional ? 'border-dashed' : ''} ${day.status === 'TODAY_OPEN' && effectiveMode === 'FULL' ? 'streak-week-open' : ''}`}>
              <Icon size={18} aria-hidden="true" />
            </div>
            <span className="mt-1 block truncate text-[10px] text-ink-500">{Number(day.date.slice(-2))}</span>
          </li>;
        })}
      </ul>
    </section>

    <section aria-labelledby="streak-year-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h3 id="streak-year-title" className="font-semibold">Year at a glance</h3><p className="mt-1 text-xs text-ink-500">{trackedCount} counted {trackedCount === 1 ? 'day' : 'days'} · {freezeCount} protected {freezeCount === 1 ? 'day' : 'days'} in {year}</p></div>
      </div>
      {trackedCount === 0 && <p className="mt-3 text-sm text-ink-600">Track a transaction today to start your first streak.</p>}
      <div className="mt-4 overflow-x-auto pb-2" role="region" aria-label={`${year} streak heatmap, scroll horizontally for all weeks`}>
        <div className="min-w-[850px]">
          <div aria-hidden="true" className="grid gap-1 text-[10px] text-ink-500" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {monthLabels.map((label, index) => <span key={index} className="h-4">{label}</span>)}
          </div>
          <div role="grid" aria-label={`${year} streak calendar; use arrow keys to move between days`}
            className="mt-1 grid auto-cols-[minmax(0,1fr)] grid-flow-col grid-rows-7 gap-1">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} role="presentation" aria-hidden="true" />;
              const info = statusInfo[day.status]; const Icon = info.Icon;
              return <button key={day.date} ref={(node) => { if (node) cellRefs.current.set(day.date, node); else cellRefs.current.delete(day.date); }}
                type="button" role="gridcell" tabIndex={activeDate === day.date ? 0 : -1} aria-label={`${day.date}: ${info.label}`}
                title={`${day.date}: ${info.label}`} onFocus={() => setActiveDate(day.date)} onKeyDown={(event) => moveFocus(event, day.date)}
                className={`grid h-3.5 w-3.5 place-items-center rounded-sm border ${info.className} ${day.status === 'TODAY_OPEN' && effectiveMode === 'FULL' ? 'streak-week-open' : ''} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700`}>
                <Icon aria-hidden="true" size={9} strokeWidth={2.5} />
              </button>;
            })}
          </div>
        </div>
      </div>
      <ul aria-label="Streak calendar legend" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {Object.entries(statusInfo).map(([status, info]) => { const Icon = info.Icon; return <li key={status} className="inline-flex items-center gap-1.5"><Icon aria-hidden="true" size={14} />{info.short}</li>; })}
      </ul>
    </section>
  </div>;
}
