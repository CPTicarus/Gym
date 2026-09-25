import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  addAllowedFood,
  addDietItem,
  addMeal,
  assignDietPlan,
  deleteAllowedFood,
  deleteDietAssignment,
  deleteDietItem,
  deleteDietPlan,
  deleteMeal,
  duplicateDietPlan,
  getDietPlan,
  listDietAssignments,
  updateAllowedFood,
  updateDietAssignment,
  updateDietItem,
  updateDietPlan,
} from "../../api/diet.js";
import { fetchAllFoods } from "../../api/foods.js";
import { PencilIcon } from "../../components/common/icons.jsx";
import AllowedFoodSection from "../../components/diet/AllowedFoodSection.jsx";
import MealSection from "../../components/diet/MealSection.jsx";
import { NutrientTotals } from "../../components/diet/NutrientSummary.jsx";
import AssignMemberModal from "../../components/plans/AssignMemberModal.jsx";
import DuplicatePlanButton from "../../components/plans/DuplicatePlanButton.jsx";
import EditPlanInfoModal from "../../components/plans/EditPlanInfoModal.jsx";
import PlanAssignments from "../../components/plans/PlanAssignments.jsx";
import { DIET_GOAL_LABELS, DIET_GOALS, DIET_PLAN_KIND_LABELS } from "../../constants/planOptions.js";
import { getTodayWeekday, WEEKDAY_LABELS } from "../../constants/weekdays.js";
import { dayTotals } from "../../utils/nutrition.js";
import { nextOrder } from "../../utils/ordering.js";
import { sortByName } from "../../utils/search.js";

/** One weekday's block: the day's total, its meals, and the "add a meal to
 * this day" form. */
