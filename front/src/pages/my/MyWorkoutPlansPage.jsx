import { useEffect, useState } from "react";

import { listMyWorkoutPlans } from "../../api/workouts.js";
import {
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_VARIANT,
  WORKOUT_GOAL_LABELS,
} from "../../constants/planOptions.js";
import { formatExerciseDetail } from "../../utils/planFormat.js";

function ExerciseReadOnlyList({ exercises, emptyText }) {
  if (!exercises || exercises.length === 0) {
    return <p className="muted exercise-empty">{emptyText}</p>;
  }
  return (
    <ul className="exercise-list">
      {exercises.map((ex) => (
        <li key={ex.id} className="exercise-row">
          <div className="exercise-row-main">
            <span className="exercise-name">{ex.move_detail?.name ?? "—"}</span>
            <span className="muted exercise-detail">{formatExerciseDetail(ex)}</span>
            {ex.notes && <span className="muted exercise-notes">{ex.notes}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function MyWorkoutPlansPage() {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">برنامه تمرینی من</h1>
          <p className="page-subtitle">برنامه‌هایی که مربی برای شما تنظیم کرده است.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : assignments.length === 0 ? (
        <div className="empty-state">
          <p>هنوز برنامه‌ای برای شما ثبت نشده. با مربی خود هماهنگ کنید.</p>
        </div>
      ) : (
        assignments.map((a) => {
          const plan = a.plan_detail;
          if (!plan) return null;
          return (
            <div key={a.id} className="card plan-section">
              <div className="plan-card-head">
                <h2 className="plan-section-title">{plan.name}</h2>
                <span className={`badge badge-${ASSIGNMENT_STATUS_VARIANT[a.status] ?? "neutral"}`}>
                  {ASSIGNMENT_STATUS_LABELS[a.status] ?? a.status}
                </span>
              </div>
              {plan.goal && (
                <p className="muted plan-section-hint">{WORKOUT_GOAL_LABELS[plan.goal] ?? plan.goal}</p>
              )}
              {plan.description && <p className="plan-description">{plan.description}</p>}

              <h3 className="day-block-title section-heading">گرم کردن</h3>
              <ExerciseReadOnlyList
                exercises={plan.warmup_exercises}
                emptyText="حرکتی برای گرم کردن ثبت نشده."
              />

              <h3 className="day-block-title section-heading">روزهای تمرین</h3>
              {plan.days?.length ? (
                plan.days.map((day) => (
                  <div key={day.id} className="day-block">
                    <h4 className="day-block-title">{day.name}</h4>
                    <ExerciseReadOnlyList exercises={day.exercises} emptyText="حرکتی ثبت نشده." />
                  </div>
                ))
              ) : (
                <p className="muted exercise-empty">روزی ثبت نشده.</p>
              )}

              <h3 className="day-block-title section-heading">حرکات روزانه</h3>
              <ExerciseReadOnlyList
                exercises={plan.daily_exercises}
                emptyText="حرکت روزانه‌ای ثبت نشده."
              />
            </div>
          );
        })
      )}
    </div>
  );
}
