/**
 * Plain Gregorian YYYY/MM/DD with Western digits — matches the numeral
 * convention used across the app. Most Persian apps show dates in the
 * Jalali/Shamsi calendar instead; switching to that is a deliberate
 * decision needing a conversion library, so it's kept as one function
 * here rather than scattered, to make that switch a single edit.
 */
export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}