function DayBlock({ day, foods, onAddMeal, onDeleteMeal, onAddItem, onUpdateItem, onDeleteItem, onFoodCreated }) {
  const [name, setName] = useState("");
  const [time, setTime] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setIsAdding(true);
    try {
      await onAddMeal({ name: name.trim(), time: time || null, order: nextOrder(day.meals) });
      setName("");
      setTime("");
    } catch {
      setError("افزودن وعده با مشکل مواجه شد.");
    } finally {
      setIsAdding(false);
    }
  }

  const isToday = day.day_of_week === getTodayWeekday();
  const { totals, incomplete } = dayTotals(day);

  return (
    <div className="day-block">
      <div className="day-block-head">
        <h3 className="day-block-title">
          {WEEKDAY_LABELS[day.day_of_week]}
          {isToday && <span className="badge badge-accent mr-2">امروز</span>}
        </h3>
      </div>

      <NutrientTotals label="جمع روز" totals={totals} incomplete={incomplete} variant="readout" />

      {day.meals.length === 0 && <p className="muted exercise-empty">هنوز وعده‌ای تعریف نشده.</p>}

      {day.meals.map((meal) => (
        <MealSection
          key={meal.id}
          meal={meal}
          foods={foods}
          onDeleteMeal={onDeleteMeal}
          onAddItem={(payload) => onAddItem(meal, payload)}
          onUpdateItem={(item, payload) => onUpdateItem(meal, item, payload)}
          onDeleteItem={(item) => onDeleteItem(meal, item)}
          onFoodCreated={onFoodCreated}
        />
      ))}

      <form className="add-day-form" onSubmit={handleAdd}>
        <input
          className="input"
          dir="auto"
          placeholder="نام وعده — مثلاً میان‌وعده"
          aria-label={`نام وعده جدید برای ${WEEKDAY_LABELS[day.day_of_week]}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input meal-time-input"
          type="time"
          dir="ltr"
          aria-label="ساعت وعده"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <button className="btn btn-secondary btn-sm" type="submit" disabled={isAdding}>
          {isAdding ? "…" : "+ افزودن وعده"}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export default function DietBuilderPage() {
  const { planId } = useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [foods, setFoods] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [assignments, setAssignments] = useState(null);

  const reload = useCallback(async () => {
    const data = await getDietPlan(planId);
    setPlan(data);
  }, [planId]);

  const loadAssignments = useCallback(async () => {
    const data = await listDietAssignments({ plan: planId });
    setAssignments(data.results ?? data);
  }, [planId]);

  // A food added from a picker joins the library list straight away, so
  // every other meal's picker can offer it without a refetch.
  const handleFoodCreated = useCallback((food) => {
    setFoods((prev) => sortByName([...prev, food]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      setError(null);
      try {
        const [data, foodList] = await Promise.all([getDietPlan(planId), fetchAllFoods()]);
        if (cancelled) return;
        setPlan(data);
        setFoods(foodList);
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

  async function handleAssign(userId) {
    const result = await assignDietPlan(planId, userId);
    setToast(
      result.previous_plan_archived
        ? `برنامه غذایی اختصاص داده شد؛ برنامه قبلی این عضو («${result.previous_plan_archived}») به‌عنوان آرشیو ثبت شد.`
        : "برنامه غذایی با موفقیت اختصاص داده شد."
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
      await deleteDietPlan(planId);
      navigate("/diet");
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
          <Link to="/diet" className="muted back-link">
            ← بازگشت به برنامه‌های غذایی
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
            {plan.goal ? DIET_GOAL_LABELS[plan.goal] ?? plan.goal : "بدون هدف مشخص"}
            {` • ${DIET_PLAN_KIND_LABELS[plan.kind] ?? plan.kind}`}
          </p>
          {plan.description && <p className="plan-description">{plan.description}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <DuplicatePlanButton
            planName={plan.name}
            onDuplicate={async (name) => {
              const copy = await duplicateDietPlan(planId, name);
              // Straight into the copy — the whole point is to change one
              // thing and assign it, not to admire a new row in a list.
              navigate(`/diet/${copy.id}`);
            }}
          />
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

      {plan.kind === "allowed" ? (
        <section className="card plan-section">
          <h2 className="plan-section-title">خوراکی‌های مجاز</h2>
          <p className="muted plan-section-hint">
            این برنامه روز و وعده ثابتی ندارد — عضو از میان این خوراکی‌ها انتخاب می‌کند. مقدار اختیاری است.
          </p>
          <AllowedFoodSection
            entries={plan.allowed_foods}
            foods={foods}
            onAdd={async (payload) => {
              await addAllowedFood(planId, payload);
              await reload();
            }}
            onUpdate={async (entry, payload) => {
              await updateAllowedFood(planId, entry.id, payload);
              await reload();
            }}
            onDelete={async (entry) => {
              await deleteAllowedFood(planId, entry.id);
              await reload();
            }}
            onFoodCreated={handleFoodCreated}
          />
        </section>
      ) : (
        <section className="card plan-section">
          <h2 className="plan-section-title">وعده‌های غذایی هفتگی</h2>
          <p className="muted plan-section-hint">
            هر روز هفته وعده‌های جداگانه‌ای دارد. فقط مقدار هر خوراکی را وارد کنید — ارزش غذایی‌اش و جمع هر وعده و
            هر روز خودکار حساب می‌شود. «+» کنار یک عدد یعنی برای بعضی خوراکی‌ها آن مقدار ثبت نشده.
          </p>

          {plan.days.map((day) => (
            <DayBlock
              key={day.id}
              day={day}
              foods={foods}
              onAddMeal={async (payload) => {
                await addMeal(planId, day.id, payload);
                await reload();
              }}
              onDeleteMeal={async (meal) => {
                await deleteMeal(planId, day.id, meal.id);
                await reload();
              }}
              onAddItem={async (meal, payload) => {
                await addDietItem(planId, meal.id, payload);
                await reload();
              }}
              onUpdateItem={async (meal, item, payload) => {
                await updateDietItem(planId, meal.id, item.id, payload);
                await reload();
              }}
              onDeleteItem={async (meal, item) => {
                await deleteDietItem(planId, meal.id, item.id);
                await reload();
              }}
              onFoodCreated={handleFoodCreated}
            />
          ))}
        </section>
      )}

      {/* Who currently has this plan */}
      <section className="card plan-section">
        <h2 className="plan-section-title">اختصاص داده شده به</h2>
        <PlanAssignments
          assignments={assignments}
          onStatusChange={async (a, status) => {
            await updateDietAssignment(a.id, { status });
            await loadAssignments();
          }}
          onRemove={async (a) => {
            await deleteDietAssignment(a.id);
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
          goalOptions={DIET_GOALS}
          onSave={async (payload) => {
            await updateDietPlan(planId, payload);
            await reload();
          }}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </div>
  );
}
