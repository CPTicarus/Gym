import { isoToJalali, toPersianDigits } from "./jalali.js";

/**
 * Jalali/Shamsi YYYY/MM/DD with Persian digits — the calendar and numeral
 * convention Persian users expect. The API itself stays Gregorian (see
 * jalali.js's module comment for why); this is purely a display step.
 */
export function formatDate(value) {
  if (!value) return "—";
  const j = isoToJalali(value);
  if (!j) return value;
  const m = String(j.jm).padStart(2, "0");
  const d = String(j.jd).padStart(2, "0");
  return toPersianDigits(`${j.jy}/${m}/${d}`);
}
