// Longest a plan name may be — matches `name` on all three plan models.
const MAX_PLAN_NAME = 100;
const COPY_SUFFIX = "(کپی)";

/**
 * The default name for a duplicate.
 *
 * Built here rather than server-side so the suffix can be Persian without
 * putting UI language in the backend. Names are trimmed from the BASE, so
 * duplicating a duplicate of a duplicate keeps the suffix that says what
 * the record is instead of losing it off the end. The API applies the same
 * rule to whatever it's sent, as a backstop.
 */
export function copyPlanName(name) {
  const candidate = `${name} ${COPY_SUFFIX}`;
  if (candidate.length <= MAX_PLAN_NAME) return candidate;
  const keep = MAX_PLAN_NAME - COPY_SUFFIX.length - 1;
  return `${name.slice(0, keep).trimEnd()} ${COPY_SUFFIX}`;
}
