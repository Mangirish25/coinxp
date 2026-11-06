import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Activity, ArrowLeftRight, LayoutDashboard, LogOut, WalletCards } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const links = [
  { to: '/', label: 'Home', icon: Activity },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: WalletCards },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        {user ? (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-black/5 pt-5">
            <span className="truncate text-sm font-medium text-ink-700" title={user.displayName}>
              {user.displayName}
            </span>
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
    </div>
  );
}
