/**
 * Gregorian <-> Jalali conversion, kept entirely client-side. The API and
 * DB stay plain Gregorian ISO (DRF's default) so ordering/filtering (e.g.
 * accounting's ?ordering=membership_end_date) and every other consumer of
 * the API keep working on an unambiguous, sortable format; this module is
 * the one conversion boundary for the two places a human touches a date:
 * formatDate() for display and JalaliDateInput for entry.
 */
import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toPersianDigits(value) {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[digit]);
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/**
 * "YYYY-MM-DD" (a plain DateField, no time/timezone component) is read by
 * splitting the string directly rather than through `new Date(...)`, which
 * would parse it as UTC midnight and then risk shifting a day off when read
 * back in local time. A full ISO datetime (DateTimeField, e.g. created_at)
 * genuinely is an instant, so `new Date` + local getters are correct there.
 */
function toGregorianParts(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return { y, m, d };
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** Gregorian ISO date or datetime string -> { jy, jm, jd }, or null if unset/unparseable. */
export function isoToJalali(value) {
  const g = toGregorianParts(value);
  if (!g) return null;
  return toJalaali(g.y, g.m, g.d);
}

/** Jalali y/m/d -> "YYYY-MM-DD" Gregorian ISO string, the shape the API expects. */
export function jalaliToIso(jy, jm, jd) {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${String(gy).padStart(4, "0")}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

export { jalaaliMonthLength };
