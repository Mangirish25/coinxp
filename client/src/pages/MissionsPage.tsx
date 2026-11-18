import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CalendarDays, CalendarRange, Target } from 'lucide-react';
import { missionApi } from '../services/missionApi';

const slotLabels = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' } as const;
const icons = { DAILY: CalendarCheck2, WEEKLY: CalendarDays, MONTHLY: CalendarRange } as const;

function missionTitle(templateId: string) {
  return templateId.split('_').slice(1).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ') || templateId;
}

export function MissionsPage() {
  const missions = useQuery({ queryKey: ['missions', 'current'], queryFn: missionApi.current });
  return <section className="mx-auto max-w-5xl space-y-6">
    <header><p className="text-sm font-medium text-brand-600">Small goals, steady habits</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Missions</h1><p className="mt-2 text-sm text-ink-500">Missions are assigned from your current habits and checked when their period closes.</p></header>
    {missions.isLoading && <div className="grid gap-4 md:grid-cols-3"><div className="h-44 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" /><div className="h-44 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" /><div className="h-44 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" /></div>}
    {missions.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">Missions could not load. <button className="underline" onClick={() => void missions.refetch()}>Retry</button></div>}
    {missions.data && (missions.data.data.length ? <div className="grid gap-4 md:grid-cols-3">{missions.data.data.map((mission) => { const Icon = icons[mission.slot]; return <article key={mission.id} className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon aria-hidden="true" /></span><p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-500">{slotLabels[mission.slot]} · {mission.periodKey}</p><h2 className="mt-1 text-lg font-semibold">{missionTitle(mission.templateId)}</h2><p className="mt-3 flex items-center gap-2 text-sm text-ink-600"><Target size={15} aria-hidden="true" />{mission.status === 'ASSIGNED' ? 'In progress · verified at period close' : mission.status}</p></article>; })}</div> : <div className="rounded-2xl border bg-white p-6"><h2 className="font-semibold">Missions will appear soon</h2><p className="mt-2 text-sm text-ink-500">New accounts need a little history before the first mission is assigned.</p></div>)}
  </section>;
}
