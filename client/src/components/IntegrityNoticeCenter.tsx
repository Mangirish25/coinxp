import { useCallback, useEffect, useState } from 'react';
import { Bell, ShieldAlert } from 'lucide-react';
import { integrityApi } from '../services/integrityApi';
import type { IntegrityNotice, IntegrityStatus } from '../types/integrity';

export function IntegrityNoticeCenter() {
  const [status, setStatus] = useState<IntegrityStatus | null>(null);
  const [notices, setNotices] = useState<IntegrityNotice[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextNotices] = await Promise.all([integrityApi.status(), integrityApi.notices()]);
      setStatus(nextStatus);
      setNotices(nextNotices.data);
    } catch { setStatus(null); }
  }, []);
  useEffect(() => {
    if (open) void refresh();
    const handler = () => { if (open) void refresh(); };
    window.addEventListener('coinxp:integrity-refresh', handler);
    return () => window.removeEventListener('coinxp:integrity-refresh', handler);
  }, [open, refresh]);
  async function acknowledge() {
    const last = notices[0]?.id;
    if (last) await integrityApi.acknowledge(last);
    await refresh();
  }
  async function appeal(event: React.FormEvent) {
    event.preventDefault();
    try { await integrityApi.appeal(message); setMessage(''); setFeedback('Appeal submitted.'); await refresh(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Could not submit appeal.'); }
  }
  return (
    <div className="relative mt-4">
      <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink-500 hover:bg-canvas" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {status?.holdActive ? <ShieldAlert className="h-4 w-4" /> : <Bell className="h-4 w-4" />} Updates
        {status?.unreadNotices ? <span className="ml-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs text-white">{status.unreadNotices}</span> : null}
      </button>
      {open && <section aria-label="Account updates" className="absolute left-0 top-full z-40 mt-2 w-[min(90vw,24rem)] rounded-2xl border border-black/10 bg-white p-4 shadow-xl">
        {status?.holdActive && <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Some {status.scope === 'STREAK_XP' ? 'streak milestone' : 'outcome'} rewards are paused until {status.holdUntil ? new Date(status.holdUntil).toLocaleString() : 'review'}. Financial features are unaffected.</p>}
        <h2 className="font-semibold">Account updates</h2>
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">{notices.length ? notices.map((notice) => <article key={notice.id} className="border-b border-black/5 pb-3 text-sm">
          <p>{notice.message}</p><time className="mt-1 block text-xs text-ink-400">{new Date(notice.createdAt).toLocaleString()}</time>
        </article>) : <p className="text-sm text-ink-500">You're all caught up.</p>}</div>
        {status?.canAppeal && <form className="mt-3 space-y-2" onSubmit={(event) => void appeal(event)}><label className="block text-sm font-medium">Appeal<textarea className="mt-1 w-full rounded-xl border border-black/10 p-2" maxLength={500} required value={message} onChange={(event) => setMessage(event.target.value)} /></label><button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white">Submit appeal</button></form>}
        {feedback && <p role="status" className="mt-2 text-sm text-ink-600">{feedback}</p>}
        {status?.unreadNotices ? <button className="mt-3 text-sm font-medium text-brand-700 underline" onClick={() => void acknowledge()}>Mark updates read</button> : null}
      </section>}
    </div>
  );
}
