// Backend stores day_of_week as 0-6, Saturday-first (the Persian week) —
// keep in sync with DietDay.Weekday in apps/diet/models.py.
export const WEEKDAYS = [
  [0, "شنبه"],
  [1, "یکشنبه"],
  [2, "دوشنبه"],
  [3, "سه‌شنبه"],
  [4, "چهارشنبه"],
  [5, "پنجشنبه"],
  [6, "جمعه"],
];

export const WEEKDAY_LABELS = Object.fromEntries(WEEKDAYS);

// JS Date#getDay() is Sunday-first (0-6); convert to our Saturday-first scheme.
export function getTodayWeekday() {
  return (new Date().getDay() + 1) % 7;
}
