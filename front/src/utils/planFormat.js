// Shared display formatters for plan contents. Kept here rather than
// exported from a page/component file so the member-facing read-only
// views don't have to import a whole builder page just to reuse them.

export function formatExerciseDetail(ex) {
  const parts = [];
  if (ex.sets) parts.push(`${ex.sets} ست`);
  if (ex.reps) parts.push(`${ex.reps} تکرار`);
  if (ex.duration_seconds) parts.push(`${ex.duration_seconds} ثانیه`);
  if (ex.rest_seconds) parts.push(`${ex.rest_seconds} ثانیه استراحت`);
  return parts.join(" × ");
}

// Diet nutrition lives in utils/nutrition.js — it's arithmetic (scaling a
// food to an amount, summing meals and days), not just formatting.
