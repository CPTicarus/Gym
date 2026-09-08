import { useState } from "react";

import { formatItemMacros } from "../../utils/planFormat.js";
import { PencilIcon, TrashIcon } from "../common/icons.jsx";

/**
 * The fields for one food item, used BOTH to add a new one and to edit an
 * existing one — so the two can't drift apart as fields are added.
 *
 * `onCancel` marks the edit use: that form is unmounted by its parent on
 * save, so it doesn't clear itself; the add form stays mounted and does.
 */
function ItemForm({ item, submitLabel, onSubmit, onCancel }) {
  const [foodName, setFoodName] = useState(item?.food_name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity ?? "");
  const [calories, setCalories] = useState(item?.calories != null ? String(item.calories) : "");
  const [protein, setProtein] = useState(item?.protein_g != null ? String(item.protein_g) : "");
  const [carbs, setCarbs] = useState(item?.carbs_g != null ? String(item.carbs_g) : "");
  const [fat, setFat] = useState(item?.fat_g != null ? String(item.fat_g) : "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = Boolean(onCancel);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!foodName.trim()) {
      setError("نام خوراکی الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({
        food_name: foodName.trim(),
        quantity: quantity.trim(),
        // "" would be rejected by DRF for these nullable numeric fields.
        calories: calories === "" ? null : Number(calories),
        protein_g: protein === "" ? null : Number(protein),
        carbs_g: carbs === "" ? null : Number(carbs),
        fat_g: fat === "" ? null : Number(fat),
      });
      if (!isEdit) {
        setFoodName("");
        setQuantity("");
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
      }
    } catch {
      setError(isEdit ? "ذخیره تغییرات با مشکل مواجه شد." : "افزودن خوراکی با مشکل مواجه شد.");
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

      <div className="form-actions">
        {isEdit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            انصراف
          </button>
        )}
        <button
          className={isEdit ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "در حال ذخیره…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** One meal slot (name/time, its food items, and the add-item form) —
 * nested inside a day's block. Used by both the trainer-facing builder
 * (editable) and reused read-only-ish since `onDelete`/`onAddItem`/
 * `onUpdateItem`/`onDeleteItem` are only passed where editing is allowed. */
export default function MealSection({
  meal,
  onDeleteMeal,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  readOnly = false,
}) {
  const [editingId, setEditingId] = useState(null);

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
            className="icon-btn icon-btn-sm icon-btn-danger"
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
          {meal.items.map((item) =>
            editingId === item.id ? (
              // The row becomes the form in place, so it keeps its position
              // in the meal while you edit it.
              <li key={item.id} className="exercise-row flex-col items-stretch">
                <ItemForm
                  item={item}
                  submitLabel="ذخیره"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (payload) => {
                    await onUpdateItem(item, payload);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
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
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={() => setEditingId(item.id)}
                      aria-label={`ویرایش ${item.food_name}`}
                    >
                      <PencilIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm icon-btn-danger"
                      onClick={() => onDeleteItem(item)}
                      aria-label={`حذف ${item.food_name}`}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}

      {!readOnly && (
        <ItemForm
          submitLabel="+ افزودن خوراکی"
          onSubmit={(payload) => onAddItem({ ...payload, order: meal.items.length })}
        />
      )}
    </div>
  );
}
