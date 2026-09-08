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

/** "First Last", falling back to the username when a name is missing. */
export function fullName(user) {
  if (!user) return "";
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "";
}

/**
 * A running clock for the gym-session timer: mm:ss, growing to h:mm:ss only
 * once an hour is on the board so a 12-minute warmup doesn't read "00:12:۳۴".
 *
 * The caller renders this inside `.ltr` — a colon-separated clock is a
 * left-to-right construct even in Persian text, and left to the paragraph's
 * RTL direction the hour and second fields swap places.
 */
export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return toPersianDigits(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
}

/**
 * The same elapsed time in words, for the end-of-session summary where
 * "۴۸ دقیقه" is the sentence a member would actually say and second-level
 * precision on a 48-minute workout is noise. Under a minute stays in
 * seconds rather than rounding down to a bare "۰ دقیقه".
 */
export function formatDurationLong(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  if (safe < 60) return `${toPersianDigits(safe)} ثانیه`;
  const h = Math.floor(safe / 3600);
  const m = Math.round((safe % 3600) / 60);
  if (h === 0) return `${toPersianDigits(m)} دقیقه`;
  if (m === 0) return `${toPersianDigits(h)} ساعت`;
  return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
}
