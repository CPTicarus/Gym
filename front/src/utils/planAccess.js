/**
 * Where a member of a self sign-up gym stands while their plans are locked
 * (User.plans_locked on the backend), read off their profile:
 *
 *   "lapsed"        paid before, and the membership has since run out
 *   "measurements"  new, without a height and weight yet, so the trainer
 *                   has nothing to write a plan from
 *   "preparing"     measurements in, nothing assigned yet
 *   "ready"         a plan is assigned and waiting on payment
 *
 * Null when nothing is locked, which in a staff-managed gym is always.
 * PlansLockedPage and the welcome note on "my body" both read this, so the
 * two can't disagree about what someone should do next.
 */
export function planLockStage(user) {
  if (!user?.plans_locked) return null;
  // Locked with an end date means the date has passed.
  if (user.membership_end_date) return "lapsed";
  if (user.height_cm == null || user.latest_weight_kg == null) return "measurements";
  return user.plan_ready ? "ready" : "preparing";
}
