import { useState } from "react";

import { formatItemMacros } from "../../utils/planFormat.js";
import { TrashIcon } from "../common/icons.jsx";

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
          dir="auto"
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
          dir="auto"
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
          dir="auto"
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
          dir="auto"
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

/** One meal slot (name/time, its food items, and the add-item form) —
 * nested inside a day's block. Used by both the trainer-facing builder
 * (editable) and reused read-only-ish since `onDelete`/`onAddItem`/
 * `onDeleteItem` are only passed where editing is allowed. */
export default function MealSection({ meal, onDeleteMeal, onAddItem, onDeleteItem, readOnly = false }) {
  return (
    <div className="meal-block">
      <div className="day-block-head">
        <h4 className="day-block-title">
          {meal.name}
          {meal.time && <span className="muted meal-time ltr"> {meal.time.slice(0, 5)}</span>}
        </h4>
        {!readOnly && (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => onDeleteMeal(meal)}
            aria-label={`حذف ${meal.name}`}
          >
            <TrashIcon size={16} />
          </button>
        )}
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
              {!readOnly && (
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => onDeleteItem(item)}
                  aria-label={`حذف ${item.food_name}`}
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && <ItemForm itemCount={meal.items.length} onAdd={onAddItem} />}
    </div>
  );
}
