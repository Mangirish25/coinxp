import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getAuthReturnPath } from '../pages/authPageUtils';

export function GuestRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <p role="status" className="text-sm text-ink-500">
        Restoring your session…
      </p>
    );
  if (user) return <Navigate to={getAuthReturnPath(location.state)} replace />;
  return <Outlet />;
}
