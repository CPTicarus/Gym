import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listMyWorkoutPlans, listMyWorkoutSessions } from "../../api/workouts.js";
import WorkoutStreakCard from "../../components/plans/WorkoutStreakCard.jsx";
import MoveDetailModal from "../../components/moves/MoveDetailModal.jsx";
import PrintButton from "../../components/common/PrintButton.jsx";
import PrintHeader from "../../components/common/PrintHeader.jsx";
import PlanHistoryList from "../../components/plans/PlanHistoryList.jsx";
import SupersetFrame from "../../components/plans/SupersetFrame.jsx";
import { WORKOUT_GOAL_LABELS } from "../../constants/planOptions.js";
import { formatExerciseDetail } from "../../utils/planFormat.js";
import { dayBlocks } from "../../utils/supersets.js";

/** A move as a member reads it; tapping opens its description and media. */
function MoveViewButton({ exercise, onViewMove }) {
  return (
    <button type="button" className="exercise-row-view-btn" onClick={() => onViewMove(exercise.move)}>
      <span className="exercise-name">{exercise.move_detail?.name ?? "—"}</span>
      <span className="muted exercise-detail">{formatExerciseDetail(exercise)}</span>
      {exercise.notes && <span className="muted exercise-notes">{exercise.notes}</span>}
    </button>
  );
}

function ExerciseReadOnlyList({ exercises, supersets, emptyText, onViewMove }) {
  const blocks = dayBlocks({ exercises, supersets });
  if (blocks.length === 0) {
    return <p className="muted exercise-empty">{emptyText}</p>;
  }
  return (
    <ul className="exercise-list">
      {blocks.map((block) =>
        block.type === "superset" ? (
          <SupersetFrame
            key={block.key}
            superset={block.superset}
            renderMove={(exercise) => <MoveViewButton exercise={exercise} onViewMove={onViewMove} />}
          />
        ) : (
          <li key={block.key} className="exercise-row">
            <MoveViewButton exercise={block.exercise} onViewMove={onViewMove} />
          </li>
        )
      )}
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
                        supersets={day.supersets}
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
