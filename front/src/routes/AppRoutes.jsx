import { Navigate, Route, Routes } from "react-router-dom";

import { getRoleHome } from "../constants/navigation.js";
import { useAuth } from "../hooks/useAuth.js";
import AppLayout from "../layouts/AppLayout.jsx";
import AccountingPage from "../pages/accounting/AccountingPage.jsx";
import LoginPage from "../pages/auth/LoginPage.jsx";
import DashboardPage from "../pages/dashboard/DashboardPage.jsx";
import DietBuilderPage from "../pages/diet/DietBuilderPage.jsx";
import DietListPage from "../pages/diet/DietListPage.jsx";
import MoveFormPage from "../pages/moves/MoveFormPage.jsx";
import MoveListPage from "../pages/moves/MoveListPage.jsx";
import MyDietPlansPage from "../pages/my/MyDietPlansPage.jsx";
import MyWorkoutPlansPage from "../pages/my/MyWorkoutPlansPage.jsx";
import PlanBuilderPage from "../pages/plans/PlanBuilderPage.jsx";
import PlanListPage from "../pages/plans/PlanListPage.jsx";
import SettingsPage from "../pages/settings/SettingsPage.jsx";
import UserDetailPage from "../pages/users/UserDetailPage.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

// Index route ("/") sends each role to its own home instead of a fixed
// path — staff land on the dashboard, members on their assigned plan.
function RoleHome() {
  const { role } = useAuth();
  return <Navigate to={getRoleHome(role)} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<RoleHome />} />

          {/* Staff-only: user dashboard */}
          <Route element={<ProtectedRoute allowedRoles={["trainer", "admin", "accounting"]} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/users/:userId" element={<UserDetailPage />} />
          </Route>

          {/* Trainer/admin: plan + diet builders */}
          <Route element={<ProtectedRoute allowedRoles={["trainer", "admin"]} />}>
            <Route path="/plans" element={<PlanListPage />} />
            <Route path="/plans/:planId" element={<PlanBuilderPage />} />
            <Route path="/diet" element={<DietListPage />} />
            <Route path="/diet/:planId" element={<DietBuilderPage />} />
            <Route path="/moves/new" element={<MoveFormPage />} />
            <Route path="/moves/:moveId/edit" element={<MoveFormPage />} />
          </Route>

          {/* Admin + accounting only */}
          <Route element={<ProtectedRoute allowedRoles={["admin", "accounting"]} />}>
            <Route path="/accounting" element={<AccountingPage />} />
          </Route>

          {/* Member-facing read-only views of what's assigned to them */}
          <Route element={<ProtectedRoute allowedRoles={["member"]} />}>
            <Route path="/my-plans" element={<MyWorkoutPlansPage />} />
            <Route path="/my-diet" element={<MyDietPlansPage />} />
          </Route>

          {/* Open to every authenticated role */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/moves" element={<MoveListPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
