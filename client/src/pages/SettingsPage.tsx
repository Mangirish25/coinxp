import { Pause, Play, Volume2, Vibrate } from 'lucide-react';
import { useMotionPreferences } from '../motion/MotionProvider';

export function SettingsPage() {
  const { preferences, effectiveMode, quality, saving, error, setMotionMode, setCelebrations, setSound, setHaptics } = useMotionPreferences();
  return <section className="mx-auto max-w-3xl space-y-6">
    <header><p className="text-sm font-medium text-brand-700">A calmer CoinXP</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1><p className="mt-2 text-sm text-ink-600">Choose how progress updates move and sound. These settings never change financial records or actions.</p></header>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="motion-settings-title">
      <div className="flex items-start justify-between gap-4"><div><h2 id="motion-settings-title" className="font-semibold">Motion</h2><p className="mt-1 text-sm text-ink-600">Effective mode: {effectiveMode.toLowerCase()} · quality: {quality.toLowerCase()}</p></div>
        <button type="button" aria-pressed={preferences.motionMode === 'OFF'} onClick={() => void setMotionMode(preferences.motionMode === 'OFF' ? 'SYSTEM' : 'OFF')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">{preferences.motionMode === 'OFF' ? <Play size={16} /> : <Pause size={16} />}{preferences.motionMode === 'OFF' ? 'Resume motion' : 'Pause animations'}</button></div>
      <label className="mt-5 block text-sm font-medium">Motion preference<select className="mt-2 block min-h-11 w-full rounded-xl border border-black/10 bg-white px-3" value={preferences.motionMode} disabled={saving} onChange={(event) => void setMotionMode(event.target.value as typeof preferences.motionMode)}>
        <option value="SYSTEM">System setting</option><option value="FULL">Full motion</option><option value="REDUCED">Reduced motion</option><option value="OFF">Off</option>
      </select></label>
      <p className="mt-2 text-xs text-ink-500">Reduced and off modes keep every label, number, and status visible. System mode follows your device preference.</p>
    </section>
    <section className="rounded-2xl border bg-white p-5" aria-labelledby="celebration-settings-title"><h2 id="celebration-settings-title" className="font-semibold">Celebrations</h2><label className="mt-4 block text-sm font-medium">Show<select className="mt-2 block min-h-11 w-full rounded-xl border border-black/10 bg-white px-3" value={preferences.celebrations} disabled={saving} onChange={(event) => void setCelebrations(event.target.value as typeof preferences.celebrations)}>
      <option value="ALL">All updates</option><option value="MAJOR">Major milestones only</option><option value="OFF">Summary toasts only</option>
    </select></label><p className="mt-2 text-xs text-ink-500">Muted notification categories stay available in Account Updates.</p></section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Optional device feedback</h2><label className="mt-4 flex min-h-11 items-center justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2"><Volume2 size={17} aria-hidden="true" />Sound</span><input type="checkbox" checked={preferences.sound} disabled={saving} onChange={(event) => void setSound(event.target.checked)} /></label><label className="mt-2 flex min-h-11 items-center justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2"><Vibrate size={17} aria-hidden="true" />Haptic feedback</span><input type="checkbox" checked={preferences.haptics} disabled={saving} onChange={(event) => void setHaptics(event.target.checked)} /></label><p className="mt-2 text-xs text-ink-500">Sound has no audio assets yet. Haptics are only used where the device supports vibration.</p></section>
    <p role="status" aria-live="polite" className="text-sm text-ink-500">{saving ? 'Saving settings…' : 'Settings are saved automatically.'}</p>
  </section>;
}
