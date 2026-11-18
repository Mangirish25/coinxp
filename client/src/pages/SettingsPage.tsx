import { Pause, Play, Volume2, Vibrate } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMotionPreferences } from '../motion/MotionProvider';
import { apiDownload, apiFetch } from '../services/api';

function validNewPassword(password: string) {
  return password.length >= 8 && password.length <= 128 && /\p{L}/u.test(password) && /[0-9]/.test(password);
}

export function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { preferences, effectiveMode, quality, saving, error, setMotionMode, setCelebrations, setSound, setHaptics } = useMotionPreferences();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAccountMessage(null); setAccountError(null);
    if (!validNewPassword(newPassword)) { setAccountError('Use 8–128 characters with at least one letter and one number.'); return; }
    setPasswordBusy(true);
    try {
      await apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(''); setNewPassword(''); setAccountMessage('Your password was changed. Other signed-in sessions have been closed.');
    } catch (cause) { setAccountError(cause instanceof Error ? cause.message : 'Could not change your password.'); }
    finally { setPasswordBusy(false); }
  }
  async function downloadAccount() {
    setAccountMessage(null); setAccountError(null);
    try { await apiDownload('/api/account/export', 'coinxp-export.json'); setAccountMessage('Your private account export has been downloaded.'); }
    catch (cause) { setAccountError(cause instanceof Error ? cause.message : 'Could not export your account.'); }
  }
  async function scheduleDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAccountMessage(null); setAccountError(null);
    if (!window.confirm('Schedule your CoinXP account and data for deletion after the 30-day grace period? You can restore it during that period.')) return;
    setDeleting(true);
    try {
      await apiFetch<{ scheduledFor: string }>('/api/account', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }) });
      setDeletePassword('');
      await logout();
      navigate('/login', { replace: true, state: { accountDeletionScheduled: true } });
    } catch (cause) { setAccountError(cause instanceof Error ? cause.message : 'Could not schedule account deletion.'); }
    finally { setDeleting(false); }
  }
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
    <section className="space-y-5 rounded-2xl border bg-white p-5" aria-labelledby="account-security-title"><div><h2 id="account-security-title" className="font-semibold">Account security and privacy</h2><p className="mt-1 text-sm text-ink-600">Change your password or download a copy of your CoinXP data.</p></div>
      <form onSubmit={(event) => void changePassword(event)} className="space-y-3">
        <label className="block text-sm font-medium">Current password<input autoComplete="current-password" required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
        <label className="block text-sm font-medium">New password<input autoComplete="new-password" required minLength={8} maxLength={128} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-describedby="new-password-help" className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
        <p id="new-password-help" className="text-xs text-ink-500">8–128 characters, with at least one letter and one number.</p>
        <button type="submit" disabled={passwordBusy || !currentPassword || !newPassword} className="min-h-11 rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{passwordBusy ? 'Changing…' : 'Change password'}</button>
      </form>
      <div className="border-t pt-4"><button type="button" onClick={() => void downloadAccount()} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-medium">Download my account data</button><p className="mt-2 text-xs text-ink-500">Exports are private and limited to one request per hour.</p></div>
      <form onSubmit={(event) => void scheduleDeletion(event)} className="space-y-3 border-t border-rose-100 pt-4">
        <div><h3 className="font-medium text-rose-900">Delete account</h3><p className="mt-1 text-sm text-ink-600">Deletion is scheduled 30 days ahead. Signing in during the grace period lets you restore your account.</p></div>
        <label className="block text-sm font-medium">Confirm with your current password<input type="password" required autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border px-3" /></label>
        <button type="submit" disabled={deleting || !deletePassword} className="min-h-11 rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-900 disabled:opacity-50">{deleting ? 'Scheduling…' : 'Schedule account deletion'}</button>
      </form>
      {accountError && <p role="alert" className="text-sm text-red-700">{accountError}</p>}
      {accountMessage && <p role="status" className="text-sm text-emerald-800">{accountMessage}</p>}
    </section>
    <p role="status" aria-live="polite" className="text-sm text-ink-500">{saving ? 'Saving settings…' : 'Settings are saved automatically.'}</p>
  </section>;
}
