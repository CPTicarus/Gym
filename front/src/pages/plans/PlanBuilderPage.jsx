import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { fetchAllMoves } from "../../api/moves.js";
import {
  addDailyExercise,
  addDayExercise,
  addWarmupExercise,
  addWorkoutDay,
  assignWorkoutPlan,
  deleteDailyExercise,
  deleteDayExercise,
  deleteWarmupExercise,
  deleteWorkoutAssignment,
  deleteWorkoutDay,
  deleteWorkoutPlan,
  getWorkoutPlan,
  listWorkoutAssignments,
  updateWorkoutAssignment,
  updateWorkoutPlan,
} from "../../api/workouts.js";
import { PencilIcon, TrashIcon } from "../../components/common/icons.jsx";
import AssignMemberModal from "../../components/plans/AssignMemberModal.jsx";
import EditPlanInfoModal from "../../components/plans/EditPlanInfoModal.jsx";
import ExerciseSection from "../../components/plans/ExerciseSection.jsx";
import PlanAssignments from "../../components/plans/PlanAssignments.jsx";
import { WORKOUT_GOAL_LABELS, WORKOUT_GOALS } from "../../constants/planOptions.js";

export default function PlanBuilderPage() {
  const { planId } = useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [moves, setMoves] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newDayName, setNewDayName] = useState("");
  const [isAddingDay, setIsAddingDay] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [assignments, setAssignments] = useState(null);

  // Nested writes (add/remove an exercise) change data several levels deep,
  // so we refetch the whole plan afterwards rather than trying to splice
  // the response into local state — simpler and can't drift out of sync.
  const reload = useCallback(async () => {
    const data = await getWorkoutPlan(planId);
    setPlan(data);
  }, [planId]);

  const loadAssignments = useCallback(async () => {
    const data = await listWorkoutAssignments({ plan: planId });
    setAssignments(data.results ?? data);
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      setError(null);
      try {
        const [planData, movesData] = await Promise.all([getWorkoutPlan(planId), fetchAllMoves()]);
        if (cancelled) return;
        setPlan(planData);
        setMoves(movesData);
        await loadAssignments();
      } catch {
        if (!cancelled) setError("بارگذاری برنامه با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [planId, loadAssignments]);

  async function handleAddDay(e) {
    e.preventDefault();
    if (!newDayName.trim()) return;
    setIsAddingDay(true);
    try {
      await addWorkoutDay(planId, { name: newDayName.trim(), order: plan.days.length });
      setNewDayName("");
      await reload();
    } catch {
      setError("افزودن روز با مشکل مواجه شد.");
    } finally {
      setIsAddingDay(false);
    }
  }

  async function handleDeleteDay(day) {
    try {
      await deleteWorkoutDay(planId, day.id);
      await reload();
    } catch {
      setError("حذف روز با مشکل مواجه شد.");
    }
  }

  async function handleAssign(userId) {
    const result = await assignWorkoutPlan(planId, userId);
    setToast(
      result.previous_plan_archived
        ? `برنامه اختصاص داده شد؛ برنامه قبلی این عضو («${result.previous_plan_archived}») به‌عنوان آرشیو ثبت شد.`
        : "برنامه با موفقیت اختصاص داده شد."
    );
    await loadAssignments();
  }

  async function handleDeletePlan() {
    const activeCount = assignments?.length ?? 0;
    const warning =
      activeCount > 0
        ? `این برنامه به ${activeCount} عضو اختصاص داده شده. با حذف برنامه، این اختصاص‌ها هم حذف می‌شوند.\n\nبرنامه «${plan.name}» برای همیشه حذف شود؟`
        : `برنامه «${plan.name}» برای همیشه حذف شود؟ این کار قابل بازگشت نیست.`;
    if (!window.confirm(warning)) return;
    setIsDeleting(true);
    try {
      await deleteWorkoutPlan(planId);
      navigate("/plans");
    } catch {
      setError("حذف برنامه با مشکل مواجه شد.");
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (error && !plan) return <p className="error-text">{error}</p>;
  if (!plan) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/plans" className="muted back-link">
            ← بازگشت به برنامه‌ها
          </Link>
          <div className="editable-title">
            <h1 className="page-title">{plan.name}</h1>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={() => setIsEditOpen(true)}
              aria-label="ویرایش برنامه"
            >
              <PencilIcon size={16} />
            </button>
          </div>
          <p className="page-subtitle">
            {plan.goal ? WORKOUT_GOAL_LABELS[plan.goal] ?? plan.goal : "بدون هدف مشخص"}
            {plan.is_template ? " • الگو" : ""}
          </p>
          {plan.description && <p className="plan-description">{plan.description}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn btn-primary" onClick={() => setIsAssignOpen(true)}>
            اختصاص به عضو
          </button>
          <button className="btn btn-danger" onClick={handleDeletePlan} disabled={isDeleting}>
            {isDeleting ? "در حال حذف…" : "حذف برنامه"}
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {toast && <p className="success-text">{toast}</p>}

      {/* Section 1 — warmup */}
      <section className="card plan-section">
        <h2 className="plan-section-title">۱ — گرم کردن</h2>
        <ExerciseSection
          exercises={plan.warmup_exercises}
          moves={moves}
          emptyText="هنوز حرکتی برای گرم کردن اضافه نشده."
          onAdd={async (payload) => {
            await addWarmupExercise(planId, payload);
            await reload();
          }}
          onDelete={async (ex) => {
            await deleteWarmupExercise(planId, ex.id);
            await reload();
          }}
        />
      </section>

      {/* Section 2 — days */}
      <section className="card plan-section">
        <h2 className="plan-section-title">۲ — روزهای تمرین</h2>

        {plan.days.length === 0 && <p className="muted exercise-empty">هنوز روزی تعریف نشده.</p>}

        {plan.days.map((day) => (
          <div key={day.id} className="day-block">
            <div className="day-block-head">
              <h3 className="day-block-title">{day.name}</h3>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => handleDeleteDay(day)}
                aria-label={`حذف ${day.name}`}
              >
                <TrashIcon size={16} />
              </button>
            </div>
            <ExerciseSection
              exercises={day.exercises}
              moves={moves}
              withRest
              emptyText="هنوز حرکتی برای این روز اضافه نشده."
              onAdd={async (payload) => {
                await addDayExercise(planId, day.id, payload);
                await reload();
              }}
              onDelete={async (ex) => {
                await deleteDayExercise(planId, day.id, ex.id);
                await reload();
              }}
            />
          </div>
        ))}

        <form className="add-day-form" onSubmit={handleAddDay}>
          <input
            className="input"
            dir="auto"
            placeholder="نام روز — مثلاً روز ۱ یا سینه و جلوبازو"
            aria-label="نام روز جدید"
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
          />
          <button className="btn btn-secondary btn-sm" type="submit" disabled={isAddingDay}>
            {isAddingDay ? "…" : "+ افزودن روز"}
          </button>
        </form>
      </section>

      {/* Section 3 — daily items */}
      <section className="card plan-section">
        <h2 className="plan-section-title">۳ — حرکات روزانه</h2>
        <p className="muted plan-section-hint">حرکاتی که هر روز و مستقل از روز تمرین انجام می‌شوند.</p>
        <ExerciseSection
          exercises={plan.daily_exercises}
          moves={moves}
          emptyText="هنوز حرکت روزانه‌ای اضافه نشده."
          onAdd={async (payload) => {
            await addDailyExercise(planId, payload);
            await reload();
          }}
          onDelete={async (ex) => {
            await deleteDailyExercise(planId, ex.id);
            await reload();
          }}
        />
      </section>

      {/* Who currently has this plan */}
      <section className="card plan-section">
        <h2 className="plan-section-title">اختصاص داده شده به</h2>
        <PlanAssignments
          assignments={assignments}
          onStatusChange={async (a, status) => {
            await updateWorkoutAssignment(a.id, { status });
            await loadAssignments();
          }}
          onRemove={async (a) => {
            await deleteWorkoutAssignment(a.id);
            await loadAssignments();
          }}
        />
      </section>

      {isAssignOpen && (
        <AssignMemberModal
          planName={plan.name}
          onAssign={handleAssign}
          onClose={() => setIsAssignOpen(false)}
        />
      )}

      {isEditOpen && (
        <EditPlanInfoModal
          plan={plan}
          goalOptions={WORKOUT_GOALS}
          onSave={async (payload) => {
            await updateWorkoutPlan(planId, payload);
            await reload();
          }}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}
