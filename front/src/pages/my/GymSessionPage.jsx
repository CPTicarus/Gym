import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { finishWorkoutDay, listMyWorkoutPlans } from "../../api/workouts.js";
import { CheckIcon } from "../../components/common/icons.jsx";
import { formatExerciseDetail } from "../../utils/planFormat.js";

/**
 * `section` namespaces the checked-state key — warmup/day/daily exercises
 * are three separate Django models with independent id sequences, so a
 * warmup exercise #5 and a daily exercise #5 can both exist; keying by raw
 * id alone would check both together.
 */
function SessionExerciseList({ exercises, emptyText, section, checkedKeys, onToggle }) {
  if (!exercises || exercises.length === 0) {
    return <p className="muted exercise-empty">{emptyText}</p>;
  }
  return (
    <ul className="exercise-list">
      {exercises.map((ex) => {
        const key = `${section}-${ex.id}`;
        const isChecked = checkedKeys.has(key);
        return (
          <li key={key}>
            <button
              type="button"
              className={`session-exercise-row${isChecked ? " is-checked" : ""}`}
              onClick={() => onToggle(key)}
              aria-pressed={isChecked}
            >
              <span className="session-exercise-checkbox">
                <CheckIcon size={14} />
              </span>
              <span className="exercise-row-main">
                <span className="exercise-name">{ex.move_detail?.name ?? "—"}</span>
                <span className="muted exercise-detail">{formatExerciseDetail(ex)}</span>
                {ex.notes && <span className="muted exercise-notes">{ex.notes}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
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

  function toggle(key) {
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleFinish() {
    setIsFinishing(true);
    setError(null);
    try {
      await finishWorkoutDay(assignmentId);
      navigate("/my-plans");
    } catch {
      setError("پایان تمرین با مشکل مواجه شد.");
      setIsFinishing(false);
    }
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (error && !assignment) return <p className="error-text">{error}</p>;
  if (!assignment) return null;

  const plan = assignment.plan_detail;
  const day = assignment.active_day;

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

      <section className="card plan-section">
        <h2 className="plan-section-title">۱ — گرم کردن</h2>
        <SessionExerciseList
          exercises={plan.warmup_exercises}
          emptyText="حرکتی برای گرم کردن ثبت نشده."
          section="warmup"
          checkedKeys={checkedKeys}
          onToggle={toggle}
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
        />
      </section>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleFinish} disabled={isFinishing}>
          {isFinishing ? "در حال ثبت…" : "پایان تمرین"}
        </button>
      </div>
    </div>
  );
}
