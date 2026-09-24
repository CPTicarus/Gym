/**
 * Nutrition arithmetic for diet plans — the one place it's done.
 *
 * The API only stores what a food is per serving (Food: "per 100 g, 165
 * kcal...") and how much of it a plan gives (DietItem.amount). Everything
 * a trainer or member actually reads — "200 g = 330 kcal", a meal's total,
 * a day's total — is worked out here, so the builder's live preview, the
 * saved plan and the printed sheet can't disagree about the numbers.
 */
import { FOOD_UNIT_LABELS, NUTRIENTS } from "../constants/foodOptions.js";

const formats = new Map();

/** Persian digits and separators ("۲٬۱۵۰", "۱۰٫۵"), no more precise than
 * `decimals` — Intl does the digits, the ٫ decimal mark and grouping. */
export function formatNumber(value, decimals = 1) {
  if (!formats.has(decimals)) {
    formats.set(decimals, new Intl.NumberFormat("fa-IR", { maximumFractionDigits: decimals }));
  }
  return formats.get(decimals).format(value);
}

/** "۲۰۰ گرم", "۱٫۵ لیوان" — an amount in a food's own unit. */
export function formatAmount(amount, unit) {
  return `${formatNumber(amount, 2)} ${FOOD_UNIT_LABELS[unit] ?? unit}`;
}

/** What a food's numbers are per: "هر ۱۰۰ گرم", or "هر عدد" rather than
 * "هر ۱ عدد" for a single one of something countable. */
export function formatServing(food) {
  const isSingle = food.serving_size === 1 && food.unit !== "g" && food.unit !== "ml";
  return isSingle
    ? `هر ${FOOD_UNIT_LABELS[food.unit] ?? food.unit}`
    : `هر ${formatAmount(food.serving_size, food.unit)}`;
}

/**
 * A food's nutrients for `amount` of its unit: its per-serving numbers
 * scaled by amount / serving_size, so 200 g of a food entered per 100 g
 * is twice its numbers. A nutrient the food doesn't have stays null — "not
 * entered" — rather than becoming a 0 that looks like a fact.
 */
export function scaleNutrients(food, amount) {
  const factor = food?.serving_size > 0 && amount > 0 ? amount / food.serving_size : null;
  return Object.fromEntries(
    NUTRIENTS.map(({ key }) => [key, factor != null && food[key] != null ? food[key] * factor : null])
  );
}

/** A food's numbers as entered, per its own serving. */
export function servingNutrients(food) {
  return scaleNutrients(food, food?.serving_size);
}

/**
 * Totals across several entries' nutrients (each from scaleNutrients).
 *
 * A nutrient none of them has stays null, so a meal nobody entered fibre
 * for doesn't announce "0 g fibre". One that only SOME of them have is
 * summed over those and listed in `incomplete`: that total is a floor,
 * not the whole figure, and gets shown as one.
 */
export function sumNutrients(list) {
  const totals = {};
  const incomplete = [];
  for (const { key } of NUTRIENTS) {
    const known = list.map((nutrients) => nutrients[key]).filter((value) => value != null);
    totals[key] = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
    if (known.length && known.length < list.length) incomplete.push(key);
  }
  return { totals, incomplete };
}

/** One food entry — a meal item, or an allowed food with an amount. */
export function entryNutrients(entry) {
  return scaleNutrients(entry.food_detail, entry.amount);
}

export function mealTotals(meal) {
  return sumNutrients(meal.items.map(entryNutrients));
}

export function dayTotals(day) {
  return sumNutrients(day.meals.flatMap((meal) => meal.items.map(entryNutrients)));
}
