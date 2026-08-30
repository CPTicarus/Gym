import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getRoleHome } from "../constants/navigation.js";
import { useAuth } from "../hooks/useAuth.js";

/**
 * With no `allowedRoles`, just requires being logged in.
 * With `allowedRoles`, also requires the user's role to be in that list —
 * anyone else is bounced to their own home route rather than shown a dead end.
 */
export default function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="page-loading">در حال بارگذاری…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={getRoleHome(role)} replace />;
  }

  return <Outlet />;
}
