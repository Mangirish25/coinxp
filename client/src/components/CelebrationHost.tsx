import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Flame, Sparkles, X } from 'lucide-react';
import { activityApi } from '../services/activityApi';
import { celebrationApi } from '../services/celebrationApi';
import { celebrationPlan, type PlannedCelebration } from '../celebrations/celebrationPlan';
import { celebration } from '../visuals/visuals.config';
import { useMotionPreferences } from '../motion/MotionProvider';

function headingFor(item: PlannedCelebration) {
  const { code, data } = item.notice;
  if (code.startsWith('STREAK_MILESTONE')) return `${Number(data.length ?? data.milestone)} day streak`;
  if (code === 'BADGE_UNLOCKED') return 'Badge unlocked';
  if (code === 'CHALLENGE_COMPLETED') return 'Challenge completed';
  if (code === 'LEVEL_UP') return data.titleChanged === true ? 'New level and title' : 'Level up';
  return 'A progress update';
}

function textFor(item: PlannedCelebration) {
  const { code, data } = item.notice;
  if (code.startsWith('STREAK_MILESTONE')) return `You reached ${Number(data.length ?? data.milestone)} tracked days.`;
  if (code === 'BADGE_UNLOCKED') return `You earned ${String(data.slug ?? 'a badge').replaceAll('_', ' ')}.`;
  if (code === 'CHALLENGE_COMPLETED') return 'You completed your challenge.';
  if (code === 'MISSION_COMPLETED') return 'You completed a mission.';
  if (code === 'DAY_RECAP') return 'Your settled progress is ready to review.';
  if (code === 'STREAK_BROKEN') return 'A streak ended. You can begin again when you are ready.';
  return 'Your progress has been recorded.';
}

function isTyping() {
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.matches('input,textarea,select,[contenteditable="true"]'));
}

export function CelebrationHost({ userId }: { userId: number | null }) {
  const { preferences: uiPreferences } = useMotionPreferences();
  const pending = useQuery({ queryKey: ['celebrations', 'pending', userId], queryFn: celebrationApi.pending,
    enabled: userId !== null, refetchInterval: () => document.visibilityState === 'visible' ? celebration.pollMsVisible : false,
    refetchOnWindowFocus: true });
  const preferences = useQuery({ queryKey: ['notifications', 'preferences', userId], queryFn: activityApi.preferences, enabled: userId !== null });
  const seen = useRef(new Set<number>());
  const dialog = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<PlannedCelebration[]>([]);
  const [index, setIndex] = useState(0);
  const [showRecap, setShowRecap] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const [suspended, setSuspended] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'visible' || isTyping());

  useEffect(() => {
    const update = () => setSuspended(document.visibilityState !== 'visible' || isTyping());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => { document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update);
      window.removeEventListener('blur', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, []);

  useEffect(() => {
    const fresh = (pending.data?.data ?? []).filter(({ id }) => !seen.current.has(id));
    if (!fresh.length || items.length || showRecap || preferences.isLoading) return;
    const mutedCategories = (preferences.data?.preferences ?? []).filter(({ enabled }) => !enabled).map(({ category }) => category);
    const plan = celebrationPlan(fresh, { celebrations: uiPreferences.celebrations, mutedCategories });
    const next = [...plan.fullScreen, ...plan.recap];
    if (next.length) { setItems(next); setIndex(0); setShowRecap(plan.fullScreen.length === 0); }
  }, [pending.data, preferences.data, preferences.isLoading, items.length, showRecap, uiPreferences.celebrations]);

  const current = items[index];
  const displayed = showRecap ? items.at(-1) : current;
  const recapRows = items.filter(({ fullScreen }) => !fullScreen);

  async function finish() {
    for (const item of items) seen.current.add(item.notice.id);
    const high = Math.max(...items.map(({ notice }) => notice.id));
    try { await celebrationApi.acknowledge(high); } catch { /* A session-local seen set prevents replay while retry can happen at next focus. */ }
    setItems([]); setIndex(0); setShowRecap(false); setCanSkip(false);
    await pending.refetch().catch(() => undefined);
  }

  function advance() {
    if (showRecap) { void finish(); return; }
    setCanSkip(false);
    const fullScreenCount = items.filter(({ fullScreen }) => fullScreen).length;
    const recapCount = items.length - fullScreenCount;
    if (index + 1 < fullScreenCount) setIndex((value) => value + 1);
    else if (recapCount > 0) setShowRecap(true);
    else void finish();
  }

  useEffect(() => {
    if (!displayed || suspended) return undefined;
    const skipTimer = window.setTimeout(() => setCanSkip(true), celebration.skipAfterMs);
    const durationTimer = window.setTimeout(advance, displayed.durationMs);
    return () => { window.clearTimeout(skipTimer); window.clearTimeout(durationTimer); };
  }, [displayed, suspended, index, showRecap]);

  useEffect(() => {
    if (!displayed || suspended) return;
    dialog.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && canSkip) { event.preventDefault(); advance(); }
      if (event.key !== 'Tab') return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [displayed, suspended, canSkip]);

  if (!displayed || suspended) return null;
  const xpTotal = items.reduce((total, item) => {
    const value = item.notice.data.xpDelta ?? item.notice.data.xp;
    return typeof value === 'number' && Number.isSafeInteger(value) ? total + value : total;
  }, 0);
  const Icon = displayed.notice.code.startsWith('STREAK') ? Flame : displayed.notice.code === 'BADGE_UNLOCKED' ? Award : Sparkles;

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-ink-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && canSkip) advance(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="celebration-title" aria-describedby="celebration-copy" tabIndex={-1}
      className="w-full max-w-lg rounded-3xl border border-brand-100 bg-white p-7 text-center shadow-2xl motion-safe:animate-[celebration-enter_320ms_ease-out] focus:outline-none sm:p-10">
      <div aria-hidden="true" className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon size={38} /></div>
      {showRecap ? <>
        <h2 id="celebration-title" className="mt-5 text-2xl font-semibold">While you were away</h2>
        <p id="celebration-copy" className="mt-2 text-sm text-ink-600">Your recent progress is here when you are ready.</p>
        {xpTotal !== 0 && <p className="mt-4 text-xl font-semibold tabular-nums">{xpTotal > 0 ? '+' : ''}{xpTotal} XP</p>}
        <ul className="mt-4 space-y-2 text-left text-sm">{recapRows.map(({ notice }) => <li key={notice.id} className="rounded-xl bg-canvas px-4 py-3">{textFor({ notice, fullScreen: false, durationMs: 0, priority: 0 })}</li>)}</ul>
      </> : <>
        <h2 id="celebration-title" className="mt-5 text-2xl font-semibold">{headingFor(displayed)}</h2>
        <p id="celebration-copy" aria-live="polite" className="mt-2 text-sm text-ink-600">{textFor(displayed)}</p>
      </>}
      <div className="mt-7 flex justify-center gap-3"><button type="button" disabled={!showRecap && !canSkip} onClick={advance} className="min-h-11 rounded-xl bg-brand-700 px-5 py-2 font-medium text-white disabled:opacity-60">{showRecap ? 'Continue' : 'Skip'}</button>
        {showRecap && <button type="button" aria-label="Close celebration recap" onClick={() => void finish()} className="grid min-h-11 min-w-11 place-items-center rounded-xl border"><X aria-hidden="true" /></button>}</div>
    </section>
  </div>;
}
