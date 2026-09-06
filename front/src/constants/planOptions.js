// Backend stores English keys (Django TextChoices) — only labels are translated.
// Keep keys in sync with apps/workouts/models.py and apps/diet/models.py.

export const WORKOUT_GOALS = [
  ["muscle_gain", "افزایش حجم"],
  ["fat_loss", "چربی‌سوزی"],
  ["endurance", "استقامت"],
  ["strength", "قدرت"],
  ["general_fitness", "تناسب اندام عمومی"],
  ["other", "سایر"],
];

export const DIET_GOALS = [
  ["weight_loss", "کاهش وزن"],
  ["muscle_gain", "افزایش حجم"],
  ["maintenance", "تثبیت وزن"],
  ["general_health", "سلامت عمومی"],
  ["other", "سایر"],
];

export const ASSIGNMENT_STATUSES = [
  ["active", "فعال"],
  ["paused", "متوقف"],
  ["completed", "تمام‌شده"],
];

export const WORKOUT_GOAL_LABELS = Object.fromEntries(WORKOUT_GOALS);
export const DIET_GOAL_LABELS = Object.fromEntries(DIET_GOALS);
export const ASSIGNMENT_STATUS_LABELS = Object.fromEntries(ASSIGNMENT_STATUSES);

export const ASSIGNMENT_STATUS_VARIANT = {
  active: "success",
  paused: "accent",
  completed: "neutral",
};

/** Badge classes for an assignment's status. Only "active" gets the live
 * lamp (see .badge-live in index.css) — the others are history. */
export function assignmentBadgeClass(status) {
  const variant = ASSIGNMENT_STATUS_VARIANT[status] ?? "neutral";
  return `badge badge-${variant}${status === "active" ? " badge-live" : ""}`;
}
