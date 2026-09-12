import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listMyWorkoutPlans, listMyWorkoutSessions } from "../../api/workouts.js";
import WorkoutStreakCard from "../../components/plans/WorkoutStreakCard.jsx";
import MoveDetailModal from "../../components/moves/MoveDetailModal.jsx";
import PrintButton from "../../components/common/PrintButton.jsx";
import PrintHeader from "../../components/common/PrintHeader.jsx";
import PlanHistoryList from "../../components/plans/PlanHistoryList.jsx";
import { WORKOUT_GOAL_LABELS } from "../../constants/planOptions.js";
import { formatExerciseDetail } from "../../utils/planFormat.js";

function ExerciseReadOnlyList({ exercises, emptyText, onViewMove }) {
  if (!exercises || exercises.length === 0) {
    return <p className="muted exercise-empty">{emptyText}</p>;
  }
  return (
    <ul className="exercise-list">
      {exercises.map((ex) => (
        <li key={ex.id} className="exercise-row">
          <button type="button" className="exercise-row-view-btn" onClick={() => onViewMove(ex.move)}>
            <span className="exercise-name">{ex.move_detail?.name ?? "—"}</span>
            <span className="muted exercise-detail">{formatExerciseDetail(ex)}</span>
            {ex.notes && <span className="muted exercise-notes">{ex.notes}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function MyWorkoutPlansPage() {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMoveId, setViewMoveId] = useState(null);
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listMyWorkoutPlans();
        if (!cancelled) setAssignments(data.results ?? data);
      } catch {
        if (!cancelled) setError("بارگذاری برنامه‌ها با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetched separately, and its failure is deliberately silent: the streak
  // is a nice-to-have on top of the page, and losing it must not replace
  // the plan someone came here to read with an error.
  useEffect(() => {
    let cancelled = false;
    listMyWorkoutSessions()
      .then((data) => {
        if (!cancelled) setSessions(data.results ?? data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const active = assignments.filter((a) => a.status === "active");
  const history = assignments.filter((a) => a.status !== "active");

  return (
    <div>
      <PrintHeader title="برنامه تمرینی" />

      <div className="page-header">
        <div>
          <h1 className="page-title">برنامه تمرینی من</h1>
          <p className="page-subtitle">برنامه‌هایی که مربی برای شما تنظیم کرده است.</p>
        </div>
        <PrintButton />
      </div>

      {error && <p className="error-text">{error}</p>}

      <WorkoutStreakCard sessions={sessions} />

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : assignments.length === 0 ? (
        <div className="empty-state">
          <p>هنوز برنامه‌ای برای شما ثبت نشده. با مربی خود هماهنگ کنید.</p>
        </div>
      ) : (
        <>
          {active.length === 0 && (
            <div className="empty-state">
              <p>در حال حاضر برنامه فعالی ندارید.</p>
            </div>
          )}
          {active.map((a) => {
            const plan = a.plan_detail;
            if (!plan) return null;
            return (
              <div key={a.id} className="card plan-section">
                <div className="plan-card-head">
                  <h2 className="plan-section-title">{plan.name}</h2>
                </div>
                {plan.goal && (
                  <p className="muted plan-section-hint">{WORKOUT_GOAL_LABELS[plan.goal] ?? plan.goal}</p>
                )}
                {plan.description && <p className="plan-description">{plan.description}</p>}

                {/* A screen-only action — on paper you're already at the gym. */}
                <Link to={`/my-plans/session/${a.id}`} className="btn btn-primary btn-block no-print">
                  من در باشگاهم
                </Link>

                <h3 className="day-block-title section-heading">گرم کردن</h3>
                <ExerciseReadOnlyList
                  exercises={plan.warmup_exercises}
                  emptyText="حرکتی برای گرم کردن ثبت نشده."
                  onViewMove={setViewMoveId}
                />

                <h3 className="day-block-title section-heading">روزهای تمرین</h3>
                {plan.days?.length ? (
                  plan.days.map((day) => (
                    <div key={day.id} className="day-block">
                      <h4 className="day-block-title">{day.name}</h4>
                      <ExerciseReadOnlyList
                        exercises={day.exercises}
                        emptyText="حرکتی ثبت نشده."
                        onViewMove={setViewMoveId}
                      />
                    </div>
                  ))
                ) : (
                  <p className="muted exercise-empty">روزی ثبت نشده.</p>
                )}

                <h3 className="day-block-title section-heading">سرد کردن</h3>
                <ExerciseReadOnlyList
                  exercises={plan.daily_exercises}
                  emptyText="حرکت روزانه‌ای ثبت نشده."
                  onViewMove={setViewMoveId}
                />
              </div>
            );
          })}

          <PlanHistoryList assignments={history} goalLabels={WORKOUT_GOAL_LABELS} />
        </>
      )}

      {viewMoveId && <MoveDetailModal moveId={viewMoveId} onClose={() => setViewMoveId(null)} />}
    </div>
  );
}
