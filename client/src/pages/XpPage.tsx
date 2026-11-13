import { useQuery } from '@tanstack/react-query';
import { GamificationSummaryCard } from '../components/GamificationSummaryCard';
import { gamificationApi } from '../services/gamificationApi';

export function XpPage() {
  const ledger = useQuery({ queryKey: ['gamification', 'ledger'], queryFn: () => gamificationApi.ledger() });
  const rules = useQuery({ queryKey: ['gamification', 'rules'], queryFn: gamificationApi.rules });
  return <section className="mx-auto max-w-4xl space-y-6">
    <header><p className="text-sm font-medium text-brand-600">Progress</p><h1 className="mt-2 text-3xl font-semibold">XP history</h1><p className="mt-2 text-sm text-ink-500">Your level is based on lifetime XP. Reversals keep a permanent record when an earlier action is changed.</p></header>
    <GamificationSummaryCard />
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">How XP works</h2>{rules.isLoading ? <p className="mt-2 text-sm text-ink-500">Loading current rules…</p> : rules.isError ? <p role="alert" className="mt-2 text-sm text-red-700">XP rules could not be loaded.</p> : <p className="mt-2 text-sm text-ink-600">XP is earned for eligible transaction tracking, daily reviews, daily limit adherence, weekly consistency and monthly budget completion. Daily XP has a combined cap. A rule is recorded once per eligible period.</p>}</section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Ledger</h2>{ledger.isLoading ? <p className="mt-3 text-sm text-ink-500">Loading XP entries…</p> : ledger.isError ? <div role="alert" className="mt-3 text-sm text-red-700">XP history could not be loaded. <button className="underline" onClick={() => void ledger.refetch()}>Retry</button></div> : ledger.data?.data.length ? <ol className="mt-3 divide-y divide-black/5">{ledger.data.data.map((entry) => <li key={entry.id} className="flex items-start justify-between gap-3 py-3"><span><strong className="block text-sm">{entry.message}</strong><span className="text-xs text-ink-500">{entry.createdAt} · {entry.ruleId ?? entry.entryType}</span>{entry.note && <span className="block text-xs text-ink-500">{entry.note}</span>}</span><strong className={entry.lifetimeDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}>{entry.lifetimeDelta > 0 ? '+' : ''}{entry.lifetimeDelta} XP</strong></li>)}</ol> : <p className="mt-3 text-sm text-ink-500">No XP entries yet. Eligible actions will appear here.</p>}</section>
  </section>;
}
