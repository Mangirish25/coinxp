import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { AppShell } from './components/AppShell';
import { GuestRoute } from './components/GuestRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RegisterPage } from './pages/RegisterPage';

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
              <Route
                path="dashboard"
                element={
                  <PlaceholderPage
                    title="Dashboard"
                    description="Your financial overview will take shape in a later part."
                  />
                }
              />
              <Route
                path="transactions"
                element={
                  <PlaceholderPage
                    title="Transactions"
                    description="Transaction management will be added in a later part."
                  />
                }
              />
              <Route
                path="budgets"
                element={
                  <PlaceholderPage
                    title="Budgets"
                    description="Budget management will be added in a later part."
                  />
                }
              />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
