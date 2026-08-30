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

export function formatItemMacros(item) {
  const parts = [];
  if (item.calories) parts.push(`${item.calories} کالری`);
  if (item.protein_g) parts.push(`پروتئین ${item.protein_g}g`);
  if (item.carbs_g) parts.push(`کربوهیدرات ${item.carbs_g}g`);
  if (item.fat_g) parts.push(`چربی ${item.fat_g}g`);
  return parts.join(" • ");
}
