import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  addDietItem,
  addMeal,
  assignDietPlan,
  deleteDietItem,
  deleteMeal,
  getDietPlan,
} from "../../api/diet.js";
import { TrashIcon } from "../../components/common/icons.jsx";
import AssignMemberModal from "../../components/plans/AssignMemberModal.jsx";
import { DIET_GOAL_LABELS } from "../../constants/planOptions.js";
import { formatItemMacros } from "../../utils/planFormat.js";

function ItemForm({ onAdd, itemCount }) {
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!foodName.trim()) {
      setError("نام خوراکی الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      await onAdd({
        food_name: foodName.trim(),
        quantity: quantity.trim(),
        // "" would be rejected by DRF for these nullable numeric fields.
        calories: calories === "" ? null : Number(calories),
        protein_g: protein === "" ? null : Number(protein),
        carbs_g: carbs === "" ? null : Number(carbs),
        fat_g: fat === "" ? null : Number(fat),
        order: itemCount,
      });
      setFoodName("");
      setQuantity("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
    } catch {
      setError("افزودن خوراکی با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="exercise-add-form" onSubmit={handleSubmit}>
      <div className="item-add-top">
        <input
          className="input"
          dir="auto"
          placeholder="نام خوراکی — مثلاً سینه مرغ گریل"
          aria-label="نام خوراکی"
          value={foodName}
          onChange={(e) => setFoodName(e.target.value)}
        />
        <input
          className="input"
          dir="auto"
          placeholder="مقدار — مثلاً ۱۵۰ گرم"
          aria-label="مقدار"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="exercise-add-numbers">
        <input
          className="input"
          type="number"
          min="0"
          dir="ltr"
          placeholder="کالری"
          aria-label="کالری"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
        />
        <input
          className="input"
          type="number"
          min="0"
          step="0.1"
          dir="ltr"
          placeholder="پروتئین"
          aria-label="پروتئین به گرم"
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
        />
        <input
          className="input"
          type="number"
          min="0"
          step="0.1"
          dir="ltr"
          placeholder="کربو"
          aria-label="کربوهیدرات به گرم"
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
        />
        <input
          className="input"
          type="number"
          min="0"
          step="0.1"
          dir="ltr"
          placeholder="چربی"
          aria-label="چربی به گرم"
          value={fat}
          onChange={(e) => setFat(e.target.value)}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      <button className="btn btn-ghost btn-sm" type="submit" disabled={isSaving}>
        {isSaving ? "در حال افزودن…" : "+ افزودن خوراکی"}
      </button>
    </form>
  );
}

export default function DietBuilderPage() {
  const { planId } = useParams();

  const [plan, setPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newMealName, setNewMealName] = useState("");
  const [newMealTime, setNewMealTime] = useState("");
  const [isAddingMeal, setIsAddingMeal] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    const data = await getDietPlan(planId);
    setPlan(data);
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getDietPlan(planId);
        if (!cancelled) setPlan(data);
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
  }, [planId]);

  async function handleAddMeal(e) {
    e.preventDefault();
    if (!newMealName.trim()) return;
    setIsAddingMeal(true);
    try {
      await addMeal(planId, {
        name: newMealName.trim(),
        time: newMealTime || null,
        order: plan.meals.length,
      });
      setNewMealName("");
      setNewMealTime("");
      await reload();
    } catch {
      setError("افزودن وعده با مشکل مواجه شد.");
    } finally {
      setIsAddingMeal(false);
    }
  }

  async function handleAssign(userId) {
    await assignDietPlan(planId, userId);
    setToast("برنامه غذایی با موفقیت اختصاص داده شد.");
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
          <h1 className="page-title">{plan.name}</h1>
          <p className="page-subtitle">
            {plan.goal ? DIET_GOAL_LABELS[plan.goal] ?? plan.goal : "بدون هدف مشخص"}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAssignOpen(true)}>
          اختصاص به عضو
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {toast && <p className="success-text">{toast}</p>}

      <section className="card plan-section">
        <h2 className="plan-section-title">وعده‌های غذایی</h2>

        {plan.meals.length === 0 && <p className="muted exercise-empty">هنوز وعده‌ای تعریف نشده.</p>}

        {plan.meals.map((meal) => (
          <div key={meal.id} className="day-block">
            <div className="day-block-head">
              <h3 className="day-block-title">
                {meal.name}
                {meal.time && <span className="muted meal-time ltr"> {meal.time.slice(0, 5)}</span>}
              </h3>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={async () => {
                  await deleteMeal(planId, meal.id);
                  await reload();
                }}
                aria-label={`حذف ${meal.name}`}
              >
                <TrashIcon size={16} />
              </button>
            </div>

            {meal.items.length === 0 ? (
              <p className="muted exercise-empty">هنوز خوراکی‌ای اضافه نشده.</p>
            ) : (
              <ul className="exercise-list">
                {meal.items.map((item) => (
                  <li key={item.id} className="exercise-row">
                    <div className="exercise-row-main">
                      <span className="exercise-name">
                        {item.food_name}
                        {item.quantity && <span className="muted"> — {item.quantity}</span>}
                      </span>
                      <span className="muted exercise-detail">{formatItemMacros(item)}</span>
                      {item.notes && <span className="muted exercise-notes">{item.notes}</span>}
                    </div>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={async () => {
                        await deleteDietItem(planId, meal.id, item.id);
                        await reload();
                      }}
                      aria-label={`حذف ${item.food_name}`}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <ItemForm
              itemCount={meal.items.length}
              onAdd={async (payload) => {
                await addDietItem(planId, meal.id, payload);
                await reload();
              }}
            />
          </div>
        ))}

        <form className="add-day-form" onSubmit={handleAddMeal}>
          <input
            className="input"
            dir="auto"
            placeholder="نام وعده — مثلاً صبحانه"
            aria-label="نام وعده جدید"
            value={newMealName}
            onChange={(e) => setNewMealName(e.target.value)}
          />
          <input
            className="input meal-time-input"
            type="time"
            dir="ltr"
            aria-label="ساعت وعده"
            value={newMealTime}
            onChange={(e) => setNewMealTime(e.target.value)}
          />
          <button className="btn btn-secondary btn-sm" type="submit" disabled={isAddingMeal}>
            {isAddingMeal ? "…" : "+ افزودن وعده"}
          </button>
        </form>
      </section>

      {isAssignOpen && (
        <AssignMemberModal
          planName={plan.name}
          onAssign={handleAssign}
          onClose={() => setIsAssignOpen(false)}
        />
      )}
    </div>
  );
}
