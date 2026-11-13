import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { gamificationApi } from '../services/gamificationApi';

export function GamificationSummaryCard() {
  const summary = useQuery({ queryKey: ['gamification', 'summary'], queryFn: gamificationApi.summary });
  const today = useQuery({ queryKey: ['gamification', 'daily-review', 'today'], queryFn: gamificationApi.today });
  const review = useMutation({ mutationFn: gamificationApi.review });
  const acknowledge = useMutation({ mutationFn: gamificationApi.acknowledge });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [noSpend, setNoSpend] = useState(false);
  if (summary.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-white" aria-label="Loading XP summary" />;
  if (summary.isError || !summary.data) return <section className="rounded-2xl border bg-white p-5"><p>XP summary is temporarily unavailable.</p><button className="mt-2 underline" onClick={() => void summary.refetch()}>Retry</button></section>;
  const data = summary.data;
  const latestUnseen = data.unseen.at(-1);
  const todayReview = review.data?.review ?? null;
  return <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm" aria-label="Gamification summary">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2 text-brand-700"><Sparkles aria-hidden="true" size={18} /></span><div><h2 className="font-semibold">Level {data.level} · {data.title}</h2><p className="text-sm text-ink-500">{data.lifetimeXp} lifetime XP · {data.spendableXp} spendable XP</p></div></div>
      <Link className="text-sm font-medium text-brand-700 underline" to="/xp">View XP history</Link>
    </div>
    <div className="mt-4" role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(data.progressBps / 100)}><div className="h-2 rounded-full bg-canvas"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, data.progressBps / 100)}%` }} /></div><p className="mt-1 text-xs text-ink-500">{data.xpIntoLevel} / {data.xpForNext} XP to the next level</p></div>
    {latestUnseen && <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm"><span>{latestUnseen.message} ({(latestUnseen.delta ?? latestUnseen.lifetimeDelta) > 0 ? '+' : ''}{latestUnseen.delta ?? latestUnseen.lifetimeDelta} XP)</span><button className="underline" onClick={() => acknowledge.mutate(latestUnseen.id)}>Got it</button></div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm text-ink-600">{todayReview?.completed || data.today.reviewCompleted ? 'Daily review completed.' : data.today.trackingCredited ? 'Your qualifying transaction counts toward today.' : 'Complete today’s review to record your progress.'}</p>{!data.today.reviewCompleted && !todayReview?.completed && today.data?.available && <button disabled={review.isPending} onClick={() => { setNoSpend(false); setReviewOpen(true); }} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Complete daily review</button>}</div>
    {review.isError && <p role="alert" className="mt-2 text-sm text-red-700">{review.error.message}</p>}
    {reviewOpen && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="daily-review-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 id="daily-review-title" className="text-xl font-semibold">Daily review</h2><p className="mt-2 text-sm text-ink-600">Confirm that today’s transactions reflect your money activity. This review is recorded once for your local date.</p>{today.data && !today.data.hasExpense && <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={noSpend} onChange={(event) => setNoSpend(event.target.checked)} />I had no expenses today.</label>}{review.isError && <p role="alert" className="mt-3 text-sm text-red-700">{review.error.message}</p>}<div className="mt-6 flex justify-end gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setReviewOpen(false)}>Cancel</button><button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={review.isPending} onClick={() => review.mutate(noSpend, { onSuccess: () => setReviewOpen(false) })}>{review.isPending ? 'Saving…' : 'Confirm review'}</button></div></section></div>}
  </section>;
}
