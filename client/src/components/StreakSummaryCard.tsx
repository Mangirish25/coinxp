import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Snowflake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { streakApi } from '../services/streakApi';
import { StreakFlame } from '../visuals/flame/StreakFlame';
import { streakFlameState, visibleFlameLength } from '../visuals/flame/streakVisualState';
import { WeekStrip } from './WeekStrip';

export function StreakSummaryCard() {
  const query = useQuery({ queryKey: ['streaks', 'summary'], queryFn: streakApi.summary });
  useEffect(() => {
    for (const entry of query.data?.recentEvents ?? []) {
      const date = typeof entry.data.date === 'string' ? entry.data.date : '';
      const milestone = typeof entry.data.milestone === 'number' ? entry.data.milestone : 0;
      const toLength = typeof entry.data.toLength === 'number' ? entry.data.toLength : 0;
      const messages: Record<string, string> = {
        STREAK_FREEZE_USED: `A freeze protected your streak on ${date}.`,
        STREAK_BROKEN: 'Your tracking streak ended. Start again when you are ready.',
        STREAK_MILESTONE_REACHED: `You reached the ${milestone}-day tracking milestone.`,
        STREAK_RESTORED: `Comeback complete. Your streak recovered to ${toLength} days.`,
      };
      const text = messages[entry.eventType];
      if (text) window.dispatchEvent(new CustomEvent('coinxp:streak-toast', { detail: { eventId: entry.eventId, text } }));
    }
  }, [query.data?.recentEvents]);
  if (query.isLoading) return <div className="h-24 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" aria-label="Loading streak summary" />;
  if (query.isError || !query.data) return <section className="rounded-2xl border bg-white p-5"><p>Streak summary is temporarily unavailable.</p><button className="mt-2 underline" onClick={() => void query.refetch()}>Retry</button></section>;
  const { tracking, freezes } = query.data;
  return <section aria-label="Streak summary" className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><StreakFlame length={visibleFlameLength(query.data)} state={streakFlameState(query.data)} quality="MEDIUM" /><div><h2 className="font-semibold">{tracking.current} day tracking streak</h2><p className="text-sm text-ink-500">Longest: {tracking.longest} days · {freezes.inventory} of {freezes.cap} freezes</p></div></div><Link className="text-sm font-medium text-brand-700 underline" to="/streaks">View streak calendar</Link></div>
    <div className="mt-4 border-t pt-3"><WeekStrip week={query.data.week} /></div>
    <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-3 text-sm"><span className="inline-flex items-center gap-2">{tracking.atRisk ? 'At risk today' : tracking.freezeWouldProtect ? 'Protected by a freeze if needed' : tracking.trackedToday ? 'Tracked today' : tracking.status === 'ACTIVE' ? 'Keep your streak going' : tracking.status === 'BROKEN' ? 'Ready for a new streak' : 'Start a tracking streak'}{tracking.freezeWouldProtect && <Snowflake aria-hidden="true" size={15} />}</span>{tracking.nextMilestone && <span className="text-ink-500">Next milestone: {tracking.nextMilestone.days} days · {tracking.nextMilestone.xp} XP</span>}{tracking.comeback && <span className="text-brand-700">Comeback in progress: {tracking.comeback.remainingDays} counted days left</span>}{tracking.settlingDate && <span role="status" className="text-ink-500">Finalizing {tracking.settlingDate}</span>}</div>
  </section>;
}
