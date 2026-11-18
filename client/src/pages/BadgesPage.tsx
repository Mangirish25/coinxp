import { useQuery } from '@tanstack/react-query';
import { Award, LockKeyhole } from 'lucide-react';
import { badgeApi } from '../services/badgeApi';
import type { BadgeFamily } from '../types/rewards';

const categoryLabels: Record<string, string> = {
  TRACKING: 'Tracking', STREAK: 'Consistency', BUDGET: 'Budget habits',
  PROGRESS: 'Progress', CHALLENGE: 'Challenges', HABIT: 'Healthy habits',
};

function titleFor(slug: string) {
  return slug.split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

function BadgeCard({ badge }: { badge: BadgeFamily }) {
  const earned = badge.tiers.filter(({ status }) => status === 'ACTIVE').length;
  const next = badge.tiers.find(({ status }) => status === 'LOCKED');
  const progress = next ? Math.min(100, Math.floor((badge.metricValue * 100) / next.threshold)) : 100;
  return <article className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${earned ? 'bg-brand-50 text-brand-700' : 'bg-canvas text-ink-500'}`}><Award aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-wide text-ink-500">{categoryLabels[badge.category] ?? badge.category}</p><h2 className="mt-1 font-semibold">{titleFor(badge.slug)}</h2></div>
      <span className="text-xs text-ink-500">{earned} / {badge.tiers.length} tiers</span>
    </div>
    {badge.type === 'REPEATABLE' && <p className="mt-4 text-sm">Earned {badge.timesEarned} times · XP reward is paid on the first earning.</p>}
    <ol className="mt-4 space-y-2" aria-label={`${titleFor(badge.slug)} tiers`}>
      {badge.tiers.map((tier) => <li key={tier.tier} className="flex items-center justify-between gap-3 rounded-lg bg-canvas/70 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">{tier.status === 'ACTIVE' ? <Award size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}<span>{['Bronze', 'Silver', 'Gold', 'Platinum'][tier.tier - 1] ?? `Tier ${tier.tier}`} · {tier.rarity.toLowerCase()}</span></span>
        <span className="shrink-0 text-xs text-ink-500">{tier.status === 'ACTIVE' ? `Earned ${tier.achievedOn ?? ''}` : `${tier.threshold} ${badge.metric === 'REVIEWS_COMPLETED' ? 'reviews' : badge.metric === 'LEVEL' ? 'level' : 'progress'} · ${tier.xp} XP`}</span>
      </li>)}
    </ol>
    {next && <div className="mt-4"><div className="flex justify-between text-xs text-ink-500"><span>Progress</span><span>{badge.metricValue} / {next.threshold}</span></div><div role="progressbar" aria-label={`${titleFor(badge.slug)} next tier`} aria-valuemin={0} aria-valuemax={next.threshold} aria-valuenow={Math.min(badge.metricValue, next.threshold)} className="mt-2 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-brand-600 transition-[width] motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div></div>}
  </article>;
}

export function BadgesPage() {
  const catalog = useQuery({ queryKey: ['badges', 'catalog'], queryFn: badgeApi.catalog });
  const categories = [...new Set(catalog.data?.data.map(({ category }) => category) ?? [])];
  return <section className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-sm font-medium text-brand-600">Small wins, built over time</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Badges</h1><p className="mt-2 max-w-2xl text-sm text-ink-500">Badges come from recorded habits and settled progress. Earned badges stay in your collection.</p></header>
    {catalog.isLoading && <div aria-label="Loading badges" className="grid gap-4 md:grid-cols-2"><div className="h-60 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" /><div className="h-60 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" /></div>}
    {catalog.isError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">Badges could not load. <button className="underline" onClick={() => void catalog.refetch()}>Retry</button></div>}
    {catalog.data && <>
      {catalog.data.hiddenRemaining > 0 && <p className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm"><LockKeyhole size={16} aria-hidden="true" />{catalog.data.hiddenRemaining} hidden {catalog.data.hiddenRemaining === 1 ? 'badge remains' : 'badges remain'} undiscovered.</p>}
      {catalog.data.data.length === 0 && <p className="rounded-2xl border bg-white p-6 text-sm text-ink-600">Your badge collection will grow as you build steady money habits.</p>}
      {categories.map((category) => <section key={category} aria-labelledby={`badge-${category}`}><h2 id={`badge-${category}`} className="mb-3 text-lg font-semibold">{categoryLabels[category] ?? category}</h2><div className="grid gap-4 lg:grid-cols-2">{catalog.data?.data.filter((badge) => badge.category === category).map((badge) => <BadgeCard key={badge.slug} badge={badge} />)}</div></section>)}
    </>}
  </section>;
}
