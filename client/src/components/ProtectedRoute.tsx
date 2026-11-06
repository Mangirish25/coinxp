import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <p role="status" className="text-sm text-ink-500">
        Restoring your session…
      </p>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
