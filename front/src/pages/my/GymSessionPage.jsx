import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { finishWorkoutDay, listMyWorkoutPlans } from "../../api/workouts.js";
import { CheckIcon, ClockIcon } from "../../components/common/icons.jsx";
import Modal from "../../components/common/Modal.jsx";
import MoveDetailModal from "../../components/moves/MoveDetailModal.jsx";
import { formatClock, formatDurationLong } from "../../utils/format.js";
import {
  appendWorkoutLog,
  clearSession,
  collectSessionExercises,
  exerciseKey,
  pruneSessions,
  readSession,
  saveSession,
  summarizeSession,
} from "../../utils/gymSession.js";
import { toPersianDigits } from "../../utils/jalali.js";
import { formatExerciseDetail } from "../../utils/planFormat.js";

/**
 * The checkbox and the name/details are two separate buttons (not one
 * nested inside the other — invalid HTML) so tapping the move name opens
 * its description/media without also toggling the checkmark.
 *
 * `section` namespaces the checked-state key; see exerciseKey() for why.
 *
 * Memoised because the session clock ticks once a second and every tick
 * re-renders this page: without it, a phone would rebuild all three lists
 * sixty times a minute for a number that isn't even in them. Every prop
 * below is referentially stable between ticks (`onToggle` is a useCallback,
 * `onViewMove` a state setter), so the lists only re-render on a real tap.
 */
