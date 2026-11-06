import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function GuestRoute() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <p role="status" className="text-sm text-ink-500">
        Restoring your session…
      </p>
    );
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
