import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckCircle2, Circle, Flag, ShieldCheck, Swords } from 'lucide-react';
import { challengeApi } from '../services/challengeApi';
import type { ChallengeDefinition } from '../types/challenge';

const names: Record<string, string> = { discipline_7: '7-Day Discipline', tracking_14: '14-Day Tracking', budget_30: '30-Day Budget' };
const reasonText: Record<string, string> = { LEVEL_TOO_LOW: 'Reach the required level first.', INSUFFICIENT_XP: 'Earn more spendable XP first.', ACTIVE_CHALLENGE_EXISTS: 'Finish or abandon your active challenge first.', REQUIREMENT_NOT_MET: 'Set a daily limit before starting.' };

function qualificationText(definition: ChallengeDefinition) {
  const items = definition.qualify.map((item) => ({ XP_TRACKED: 'Track the day', REVIEW_DONE: 'Complete a daily review', COUNTED_BUDGET_DAY: 'Stay within the daily budget' }[item] ?? item));
  return items.join(' · ');
}

export function ChallengesPage() {
  const [notice, setNotice] = useState('');
  const catalog = useQuery({ queryKey: ['challenges', 'catalog'], queryFn: challengeApi.catalog });
  const runId = catalog.data?.activeRun?.id;
  const run = useQuery({ queryKey: ['challenges', 'run', runId], queryFn: () => challengeApi.run(runId!), enabled: Boolean(runId) });
  const start = useMutation({ mutationFn: challengeApi.start, onSuccess: (result) => setNotice(`Challenge started. Your first day is ${result.startDate}.`) });
  const cancel = useMutation({ mutationFn: challengeApi.cancel, onSuccess: () => setNotice('Challenge cancelled and XP refunded.') });
  const abandon = useMutation({ mutationFn: challengeApi.abandon, onSuccess: () => setNotice('Challenge abandoned. The XP purchase was not refunded.') });
  const error = start.error ?? cancel.error ?? abandon.error;
  const active = catalog.data?.activeRun;
  return <section className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-medium text-brand-600">Opt-in goals</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Challenges</h1><p className="mt-2 max-w-2xl text-sm text-ink-500">Challenges use spendable XP to commit to a short habit goal. Daily results are frozen when each day closes.</p></header>
    {catalog.isLoading && <div className="h-32 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" aria-label="Loading challenges" />}
    {catalog.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">Challenges could not load. <button className="underline" onClick={() => void catalog.refetch()}>Retry</button></div>}
    {notice && <p role="status" className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">{notice}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error.message}</p>}
    {active && <section className="rounded-2xl border border-brand-100 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Flag aria-hidden="true" /></span><div><p className="text-xs uppercase tracking-wide text-ink-500">Active challenge · {active.status.toLowerCase()}</p><h2 className="font-semibold">{names[active.challengeSlug] ?? active.challengeSlug}</h2></div></div><p className="text-sm font-medium">{active.qualifyingDays} / {active.requiredDays} qualifying days</p></div>
      {active.status === 'PENDING' && <div className="mt-4 flex justify-end"><button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(active.id)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Cancel and refund</button></div>}
      {active.status === 'ACTIVE' && <div className="mt-4 flex justify-end"><button type="button" disabled={abandon.isPending} onClick={() => abandon.mutate(active.id)} className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">Abandon challenge</button></div>}
      {run.data?.days && <ol className="mt-4 grid grid-cols-7 gap-2" aria-label="Challenge day results">{run.data.days.map((day) => <li key={day.localDate} aria-label={`${day.localDate}: ${day.status === 'DEFERRED' ? 'Pending review' : day.qualified ? 'Qualified' : 'Not qualified'}`} className="flex min-h-16 flex-col items-center justify-center rounded-lg border bg-canvas p-2 text-center"><span className="text-xs">{day.localDate.slice(-2)}</span>{day.status === 'DEFERRED' ? <ShieldCheck size={15} aria-hidden="true" /> : day.qualified ? <CheckCircle2 size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}</li>)}</ol>}
    </section>}
    {catalog.data && <div className="grid gap-4 lg:grid-cols-3">{catalog.data.data.map((definition) => <article key={definition.slug} className="flex flex-col rounded-2xl border border-black/5 bg-white p-5 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Swords aria-hidden="true" /></span><p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-500">{definition.difficulty} · {definition.days} days</p><h2 className="mt-1 text-xl font-semibold">{names[definition.slug] ?? definition.slug}</h2><p className="mt-2 text-sm text-ink-600">Complete {definition.requiredQualifyingDays} qualifying days.</p><p className="mt-2 text-xs leading-5 text-ink-500">{qualificationText(definition)}</p><div className="mt-4 flex justify-between text-sm"><span>Cost: {definition.costXp} XP</span><span>Reward: {definition.rewardXp} XP</span></div><p className="mt-1 text-xs text-ink-500">Level {definition.minLevel} required</p>
      <button type="button" disabled={!definition.eligible || Boolean(active) || start.isPending} onClick={() => start.mutate(definition.slug)} className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">{definition.eligible ? 'Start challenge' : reasonText[definition.reason ?? ''] ?? 'Not available'}</button></article>)}</div>}
    {catalog.data && catalog.data.runs.length > 0 && <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Challenge history</h2><ul className="mt-3 divide-y">{catalog.data.runs.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{names[entry.challengeSlug] ?? entry.challengeSlug}<span className="ml-2 text-xs text-ink-500">{entry.startDate} – {entry.endDate}</span></span><span className="font-medium">{entry.status.toLowerCase()} · {entry.qualifyingDays}/{entry.requiredDays} days · +{entry.xpAwarded} XP</span></li>)}</ul></section>}
  </section>;
}
