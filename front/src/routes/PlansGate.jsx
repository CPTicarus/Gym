import { Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";
import PlansLockedPage from "../pages/my/PlansLockedPage.jsx";

/**
 * Stands in front of a member's plan pages. In a self sign-up gym their
 * plans stay closed until they've paid: the server answers those pages
 * with a 402 (PlansUnlocked), and this shows the member why instead.
 *
 * It reads `plans_locked` off the profile, which the server only ever sets
 * in that kind of gym, so in a staff-managed one everyone goes straight
 * through.
 */
export default function PlansGate() {
  const { user } = useAuth();
  return user?.plans_locked ? <PlansLockedPage /> : <Outlet />;
}
