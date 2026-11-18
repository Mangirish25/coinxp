import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { activityApi } from '../services/activityApi';

interface ToastDetail { id: number; text: string }

export function GamificationToastHost({ userId }: { userId: number | null }) {
  const [toast, setToast] = useState<ToastDetail | null>(null);
  useEffect(() => {
    let id = 0;
    let mutedCategories = new Set<string>();
    const setPreferences=(preferences:Array<{category:string;enabled:boolean}>)=>{mutedCategories=new Set(preferences.filter(({enabled})=>!enabled).map(({category})=>category));};
    const preferenceChange=(event:Event)=>setPreferences((event as CustomEvent<Array<{category:string;enabled:boolean}>>).detail??[]);
    if(userId!==null)void activityApi.preferences().then(({preferences})=>setPreferences(preferences)).catch(()=>undefined);
    const show = (text: string) => {
      id += 1;
      const toastId = id;
      setToast({ id: toastId, text });
      window.setTimeout(() => setToast((current) => current?.id === toastId ? null : current), 5000);
    };
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ xpDelta?: number; levelUp?: { to: number; title: string } | null }>).detail;
      if (!detail || !detail.xpDelta) return;
      const xp = `${detail.xpDelta > 0 ? '+' : ''}${detail.xpDelta} XP`;
      const level = detail.levelUp ? ` · Level ${detail.levelUp.to}: ${detail.levelUp.title}` : '';
      show(`${xp}${level}`);
    };
    const handleStreak = (event: Event) => {
      if(mutedCategories.has('STREAK'))return;
      const detail = (event as CustomEvent<{ eventId: string; text: string }>).detail;
      if (!detail?.eventId || !detail.text) return;
      const key = `coinxp:streak-toast:${detail.eventId}`;
      try {
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, 'seen');
      } catch { /* session storage is an optional de-duplication aid */ }
      show(detail.text);
    };
    window.addEventListener('coinxp:gamification-toast', handle);
    window.addEventListener('coinxp:streak-toast', handleStreak);
    window.addEventListener('coinxp:notification-preferences-changed',preferenceChange);
    return () => {
      window.removeEventListener('coinxp:gamification-toast', handle);
      window.removeEventListener('coinxp:streak-toast', handleStreak);
      window.removeEventListener('coinxp:notification-preferences-changed',preferenceChange);
    };
  }, [userId]);
  if (!toast) return null;
  return <div role="status" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border border-brand-200 bg-white px-4 py-3 shadow-lg"><Sparkles aria-hidden="true" className="text-brand-700" size={18} /><span className="text-sm font-medium">{toast.text}</span><button aria-label="Dismiss XP update" className="ml-auto text-ink-500" onClick={() => setToast(null)}><X size={16} /></button></div>;
}
