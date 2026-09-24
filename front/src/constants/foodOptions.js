// The backend stores English keys (Django TextChoices) — only the labels
// are translated. Keep in sync with Food in apps/diet/models.py.

export const FOOD_CATEGORIES = [
  ["protein", "گوشت و پروتئین"],
  ["grains", "نان و غلات"],
  ["dairy", "لبنیات"],
  ["legumes", "حبوبات"],
  ["vegetables", "سبزیجات"],
  ["fruits", "میوه‌ها"],
  ["fats", "چربی‌ها و مغزها"],
  ["beverages", "نوشیدنی‌ها"],
  ["other", "سایر"],
];

export const FOOD_UNITS = [
  ["g", "گرم"],
  ["ml", "میلی‌لیتر"],
  ["piece", "عدد"],
  ["slice", "برش"],
  ["cup", "لیوان"],
  ["bowl", "کاسه"],
  ["tbsp", "قاشق غذاخوری"],
  ["tsp", "قاشق چای‌خوری"],
  ["portion", "سهم"],
];

export const FOOD_CATEGORY_LABELS = Object.fromEntries(FOOD_CATEGORIES);
export const FOOD_UNIT_LABELS = Object.fromEntries(FOOD_UNITS);

/** Weight and volume are described per 100, the way a nutrition label
 * does; countable things (an egg, a slice) per one. */
export function defaultServingSize(unit) {
  return unit === "g" || unit === "ml" ? 100 : 1;
}

/**
 * Every nutrient a food can carry, in display order. Keys match
 * Food.NUTRIENT_FIELDS in apps/diet/models.py — adding one is a model field
 * plus an entry in both lists.
 *
 *   unit      what the number is measured in, as it reads after it
 *             ("۶۲ گرم"); calories carry their name as their unit
 *   decimals  how precisely to show it — nobody needs a tenth of a kcal
 *   core      the four shown on every food row; the rest appear where
 *             there's room (totals, the library, the add form's preview)
 */
export const NUTRIENTS = [
  { key: "calories", label: "کالری", unit: "", decimals: 0, core: true },
  { key: "protein_g", label: "پروتئین", unit: "گرم", decimals: 1, core: true },
  { key: "carbs_g", label: "کربوهیدرات", unit: "گرم", decimals: 1, core: true },
  { key: "fat_g", label: "چربی", unit: "گرم", decimals: 1, core: true },
  { key: "fiber_g", label: "فیبر", unit: "گرم", decimals: 1 },
  { key: "sugar_g", label: "قند", unit: "گرم", decimals: 1 },
  { key: "sodium_mg", label: "سدیم", unit: "میلی‌گرم", decimals: 0 },
];
