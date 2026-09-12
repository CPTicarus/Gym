import { formatDate } from "../../utils/format.js";
import { toPersianDigits } from "../../utils/jalali.js";
import { lastSessionDay, sessionsThisMonth, weekStreak } from "../../utils/workoutStats.js";

/**
 * "۱۲ جلسه این ماه" and the consecutive-week run, above a member's plan.
 *
 * Renders nothing at all until there's at least one session: a brand-new
 * member's first view of this page shouldn't be two zeroes and a dash,
 * which reads as failure before they've had the chance to do anything.
 * `sessions` is null while the request is still in flight — also nothing,
 * rather than a card that flashes zero and then corrects itself.
 */
export default function WorkoutStreakCard({ sessions }) {
  if (!sessions || sessions.length === 0) return null;

  const streak = weekStreak(sessions);
  const thisMonth = sessionsThisMonth(sessions);
  const last = lastSessionDay(sessions);

  return (
    <section className="card workout-streak no-print">
      <div className="workout-streak-stats">
        <div className="workout-streak-stat">
          <span className="workout-streak-value">{toPersianDigits(thisMonth)}</span>
          <span className="muted workout-streak-label">جلسه این ماه</span>
        </div>
        <div className="workout-streak-stat">
          <span className="workout-streak-value">{toPersianDigits(streak)}</span>
          <span className="muted workout-streak-label">هفته پیاپی</span>
        </div>
        <div className="workout-streak-stat">
          <span className="workout-streak-value workout-streak-value-sm">
            {last ? formatDate(last.toISOString()) : "—"}
          </span>
          <span className="muted workout-streak-label">آخرین تمرین</span>
        </div>
      </div>
      {streak >= 2 && (
        <p className="workout-streak-note">
          {toPersianDigits(streak)} هفته پشت سر هم تمرین کرده‌اید — ادامه دهید.
        </p>
      )}
    </section>
  );
}
