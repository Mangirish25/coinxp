import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { GuestRoute } from './components/GuestRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MonthlyReportPage } from './pages/MonthlyReportPage';
import { RegisterPage } from './pages/RegisterPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { XpPage } from './pages/XpPage';
import { StreaksPage } from './pages/StreaksPage';
import { BadgesPage } from './pages/BadgesPage';
import { MissionsPage } from './pages/MissionsPage';
import { ShopPage } from './pages/ShopPage';
import { ChallengesPage } from './pages/ChallengesPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
