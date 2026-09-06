/**
 * Mirrors can_manage_user() in apps/accounts/permissions.py.
 *
 * The server remains the authority — this only decides whether to OFFER an
 * action, so the UI doesn't put a button in front of someone that answers
 * 403 (or 404, for a record accounting can't even see). Change one of
 * these and change the other.
 */
export function canManageUser(actor, target) {
  if (!actor || !target) return false;
  // An admin may edit anyone but a fellow admin — themselves excepted.
  if (actor.role === "admin") return target.id === actor.id || target.role !== "admin";
  // Accounting runs the front desk: member records only.
  if (actor.role === "accounting") return target.role === "member";
  return false;
}
