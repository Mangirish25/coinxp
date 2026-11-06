import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route
            path="login"
            element={
              <PlaceholderPage
                title="Welcome back"
                description="Sign-in will be added in Part 2."
              />
            }
          />
          <Route
            path="register"
            element={
              <PlaceholderPage
                title="Create your account"
                description="Registration will be added in Part 2."
              />
            }
          />
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
      </Routes>
    </BrowserRouter>
  );
}
