import { useRef, useState } from "react";

import { createFood, deleteFood, updateFood } from "../../api/foods.js";
import {
  defaultServingSize,
  FOOD_CATEGORIES,
  FOOD_UNITS,
  NUTRIENTS,
} from "../../constants/foodOptions.js";
import { toPersianDigits } from "../../utils/jalali.js";
import Modal from "../common/Modal.jsx";

// How many plan names a "can't delete" message lists before summarising.
const MAX_PLANS_NAMED = 5;

function nutrientFields(food) {
  return Object.fromEntries(
    NUTRIENTS.map(({ key }) => [key, food?.[key] != null ? String(food[key]) : ""])
  );
}

function inUseMessage(plans) {
  const named = plans.slice(0, MAX_PLANS_NAMED).map((name) => `«${name}»`).join("، ");
  const rest = plans.length - MAX_PLANS_NAMED;
  const list = rest > 0 ? `${named} و ${toPersianDigits(rest)} برنامه دیگر` : named;
  const [noun, these] = plans.length === 1 ? ["برنامه", "این برنامه"] : ["برنامه‌های", "این برنامه‌ها"];
  return `این خوراکی در ${noun} ${list} استفاده شده و قابل حذف نیست. اول آن را از ${these} بردارید.`;
}

/**
 * Add a food to the library, or edit one. Used by the library page and —
 * with `initialName` — straight from a diet plan's food picker, when the
 * food a trainer wants isn't in the library yet.
 *
 *   food             the food to edit; omit to create
 *   initialName      prefills the name when creating
 *   allowAddAnother  offers "save and next" for entering a run of foods,
 *                    the way the move form offers "add the next move"
 *   onSaved(food)    after every successful save
 *   onDeleted(food)  after a delete (edit only)
 */
export default function FoodFormModal({
  food,
  initialName = "",
  allowAddAnother = false,
  onSaved,
  onDeleted,
  onClose,
}) {
  const isEdit = Boolean(food);
  const [name, setName] = useState(food?.name ?? initialName);
  const [alias, setAlias] = useState(food?.alias ?? "");
  const [category, setCategory] = useState(food?.category ?? "");
  const [unit, setUnit] = useState(food?.unit ?? "g");
  const [servingSize, setServingSize] = useState(food ? String(food.serving_size) : "100");
  const [nutrients, setNutrients] = useState(() => nutrientFields(food));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [savedName, setSavedName] = useState(null);
  const nameInputRef = useRef(null);

  function handleUnitChange(next) {
    // Keep the serving in step with the unit (100 g, 1 piece) — unless the
    // trainer has already typed a serving of their own.
    if (servingSize === "" || Number(servingSize) === defaultServingSize(unit)) {
      setServingSize(String(defaultServingSize(next)));
    }
    setUnit(next);
  }

  async function save(addAnother) {
    setError(null);
    setSavedName(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("نام خوراکی الزامی است.");
      return;
    }
    const serving = Number(servingSize);
    if (!(serving > 0)) {
      setError("مقدار مرجع باید بیشتر از صفر باشد.");
      return;
    }
    if (NUTRIENTS.some(({ key }) => nutrients[key] !== "" && Number(nutrients[key]) < 0)) {
      setError("ارزش غذایی نمی‌تواند منفی باشد.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: trimmedName,
        alias: alias.trim(),
        category,
        unit,
        serving_size: serving,
        // Blank is "not entered", which is what null says — and "" would
        // be rejected for a number field anyway.
        ...Object.fromEntries(
          NUTRIENTS.map(({ key }) => [key, nutrients[key] === "" ? null : Number(nutrients[key])])
        ),
      };
      const saved = isEdit ? await updateFood(food.id, payload) : await createFood(payload);
      onSaved(saved);
      if (!addAnother) {
        onClose();
        return;
      }
      // Category, unit and serving usually carry over across a run of
      // similar foods; the name and the numbers never do.
      setName("");
      setAlias("");
      setNutrients(nutrientFields(null));
      setSavedName(saved.name);
      requestAnimationFrame(() => nameInputRef.current?.focus());
    } catch (err) {
      setError(
        err?.response?.data?.unit
          ? "این خوراکی در برنامه‌های غذایی استفاده شده و واحدش قابل تغییر نیست — برای واحد دیگر، یک خوراکی تازه بسازید."
          : "ذخیره خوراکی با مشکل مواجه شد."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`«${food.name}» از کتابخانه خوراکی‌ها حذف شود؟`)) return;
    setError(null);
    setIsDeleting(true);
    try {
      await deleteFood(food.id);
      onDeleted?.(food);
      onClose();
    } catch (err) {
      const plans = err?.response?.status === 409 ? err.response.data?.plans : null;
      setError(plans?.length ? inUseMessage(plans) : "حذف خوراکی با مشکل مواجه شد.");
      setIsDeleting(false);
    }
  }

  return (
    <Modal title={isEdit ? "ویرایش خوراکی" : "افزودن خوراکی"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        noValidate
      >
        <label className="field">
          <span className="label">نام خوراکی*</span>
          <input
            ref={nameInputRef}
            className="input"
            dir="auto"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً سینه مرغ پخته"
            required
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="label">نام دیگر (اختیاری)</span>
            <input
              className="input"
              dir="auto"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="مثلاً فیله مرغ"
            />
          </label>
          <label className="field">
            <span className="label">دسته‌بندی</span>
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {FOOD_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h3 className="section-heading">ارزش غذایی</h3>
        <div className="field">
          <span className="label">مقادیر زیر برای هر</span>
          <div className="serving-row">
            <input
              className="input"
              type="number"
              min="0"
              step="any"
              dir="ltr"
              aria-label="مقدار مرجع"
              value={servingSize}
              onChange={(e) => setServingSize(e.target.value)}
            />
            <select
              className="select"
              aria-label="واحد"
              value={unit}
              onChange={(e) => handleUnitChange(e.target.value)}
            >
              {FOOD_UNITS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="nutrient-inputs">
          {NUTRIENTS.map((nutrient) => (
            <label key={nutrient.key} className="field">
              <span className="label">
                {nutrient.unit ? `${nutrient.label} (${nutrient.unit})` : nutrient.label}
              </span>
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                dir="ltr"
                value={nutrients[nutrient.key]}
                onChange={(e) => setNutrients((prev) => ({ ...prev, [nutrient.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p className="muted plan-section-hint">
          هر مقداری را که نمی‌دانید خالی بگذارید — خالی یعنی «ثبت نشده»، صفر یعنی واقعاً صفر.
          {isEdit && " تغییر این اعداد در همه برنامه‌هایی که این خوراکی را دارند اعمال می‌شود."}
        </p>

        {savedName && <p className="success-text">«{savedName}» ذخیره شد. خوراکی بعدی را وارد کنید.</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          {isEdit && (
            <button
              type="button"
              className="btn btn-danger me-auto"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
            >
              {isDeleting ? "در حال حذف…" : "حذف"}
            </button>
          )}
          {allowAddAnother && !isEdit && (
            <button type="button" className="btn btn-ghost" onClick={() => save(true)} disabled={isSaving}>
              ذخیره و بعدی
            </button>
          )}
          <button className="btn btn-primary" type="submit" disabled={isSaving || isDeleting}>
            {isSaving ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
