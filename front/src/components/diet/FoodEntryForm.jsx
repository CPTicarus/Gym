import { useState } from "react";

import { FOOD_UNIT_LABELS } from "../../constants/foodOptions.js";
import { scaleNutrients } from "../../utils/nutrition.js";
import FoodCombobox from "./FoodCombobox.jsx";
import FoodFormModal from "./FoodFormModal.jsx";
import NutrientSummary from "./NutrientSummary.jsx";

/**
 * The fields for one food entry — a meal item or an allowed food — used
 * BOTH to add a new one and to edit an existing one, like ExerciseForm.
 * `onCancel` marks the edit use: that form is unmounted by its parent on
 * save, so it doesn't reset itself; the add form stays mounted and clears.
 *
 * `amountRequired` is the difference between the two kinds of plan: a meal
 * says exactly how much, an allowed-foods list may or may not.
 *
 * What the amount comes to is previewed as it's typed, so "200 g is twice
 * the 100 g numbers" is visible before anything is saved rather than after.
 */
export default function FoodEntryForm({
  foods,
  entry,
  amountRequired,
  excludeIds,
  submitLabel,
  onSubmit,
  onCancel,
  onFoodCreated,
}) {
  const [foodId, setFoodId] = useState(entry ? String(entry.food) : "");
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount) : "");
  // Whether the amount is the trainer's own or only the prefilled serving
  // of the food picked last — only the latter follows a change of food.
  const [isAmountTyped, setIsAmountTyped] = useState(entry?.amount != null);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  // Bumped to remount FoodCombobox — after an add, and to show a food just
  // created from it (see FoodCombobox on why a key beats syncing).
  const [comboKey, setComboKey] = useState(0);
  const [newFoodName, setNewFoodName] = useState(null);

  const isEdit = Boolean(onCancel);
  const food =
    foods.find((f) => String(f.id) === foodId) ??
    (entry && String(entry.food) === foodId ? entry.food_detail : null);
  const amountValue = amount === "" ? null : Number(amount);
  const preview = food && amountValue > 0 ? scaleNutrients(food, amountValue) : null;

  function handlePick(id, picked) {
    setFoodId(id);
    // A meal starts at the food's own serving ("100" for a food entered per
    // 100 g) — the likeliest amount, and a better start than a blank box.
    // An allowed food's amount is optional, so it stays blank.
    if (picked && !isAmountTyped) setAmount(amountRequired ? String(picked.serving_size) : "");
  }

  function handleFoodCreated(created) {
    onFoodCreated(created);
    setNewFoodName(null);
    handlePick(String(created.id), created);
    setComboKey((k) => k + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!foodId) {
      setError("یک خوراکی انتخاب کنید.");
      return;
    }
    if (amountRequired && amountValue == null) {
      setError("مقدار را وارد کنید.");
      return;
    }
    if (amountValue != null && !(amountValue > 0)) {
      setError("مقدار باید بیشتر از صفر باشد.");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({ food: Number(foodId), amount: amountValue, notes: notes.trim() });
      if (!isEdit) {
        setFoodId("");
        setComboKey((k) => k + 1);
        setAmount("");
        setIsAmountTyped(false);
        setNotes("");
      }
    } catch (err) {
      if (err?.response?.data?.food) setError("این خوراکی از قبل در فهرست هست.");
      else setError(isEdit ? "ذخیره تغییرات با مشکل مواجه شد." : "افزودن خوراکی با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <form className="exercise-add-form" onSubmit={handleSubmit} noValidate>
        <FoodCombobox
          key={comboKey}
          foods={foods}
          value={foodId}
          onChange={handlePick}
          onCreate={onFoodCreated ? setNewFoodName : undefined}
          excludeIds={excludeIds}
        />

        <div className="food-entry-fields">
          <div className="exercise-amount-field">
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              dir="auto"
              placeholder={amountRequired ? "مقدار" : "مقدار (اختیاری)"}
              aria-label="مقدار"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setIsAmountTyped(e.target.value !== "");
              }}
            />
            {food && <span className="amount-unit">{FOOD_UNIT_LABELS[food.unit] ?? food.unit}</span>}
          </div>
          <input
            className="input"
            dir="auto"
            placeholder={amountRequired ? "یادداشت (اختیاری) — مثلاً بدون روغن" : "یادداشت (اختیاری) — مثلاً حداکثر در روز"}
            aria-label="یادداشت"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {preview && (
          <div className="food-entry-preview">
            <span className="muted" aria-hidden="true">
              =
            </span>
            <NutrientSummary nutrients={preview} />
          </div>
        )}

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

      {/* Outside the <form> above on purpose: Modal renders in place (no
          portal), and its own <form> nested inside this one would be
          invalid HTML — and would submit this form too. */}
      {newFoodName != null && (
        <FoodFormModal
          initialName={newFoodName}
          onSaved={handleFoodCreated}
          onClose={() => setNewFoodName(null)}
        />
      )}
    </>
  );
}
