import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Activity, ArrowLeftRight, LayoutDashboard, LogOut, WalletCards, Sparkles, Flame, Award, Target, ShoppingBag, Swords, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GamificationToastHost } from './GamificationToastHost';
import { IntegrityNoticeCenter } from './IntegrityNoticeCenter';
import { profileApi } from '../services/profileApi';
import { themeTokens, type ThemeKey } from '../themeTokens';

function applyTheme(slug: string | null | undefined) {
  const key = (slug && slug in themeTokens ? slug : 'default') as ThemeKey;
  const tokens = themeTokens[key];
  document.body.dataset.theme = key;
  for (const [name,value] of Object.entries(tokens)) document.body.style.setProperty(`--coinxp-${name.replace(/([a-z])([0-9])/g,'$1-$2')}`,value);
}

const links = [
  { to: '/', label: 'Home', icon: Activity },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: WalletCards },
  { to: '/xp', label: 'XP', icon: Sparkles },
  { to: '/streaks', label: 'Streaks', icon: Flame },
  { to: '/badges', label: 'Badges', icon: Award },
  { to: '/missions', label: 'Missions', icon: Target },
  { to: '/shop', label: 'XP Shop', icon: ShoppingBag },
  { to: '/challenges', label: 'Challenges', icon: Swords },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/activity', label: 'Activity', icon: Activity },
];

export function AppShell() {
  const { user, logout, changeTimezone } = useAuth();
  const navigate = useNavigate();
  const [timezone, setTimezone] = useState(user?.timezone ?? 'Asia/Kolkata');
  const [timezoneMessage, setTimezoneMessage] = useState('');
  useEffect(() => { if (user?.timezone) setTimezone(user.timezone); }, [user?.timezone]);
  useEffect(() => {
    let active=true;
    const changed=(event:Event)=>applyTheme((event as CustomEvent<string|null>).detail);
    window.addEventListener('coinxp:theme-change',changed);
    if(user) void profileApi.get().then((profile)=>{if(active)applyTheme(profile.equippedTheme);}).catch(()=>{if(active)applyTheme(null);});
    else applyTheme(null);
    return ()=>{active=false;window.removeEventListener('coinxp:theme-change',changed);};
  },[user?.id]);

  async function handleLogout() {
    await logout().catch(() => undefined);
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-canvas text-ink-900 md:flex">
      <aside className="border-b border-black/5 bg-white px-5 py-4 md:flex md:w-64 md:flex-col md:border-b-0 md:border-r md:px-6 md:py-8">
        <NavLink to="/" className="text-xl font-semibold tracking-tight">
          Coin<span className="text-brand-600">XP</span>
        </NavLink>
        <nav
          aria-label="Main navigation"
          className="mt-5 flex gap-2 overflow-x-auto md:mt-12 md:flex-col"
        >
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-500 hover:bg-canvas hover:text-ink-900'}`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        {user && <IntegrityNoticeCenter />}
        {user ? (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-black/5 pt-5">
            <div className="min-w-0"><span className="block truncate text-sm font-medium text-ink-700" title={user.displayName}>{user.displayName}</span>
              <label className="mt-2 block text-xs text-ink-500">Time zone<input aria-label="Time zone" list="coinxp-timezones" className="mt-1 block w-full max-w-40 rounded border px-2 py-1" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><datalist id="coinxp-timezones">{['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'].map((zone) => <option key={zone} value={zone} />)}</datalist></label>
              <button type="button" className="mt-1 text-xs text-brand-700 underline" onClick={() => changeTimezone(timezone).then(() => setTimezoneMessage('Time zone updated.')).catch((error: Error) => setTimezoneMessage(error.message))}>Save time zone</button>{timezoneMessage && <span role="status" className="mt-1 block text-xs">{timezoneMessage}</span>}</div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-ink-500 hover:bg-canvas hover:text-ink-900"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        ) : (
          <div className="mt-6 flex gap-2 border-t border-black/5 pt-5">
            <NavLink
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-canvas"
            >
              Sign in
            </NavLink>
            <NavLink
              to="/register"
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Create account
            </NavLink>
          </div>
        )}
        <div className="mt-auto hidden rounded-card bg-canvas p-4 text-sm leading-6 text-ink-500 md:block">
          A calmer way to build healthier money habits.
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-12">
        <Outlet />
      </main>
      <GamificationToastHost userId={user?.id??null} />
    </div>
  );
}
