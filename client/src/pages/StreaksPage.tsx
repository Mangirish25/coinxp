import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Circle, CircleCheck, CircleDashed, CircleX, Flame, Snowflake } from 'lucide-react';
import { MonthSelector } from '../components/MonthSelector';
import { useAuth } from '../contexts/AuthContext';
import { streakApi } from '../services/streakApi';
import type { StreakPeriodStatus } from '../types/streak';
import { currentMonthInTimezone } from './budgetPageUtils';

const statusInfo: Record<StreakPeriodStatus, { label: string; Icon: typeof Circle }> = {
  COUNTED: { label: 'Counted', Icon: CircleCheck }, FROZEN: { label: 'Protected by freeze', Icon: Snowflake },
  EXEMPT: { label: 'Timezone date exempt', Icon: CircleDashed }, MISSED: { label: 'Missed', Icon: CircleX },
  DECLARED_CAPPED: { label: 'No-spend declaration not eligible for streak', Icon: CircleDashed },
  TODAY_OPEN: { label: 'Today is still open', Icon: CalendarClock }, NONE: { label: 'No streak activity', Icon: Circle },
};

export function StreaksPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => currentMonthInTimezone(user?.timezone ?? 'Asia/Kolkata'));
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  const summary = useQuery({ queryKey: ['streaks', 'summary'], queryFn: streakApi.summary });
  const calendar = useQuery({ queryKey: ['streaks', 'calendar', from, to], queryFn: () => streakApi.calendar(from, to) });
  const freezes = useQuery({ queryKey: ['streaks', 'freezes', 1], queryFn: () => streakApi.freezes() });
  const rules = useQuery({ queryKey: ['streaks', 'rules'], queryFn: streakApi.rules });
  const days = calendar.data?.days ?? [];
  const leadingCells = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const milestones = (rules.data as { tracking?: { milestones?: Array<{ days: number; xp: number }> } } | undefined)?.tracking?.milestones ?? [];
  const current = summary.data?.tracking.current ?? 0;

  return <section className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-brand-600">Consistency over perfection</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Streaks</h1><p className="mt-2 text-sm text-ink-500">Tracking days come from settled XP-tracked activity. Frozen dates protect a run without adding length.</p></div><MonthSelector month={month} onChange={setMonth} label="Streak calendar month" /></header>
    {summary.isLoading ? <div className="h-32 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" aria-label="Loading streak status" /> : summary.isError ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">Streak status could not load. <button className="underline" onClick={() => void summary.refetch()}>Retry</button></div> : summary.data && <section className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-3"><Flame aria-hidden="true" className="text-brand-700" /><div><h2 className="text-xl font-semibold">{current} day tracking streak</h2><p className="text-sm text-ink-500">Longest: {summary.data.tracking.longest} days · {summary.data.freezes.inventory} / {summary.data.freezes.cap} freezes</p></div></div><p className="mt-3 text-sm">{summary.data.tracking.atRisk ? 'At risk today' : summary.data.tracking.freezeWouldProtect ? 'A freeze can protect your run today' : summary.data.tracking.trackedToday ? 'Today is tracked' : 'Your streak is updated through ' + summary.data.through}</p>{summary.data.tracking.comeback && <p className="mt-2 text-sm text-brand-700">Comeback progress: {summary.data.tracking.comeback.remainingDays} consecutive counted days to go.</p>}<div className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-3">{Object.entries(summary.data.secondary).map(([key, streak]) => <div key={key} className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-500">{{ BUDGET_DAILY: 'Daily budget chain', CONSISTENCY_WEEKLY: 'Weekly consistency chain', BUDGET_MONTHLY: 'Monthly budget chain' }[key] ?? key}</p><p className="mt-1 font-medium">{streak.current} current · {streak.longest} longest</p><p className="text-xs">{streak.status === 'ACTIVE' ? 'Continuing' : streak.status === 'BROKEN' ? 'Ended' : 'Not started'}</p></div>)}</div></section>}
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Tracking calendar</h2><div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-ink-500" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div>{calendar.isLoading ? <div className="mt-3 h-64 animate-pulse motion-reduce:animate-none rounded-xl bg-canvas" aria-label="Loading streak calendar" /> : calendar.isError ? <div role="alert" className="mt-3 text-sm text-red-700">Calendar could not load. <button className="underline" onClick={() => void calendar.refetch()}>Retry</button></div> : <div role="grid" aria-label={`${month} tracking streak calendar`} className="mt-2 grid grid-cols-7 gap-2">{Array.from({ length: leadingCells }, (_, index) => <span key={`empty-${index}`} />)}{days.map((day) => { const info = statusInfo[day.status]; const Icon = info.Icon; return <div role="gridcell" key={day.date} aria-label={`${day.date}: ${info.label}`} title={info.label} className="flex min-h-16 flex-col items-center justify-center rounded-xl border bg-canvas/50 p-2"><span className="text-xs font-medium">{Number(day.date.slice(-2))}</span><Icon aria-hidden="true" className="mt-1 h-4 w-4 text-brand-700" /><span className="sr-only">{info.label}</span></div>; })}</div>}<ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">{Object.entries(statusInfo).map(([status, info]) => { const Icon = info.Icon; return <li key={status} className="inline-flex items-center gap-1.5"><Icon aria-hidden="true" size={14} />{info.label}</li>; })}</ul></section>
    <div className="grid gap-4 md:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Milestones</h2>{rules.isLoading ? <p className="mt-3 text-sm text-ink-500">Loading milestones…</p> : rules.isError ? <p role="alert" className="mt-3 text-sm text-red-700">Milestones could not load. <button className="underline" onClick={() => void rules.refetch()}>Retry</button></p> : <ul className="mt-3 space-y-2">{milestones.map((item) => <li key={item.days} className="flex justify-between text-sm"><span>{item.days} tracked days</span><span>{item.xp} XP {current >= item.days ? '· reached' : ''}</span></li>)}</ul>}<p className="mt-3 text-xs text-ink-500">Milestone XP is awarded once per account.</p></section><section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Freeze history</h2>{freezes.isLoading ? <p className="mt-3 text-sm text-ink-500">Loading freeze history…</p> : freezes.isError ? <p role="alert" className="mt-3 text-sm text-red-700">Freeze history could not load. <button className="underline" onClick={() => void freezes.refetch()}>Retry</button></p> : freezes.data?.data.length ? <ol className="mt-3 space-y-3">{freezes.data.data.map((entry) => <li key={entry.id} className="flex justify-between gap-3 text-sm"><span>{entry.message}<span className="block text-xs text-ink-500">{entry.effectiveLocalDate}</span></span><strong>{entry.delta > 0 ? '+' : ''}{entry.delta}</strong></li>)}</ol> : <p className="mt-3 text-sm text-ink-500">No freeze history yet.</p>}</section></div>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">How streaks work</h2>{rules.isLoading ? <p className="mt-2 text-sm text-ink-500">Loading current rules…</p> : <p className="mt-2 text-sm text-ink-600">A tracking day is based on the Part 6 XP-tracked settlement. Frozen and timezone-exempt dates do not add to the length. Changes made after a date is settled do not rewrite its streak history.</p>}</section>
  </section>;
}
