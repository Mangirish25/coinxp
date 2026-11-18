import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { GuestRoute } from './components/GuestRoute';
import { ProtectedRoute } from './components/ProtectedRoute';

const LandingPage = lazy(() => import('./pages/LandingPage').then(({ LandingPage }) => ({ default: LandingPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(({ RegisterPage }) => ({ default: RegisterPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })));
const MonthlyReportPage = lazy(() => import('./pages/MonthlyReportPage').then(({ MonthlyReportPage }) => ({ default: MonthlyReportPage })));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then(({ TransactionsPage }) => ({ default: TransactionsPage })));
const BudgetsPage = lazy(() => import('./pages/BudgetsPage').then(({ BudgetsPage }) => ({ default: BudgetsPage })));
const XpPage = lazy(() => import('./pages/XpPage').then(({ XpPage }) => ({ default: XpPage })));
const StreaksPage = lazy(() => import('./pages/StreaksPage').then(({ StreaksPage }) => ({ default: StreaksPage })));
const BadgesPage = lazy(() => import('./pages/BadgesPage').then(({ BadgesPage }) => ({ default: BadgesPage })));
const MissionsPage = lazy(() => import('./pages/MissionsPage').then(({ MissionsPage }) => ({ default: MissionsPage })));
const ShopPage = lazy(() => import('./pages/ShopPage').then(({ ShopPage }) => ({ default: ShopPage })));
const ChallengesPage = lazy(() => import('./pages/ChallengesPage').then(({ ChallengesPage }) => ({ default: ChallengesPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(({ ProfilePage }) => ({ default: ProfilePage })));
const ActivityPage = lazy(() => import('./pages/ActivityPage').then(({ ActivityPage }) => ({ default: ActivityPage })));

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<main aria-busy="true" aria-label="Loading page" className="mx-auto min-h-64 max-w-6xl p-6"><div className="h-9 w-48 animate-pulse motion-reduce:animate-none rounded-xl bg-white" /><div className="mt-6 h-56 animate-pulse motion-reduce:animate-none rounded-2xl bg-white" /></main>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LandingPage />} />
            <Route element={<GuestRoute />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="monthly-report" element={<MonthlyReportPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="budgets" element={<BudgetsPage />} />
              <Route path="xp" element={<XpPage />} />
              <Route path="streaks" element={<StreaksPage />} />
              <Route path="badges" element={<BadgesPage />} />
              <Route path="missions" element={<MissionsPage />} />
              <Route path="shop" element={<ShopPage />} />
              <Route path="challenges" element={<ChallengesPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="activity" element={<ActivityPage />} />
            </Route>
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
