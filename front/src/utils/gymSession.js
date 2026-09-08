/**
 * Everything about an in-progress gym session that isn't React: where the
 * checked-off state lives between page loads, and what the session adds up
 * to when it's over.
 *
 * Persistence exists because of where this page is used. A workout runs 45+
 * minutes on a phone that's face-down between sets — exactly the conditions
 * under which iOS Safari evicts a background tab, the screen locks, or a
 * stray back-gesture unmounts the route. Holding the checked set in React
 * state alone meant any of those silently threw away a half-finished
 * session with no way to recover it, so every change is written through to
 * localStorage.
 *
 * The storage key is assignment + day + LOCAL date. All three matter: a
 * different day of the split is a different session, tomorrow is a new
 * session that must start empty, and a reload ten seconds later is the
 * same session that must not. The date is taken in local time rather than
 * from toISOString(), because a 9pm workout in Tehran is already
 * "tomorrow" in UTC and would come back to an empty checklist mid-session.
 *
 * Every access is guarded — localStorage throws outright in private
 * browsing and with site data blocked, and a session that can't be saved
 * still has to be a session that can be done.
 */

const SESSION_PREFIX = "gym_session_";
// Deliberately NOT under SESSION_PREFIX: pruneSessions() deletes every
// prefixed key that isn't today's, which would take the log with it.
const LOG_KEY = "gym_workout_log";
const LOG_LIMIT = 60;

/** The three exercise sections of a session, in the order they're done. */
export const SESSION_SECTIONS = ["warmup", "day", "daily"];

/**
 * Warmup/day/daily are three separate Django models with independent id
 * sequences, so a warmup exercise #5 and a daily exercise #5 both exist and
 * keying by raw id alone would check them together. Built here rather than
 * inline at each call site so the rendered checkbox and the persisted key
 * can't drift apart.
 */
export function exerciseKey(section, id) {
  return `${section}-${id}`;
}

/** Flat, ordered list of everything in today's session, each with its key. */
export function collectSessionExercises(plan, day) {
  return [
    ...(plan?.warmup_exercises ?? []).map((ex) => ({ ...ex, key: exerciseKey("warmup", ex.id) })),
    ...(day?.exercises ?? []).map((ex) => ({ ...ex, key: exerciseKey("day", ex.id) })),
    ...(plan?.daily_exercises ?? []).map((ex) => ({ ...ex, key: exerciseKey("daily", ex.id) })),
  ];
}

/* ---------------------------------------------------------------- storage */

function todayKey() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function sessionKey(assignmentId, dayId) {
  // A plan with no days at all still runs a session (warmup + daily items).
  return `${SESSION_PREFIX}${assignmentId}_${dayId ?? "noday"}_${todayKey()}`;
}

/** Today's saved session, or null if this is a fresh one (or unreadable). */
export function readSession(assignmentId, dayId) {
  try {
    const raw = localStorage.getItem(sessionKey(assignmentId, dayId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      checkedKeys: Array.isArray(parsed.checkedKeys) ? parsed.checkedKeys : [],
      // A corrupt or absent timestamp must not produce a negative or
      // absurd duration — the caller treats null as "start the clock now".
      startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : null,
    };
  } catch {
    return null;
  }
}

export function saveSession(assignmentId, dayId, { checkedKeys, startedAt }) {
  try {
    localStorage.setItem(
      sessionKey(assignmentId, dayId),
      JSON.stringify({ checkedKeys, startedAt }),
    );
  } catch {
    /* the session still works in memory — it just won't survive a reload */
  }
}

export function clearSession(assignmentId, dayId) {
  try {
    localStorage.removeItem(sessionKey(assignmentId, dayId));
  } catch {
    /* nothing stored is the outcome we wanted anyway */
  }
}

/**
 * Drop sessions from previous days. Without this the store gains one dead
 * key per workout forever — the date in the key means yesterday's entry is
 * never read again and never overwritten.
 */
export function pruneSessions() {
  try {
    const today = todayKey();
    const stale = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(SESSION_PREFIX) && !key.endsWith(today)) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* pruning is housekeeping — failing to do it breaks nothing today */
  }
}

/**
 * Finished sessions, newest first. Device-local: there's no server-side
 * session log yet, so this is what makes "how long did I train" answerable
 * at all rather than being thrown away the moment the summary is dismissed.
 */
export function readWorkoutLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendWorkoutLog(entry) {
  try {
    const next = [{ ...entry, date: todayKey() }, ...readWorkoutLog()].slice(0, LOG_LIMIT);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    /* the summary the member is looking at is still correct */
  }
}

/* ----------------------------------------------------------------- totals */

/**
 * What's been completed so far. Sets and reps are the only volume this
 * schema can express — no exercise model carries a weight field, so there's
 * no kg tonnage to total.
 *
 * `sets || 1` for reps/seconds: an exercise written as a bare "12 تکرار"
 * with no set count is one set of 12, not zero. The `sets` total itself
 * stays strict, counting only what the trainer actually wrote down.
 */
export function summarizeSession(exercises, checkedKeys) {
  let done = 0;
  let sets = 0;
  let reps = 0;
  let seconds = 0;
  for (const ex of exercises) {
    if (!checkedKeys.has(ex.key)) continue;
    done += 1;
    sets += ex.sets ?? 0;
    if (ex.reps) reps += (ex.sets || 1) * ex.reps;
    if (ex.duration_seconds) seconds += (ex.sets || 1) * ex.duration_seconds;
  }
  return { done, total: exercises.length, sets, reps, seconds };
}
