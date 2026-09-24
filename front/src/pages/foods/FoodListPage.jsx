import { useEffect, useMemo, useState } from "react";

import { fetchAllFoods } from "../../api/foods.js";
import FoodFormModal from "../../components/diet/FoodFormModal.jsx";
import NutrientSummary from "../../components/diet/NutrientSummary.jsx";
import { FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from "../../constants/foodOptions.js";
import { toPersianDigits } from "../../utils/jalali.js";
import { formatServing, servingNutrients } from "../../utils/nutrition.js";
import { normalizeSearch, sortByName } from "../../utils/search.js";

const CATEGORY_FILTER_OPTIONS = [["", "همه دسته‌ها"], ...FOOD_CATEGORIES];

/** The whole card opens the food, but only its name is the button — the
 * nutrient list can't live inside a <button> — and a stretched overlay on
 * the button (see .food-card-open) makes the rest of the card clickable. */
function FoodCard({ food, onOpen }) {
  return (
    <div className="food-card">
      {food.category && <span className="eyebrow">{FOOD_CATEGORY_LABELS[food.category] ?? food.category}</span>}
      <h3 className="food-card-title">
        <button type="button" className="food-card-open" onClick={() => onOpen(food)}>
          {food.name}
        </button>
      </h3>
      {food.alias && <span className="food-card-alias">{food.alias}</span>}
      <span className="food-card-serving">{formatServing(food)}</span>
      <NutrientSummary nutrients={servingNutrients(food)} />
    </div>
  );
}

/**
 * The food library: what each food is, per serving, entered once. Diet
 * plans pick from it and give only an amount — the nutrition for that
 * amount is worked out from here, and fixing a number here fixes it in
 * every plan that uses the food.
 *
 * The whole library is loaded and filtered in the browser (the builder's
 * picker does the same), so search is instant and there's no page 2 for
 * a food to hide on.
 */
export default function FoodListPage() {
  const [foods, setFoods] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  // null: closed; "new": adding; a food: editing that one.
  const [openFood, setOpenFood] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllFoods()
      .then((data) => {
        if (!cancelled) setFoods(data);
      })
      .catch(() => {
        if (!cancelled) setError("بارگذاری خوراکی‌ها با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = normalizeSearch(search);
    return foods.filter(
      (food) =>
        (!category || food.category === category) &&
        (!q || normalizeSearch(food.name).includes(q) || normalizeSearch(food.alias).includes(q))
    );
  }, [foods, search, category]);

  function handleSaved(saved) {
    setFoods((prev) => sortByName([...prev.filter((food) => food.id !== saved.id), saved]));
  }

  function handleDeleted(deleted) {
    setFoods((prev) => prev.filter((food) => food.id !== deleted.id));
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">کتابخانه خوراکی‌ها</h1>
          <p className="page-subtitle">
            ارزش غذایی هر خوراکی یک بار اینجا ثبت می‌شود. در برنامه غذایی فقط مقدار را وارد کنید — بقیه خودکار
            حساب می‌شود.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpenFood("new")}>
          + افزودن خوراکی
        </button>
      </div>

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder="جستجوی خوراکی…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_FILTER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری خوراکی‌ها…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>{foods.length === 0 ? "هنوز خوراکی‌ای ثبت نشده." : "خوراکی‌ای با این فیلتر پیدا نشد."}</p>
          {foods.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => setOpenFood("new")}>
              اولین خوراکی را اضافه کنید
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="muted mb-3 text-xs">
            {toPersianDigits(visible.length)} خوراکی
            {visible.length !== foods.length && ` از ${toPersianDigits(foods.length)}`}
          </p>
          <div className="food-grid">
            {visible.map((food) => (
              <FoodCard key={food.id} food={food} onOpen={setOpenFood} />
            ))}
          </div>
        </>
      )}

      {openFood && (
        <FoodFormModal
          food={openFood === "new" ? null : openFood}
          allowAddAnother={openFood === "new"}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setOpenFood(null)}
        />
      )}
    </div>
  );
}