const SessionExerciseList = memo(function SessionExerciseList({
  exercises,
  emptyText,
  section,
  checkedKeys,
  onToggle,
  onViewMove,
}) {
  if (!exercises || exercises.length === 0) {
    return <p className="muted exercise-empty">{emptyText}</p>;
  }
  return (
    <ul className="exercise-list">
      {exercises.map((ex) => {
        const key = exerciseKey(section, ex.id);
        const isChecked = checkedKeys.has(key);
        return (
          <li key={key} className={`session-exercise-row${isChecked ? " is-checked" : ""}`}>
            <button
              type="button"
              className="session-exercise-checkbox-btn"
              onClick={() => onToggle(key)}
              aria-pressed={isChecked}
              aria-label={`علامت زدن ${ex.move_detail?.name ?? "حرکت"}`}
            >
              <span className="session-exercise-checkbox">
                <CheckIcon size={14} />
              </span>
            </button>
            <button type="button" className="session-exercise-info" onClick={() => onViewMove(ex.move)}>
              <span className="exercise-name">{ex.move_detail?.name ?? "—"}</span>
              <span className="muted exercise-detail">{formatExerciseDetail(ex)}</span>
              {ex.notes && <span className="muted exercise-notes">{ex.notes}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
});

/**
 * Count, bar and running clock. It sits above the three lists rather than
 * inside one of them because it describes the whole session — at the gym
 * the question is "how much is left", which nothing on the page answered.
 */
function SessionProgress({ done, total, elapsedSeconds }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = total > 0 && done === total;
  return (
    <section className={`card session-progress${isComplete ? " is-complete" : ""}`}>
      <div className="session-progress-head">
        <span className="session-progress-count">
          {toPersianDigits(done)} از {toPersianDigits(total)}
        </span>
        <span className="muted session-progress-timer">
          <ClockIcon size={15} />
          <span className="ltr">{formatClock(elapsedSeconds)}</span>
        </span>
      </div>
      <div
        className="session-progress-track"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${done} از ${total} حرکت انجام شده`}
      >
        <div className="session-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}

/**
 * Shown when finishing with work still unchecked. "پایان تمرین" advances the
 * plan to the next day server-side and can't be undone from this screen, so
 * a mis-tap on the way past it used to cost a member the whole session with
 * no warning at all.
 */
function FinishConfirmModal({ done, total, onConfirm, onCancel }) {
  const remaining = total - done;
  return (
    <Modal title="پایان تمرین؟" onClose={onCancel}>
      {done === 0 ? (
        <p className="session-confirm-text">
          هنوز هیچ حرکتی را علامت نزده‌اید. اگر الان تمرین را تمام کنید، این جلسه بدون حرکت
          انجام‌شده ثبت می‌شود و برنامه به روز بعد می‌رود.
        </p>
      ) : (
        <p className="session-confirm-text">
          {toPersianDigits(done)} از {toPersianDigits(total)} حرکت انجام شده و{" "}
          {toPersianDigits(remaining)} حرکت باقی مانده. تمرین را همین‌جا تمام می‌کنید؟
        </p>
      )}
      <div className="session-confirm-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          ادامه تمرین
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          بله، تمام شد
        </button>
      </div>
    </Modal>
  );
}

function SummaryStat({ label, value }) {
  if (!value) return null;
  return (
    <div className="session-summary-stat">
      <span className="muted session-summary-stat-label">{label}</span>
      <span className="session-summary-stat-value">{value}</span>
    </div>
  );
}

/**
 * Opens by itself the moment the last move gets ticked off — the third
 * section is the cool-down, so that tap really is the end of the workout
 * and hunting for a button at the bottom of the page afterwards is a tax.
 *
 * It only ever *offers*. finish-day advances the plan's day pointer
 * server-side with no undo on this screen, so firing it straight off a
 * checkbox would turn one mis-tap into an ended session — and would report
 * a failed POST as an error for something the member never asked for.
 * Dismissing leaves the session running, clock included.
 */
function SessionCompletePrompt({ progress, elapsedSeconds, onFinish, onDismiss }) {
  return (
    <Modal title="همه حرکات انجام شد" onClose={onDismiss}>
      <p className="session-confirm-text">
        هر {toPersianDigits(progress.total)} حرکت امروز را انجام داده‌اید. تمرین را ثبت کنیم؟
      </p>
      <div className="session-summary-stats">
        <SummaryStat label="مدت تمرین" value={formatDurationLong(elapsedSeconds)} />
        <SummaryStat label="مجموع ست‌ها" value={progress.sets ? toPersianDigits(progress.sets) : null} />
        <SummaryStat label="مجموع تکرارها" value={progress.reps ? toPersianDigits(progress.reps) : null} />
      </div>
      <div className="session-confirm-actions">
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          ادامه تمرین
        </button>
        <button type="button" className="btn btn-primary" onClick={onFinish}>
          ثبت تمرین
        </button>
      </div>
    </Modal>
  );
}

/**
 * The end of a workout is the one moment a member has something to show for
 * the last hour; dropping them straight back onto the plan list threw that
 * away. "Volume" here is sets and reps — no exercise model carries a weight
 * field, so there is no kg tonnage available to total.
 */
function SessionSummaryModal({ summary, onClose }) {
  return (
    <Modal title="تمرین ثبت شد" onClose={onClose}>
      <div className="session-summary-stats">
        <SummaryStat label="مدت تمرین" value={formatDurationLong(summary.elapsedSeconds)} />
        <SummaryStat
          label="حرکت‌های انجام‌شده"
          value={`${toPersianDigits(summary.done)} از ${toPersianDigits(summary.total)}`}
        />
        <SummaryStat label="مجموع ست‌ها" value={summary.sets ? toPersianDigits(summary.sets) : null} />
        <SummaryStat label="مجموع تکرارها" value={summary.reps ? toPersianDigits(summary.reps) : null} />
        <SummaryStat
          label="زمان حرکات زمان‌دار"
          value={summary.seconds ? formatDurationLong(summary.seconds) : null}
        />
      </div>

      {summary.nextDayName && (
        <p className="session-summary-next">
          جلسه بعدی شما: <strong>{summary.nextDayName}</strong>
        </p>
      )}

      <div className="session-confirm-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
          بازگشت به برنامه من
        </button>
      </div>
    </Modal>
  );
}

export default function GymSessionPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkedKeys, setCheckedKeys] = useState(() => new Set());
  const [isFinishing, setIsFinishing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isCompletePromptOpen, setIsCompletePromptOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [viewMoveId, setViewMoveId] = useState(null);

  // null until the first look at a restored session — see the effect below.
  const wasCompleteRef = useRef(null);
  const hasPromptedRef = useRef(false);

  // Restoring a saved session is a second step after the plan loads (the
  // storage key needs the day id), so until it has run there is nothing
  // worth writing back — see the persist effect below.
  const [isRestored, setIsRestored] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await listMyWorkoutPlans();
        const list = data.results ?? data;
        const found = list.find((a) => String(a.id) === assignmentId);
        if (cancelled) return;
        if (!found) {
          setError("این برنامه پیدا نشد.");
        } else {
          setAssignment(found);
        }
      } catch {
        if (!cancelled) setError("بارگذاری برنامه با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const plan = assignment?.plan_detail;
  const day = assignment?.active_day;
  const dayId = day?.id ?? null;
  const hasAssignment = Boolean(assignment);

  const exercises = useMemo(() => collectSessionExercises(plan, day), [plan, day]);
  const progress = useMemo(() => summarizeSession(exercises, checkedKeys), [exercises, checkedKeys]);
  const isComplete = progress.total > 0 && progress.done === progress.total;

  // Bring back whatever was already ticked off today, and pick the clock up
  // where it left off rather than restarting it on every reload.
  useEffect(() => {
    if (!hasAssignment) return;
    pruneSessions();
    const stored = readSession(assignmentId, dayId);
    setCheckedKeys(new Set(stored?.checkedKeys ?? []));
    setStartedAt(stored?.startedAt ?? Date.now());
    setNow(Date.now());
    setIsRestored(true);
  }, [hasAssignment, assignmentId, dayId]);

  // Write-through on every change. Skipped once the summary is up: the
  // session has just been cleared from storage and must not come back.
  useEffect(() => {
    if (!isRestored || !startedAt || summary) return;
    saveSession(assignmentId, dayId, { checkedKeys: [...checkedKeys], startedAt });
  }, [isRestored, startedAt, summary, checkedKeys, assignmentId, dayId]);

  // Offer to finish the moment the last move is ticked off. Deliberately a
  // transition, not a condition: the first look at a restored session is a
  // starting state, so reloading a page where everything was already
  // checked isn't met by the sheet. And it offers once — dismissing it has
  // to mean something, so re-completing after an unchecked box won't nag.
  useEffect(() => {
    if (!isRestored) return;
    const wasComplete = wasCompleteRef.current;
    wasCompleteRef.current = isComplete;
    if (wasComplete === null || wasComplete || !isComplete) return;
    if (hasPromptedRef.current || summary) return;
    hasPromptedRef.current = true;
    setIsConfirmOpen(false);
    setIsCompletePromptOpen(true);
  }, [isComplete, isRestored, summary]);

  // Elapsed time is always derived from the stored start timestamp, never
  // accumulated tick by tick — a locked phone or a backgrounded tab stops
  // firing intervals, and a counter would quietly under-report the session.
  useEffect(() => {
    if (!startedAt || summary) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    // Intervals are throttled while the tab is hidden, so without this the
    // first thing a member sees on unlocking is a stale clock.
    function handleVisibility() {
      if (!document.hidden) setNow(Date.now());
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [startedAt, summary]);

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  const toggle = useCallback((key) => {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  async function runFinish() {
    setIsConfirmOpen(false);
    setIsCompletePromptOpen(false);
    setIsFinishing(true);
    setError(null);
    // Frozen before the request so a slow network doesn't pad the number.
    const elapsed = elapsedSeconds;
    try {
      // The response is the assignment *after* advancing, so its active_day
      // is the one that comes up next time — the "what's next" line for free.
      // The stats go up with it: the server can't know which boxes were
      // ticked, and this is what the streak and month count are built from.
      const updated = await finishWorkoutDay(assignmentId, {
        duration_seconds: elapsed,
        moves_done: progress.done,
        moves_total: progress.total,
        total_sets: progress.sets,
        total_reps: progress.reps,
      });
      // Still kept locally as well — it costs nothing and means the last
      // session survives a request that succeeded on a flaky connection
      // without the response ever arriving.
      appendWorkoutLog({
        assignmentId,
        dayName: day?.name ?? null,
        elapsedSeconds: elapsed,
        ...progress,
      });
      clearSession(assignmentId, dayId);
      setSummary({
        ...progress,
        elapsedSeconds: elapsed,
        nextDayName: updated?.active_day?.name ?? null,
      });
    } catch {
      setError("پایان تمرین با مشکل مواجه شد.");
    } finally {
      setIsFinishing(false);
    }
  }

  function handleFinishClick() {
    // Everything ticked off needs no second-guessing — straight to the
    // summary, including for someone who dismissed the prompt to cool down
    // and came back to the button. Anything less gets a confirmation.
    if (isComplete) {
      runFinish();
      return;
    }
    setIsConfirmOpen(true);
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (error && !assignment) return <p className="error-text">{error}</p>;
  if (!assignment) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/my-plans" className="muted back-link">
            ← بازگشت به برنامه من
          </Link>
          <h1 className="page-title">{plan.name}</h1>
          <p className="page-subtitle">{day ? day.name : "بدون روز مشخص"}</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <SessionProgress done={progress.done} total={progress.total} elapsedSeconds={elapsedSeconds} />

      <section className="card plan-section">
        <h2 className="plan-section-title">۱ — گرم کردن</h2>
        <SessionExerciseList
          exercises={plan.warmup_exercises}
          emptyText="حرکتی برای گرم کردن ثبت نشده."
          section="warmup"
          checkedKeys={checkedKeys}
          onToggle={toggle}
          onViewMove={setViewMoveId}
        />
      </section>

      {day && (
        <section className="card plan-section">
          <h2 className="plan-section-title">۲ — {day.name}</h2>
          <SessionExerciseList
            exercises={day.exercises}
            emptyText="حرکتی ثبت نشده."
            section="day"
            checkedKeys={checkedKeys}
            onToggle={toggle}
            onViewMove={setViewMoveId}
          />
        </section>
      )}

      <section className="card plan-section">
        <h2 className="plan-section-title">۳ — سرد کردن</h2>
        <SessionExerciseList
          exercises={plan.daily_exercises}
          emptyText="حرکت روزانه‌ای ثبت نشده."
          section="daily"
          checkedKeys={checkedKeys}
          onToggle={toggle}
          onViewMove={setViewMoveId}
        />
      </section>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleFinishClick} disabled={isFinishing}>
          {isFinishing ? "در حال ثبت…" : "پایان تمرین"}
        </button>
      </div>

      {isConfirmOpen && (
        <FinishConfirmModal
          done={progress.done}
          total={progress.total}
          onConfirm={runFinish}
          onCancel={() => setIsConfirmOpen(false)}
        />
      )}

      {isCompletePromptOpen && (
        <SessionCompletePrompt
          progress={progress}
          elapsedSeconds={elapsedSeconds}
          onFinish={runFinish}
          onDismiss={() => setIsCompletePromptOpen(false)}
        />
      )}

      {summary && <SessionSummaryModal summary={summary} onClose={() => navigate("/my-plans")} />}

      {viewMoveId && <MoveDetailModal moveId={viewMoveId} onClose={() => setViewMoveId(null)} />}
    </div>
  );
}
