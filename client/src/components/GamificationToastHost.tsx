import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

interface ToastDetail { id: number; text: string }

export function GamificationToastHost() {
  const [toast, setToast] = useState<ToastDetail | null>(null);
  useEffect(() => {
    let id = 0;
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ xpDelta?: number; levelUp?: { to: number; title: string } | null }>).detail;
      if (!detail || !detail.xpDelta) return;
      id += 1;
      const xp = `${detail.xpDelta > 0 ? '+' : ''}${detail.xpDelta} XP`;
      const level = detail.levelUp ? ` · Level ${detail.levelUp.to}: ${detail.levelUp.title}` : '';
      setToast({ id, text: `${xp}${level}` });
      window.setTimeout(() => setToast((current) => current?.id === id ? null : current), 5000);
    };
    window.addEventListener('coinxp:gamification-toast', handle);
    return () => window.removeEventListener('coinxp:gamification-toast', handle);
  }, []);
  if (!toast) return null;
  return <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-lg"><Sparkles aria-hidden="true" className="text-brand-700" size={18} /><span className="text-sm font-medium">{toast.text}</span><button aria-label="Dismiss XP update" className="ml-auto text-ink-500" onClick={() => setToast(null)}><X size={16} /></button></div>;
}
