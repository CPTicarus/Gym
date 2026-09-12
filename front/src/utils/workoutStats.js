/**
 * Turns the raw session log from /api/my-workout-sessions/ into the two
 * numbers a member actually cares about: how many times they trained this
 * month, and how many weeks in a row they've shown up.
 *
 * This is client-side on purpose. Both questions are calendar questions in
 * a calendar the backend doesn't speak: "this month" means مهر, not
 * October, and a week runs Saturday to Friday. utils/jalali.js is
 * deliberately the one place in this system that knows about the Persian
 * calendar (see its module comment), and TIME_ZONE on the server is UTC —
 * so a session finished at 1am Tehran is stamped with the previous UTC
 * day. Asking the API for "sessions this month" would mean teaching it a
 * second, subtly different answer. It sends instants; this file decides
 * which local day, week and month each one lands in.
 */
import { isoToJalali } from "./jalali.js";

/** A session's local calendar day, as a Date at local midnight. */
function toLocalDay(isoDatetime) {
  const dt = new Date(isoDatetime);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * The Saturday that opens the week a given day belongs to, as "YYYY-MM-DD".
 *
 * getDay() is Sunday-first (0=Sun … 6=Sat), so the distance back to
 * Saturday is (getDay() + 1) % 7 — the same shift constants/weekdays.js
 * makes to line JS up with the Persian week.
 */
function weekStartKey(day) {
  const start = new Date(day);
  start.setDate(start.getDate() - ((day.getDay() + 1) % 7));
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${start.getFullYear()}-${m}-${d}`;
}

function shiftWeeks(day, weeks) {
  const shifted = new Date(day);
  shifted.setDate(shifted.getDate() + weeks * 7);
  return shifted;
}

/**
 * Consecutive weeks with at least one session, counting back from now.
 *
 * The current week is forgiving: not having trained yet this week doesn't
 * break anything, because the week isn't over. Without that, every
 * member's streak would read zero every Saturday morning — which is
 * precisely when they open the app deciding whether to go. A streak only
 * breaks once a whole Saturday-to-Friday week passes with nothing in it.
 */
export function weekStreak(sessions, now = new Date()) {
  const weeks = new Set();
  for (const s of sessions ?? []) {
    const day = toLocalDay(s.completed_at);
    if (day) weeks.add(weekStartKey(day));
  }
  if (weeks.size === 0) return 0;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Start at this week if it already counts, otherwise at last week — the
  // grace period above. If neither has a session, the run is over.
  let cursor = weeks.has(weekStartKey(today)) ? today : shiftWeeks(today, -1);
  let streak = 0;
  while (weeks.has(weekStartKey(cursor))) {
    streak += 1;
    cursor = shiftWeeks(cursor, -1);
  }
  return streak;
}

/** Sessions falling in the current *Jalali* month. */
export function sessionsThisMonth(sessions, now = new Date()) {
  const thisMonth = isoToJalali(now.toISOString());
  if (!thisMonth) return 0;
  return (sessions ?? []).filter((s) => {
    const j = isoToJalali(s.completed_at);
    return j && j.jy === thisMonth.jy && j.jm === thisMonth.jm;
  }).length;
}

/** The most recent session's local day, or null if there's never been one. */
export function lastSessionDay(sessions) {
  // The API already sorts newest first, but a caller that filtered or
  // concatenated shouldn't have to know that.
  let latest = null;
  for (const s of sessions ?? []) {
    const day = toLocalDay(s.completed_at);
    if (day && (!latest || day > latest)) latest = day;
  }
  return latest;
}
