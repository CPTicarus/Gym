import { FOOD_CATEGORIES } from "../../constants/foodOptions.js";
import FoodEntryForm from "./FoodEntryForm.jsx";
import FoodEntryList from "./FoodEntryList.jsx";

/** Entries grouped by their food's category, in the library's category
 * order; a food with no category files under "other". */
function groupByCategory(entries) {
  const byCategory = new Map();
  for (const entry of entries) {
    const key = entry.food_detail.category || "other";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(entry);
  }
  return FOOD_CATEGORIES.filter(([key]) => byCategory.has(key)).map(([key, label]) => ({
    key,
    label,
    entries: byCategory.get(key),
  }));
}

/**
 * The list on an allowed-foods plan, grouped by food category, so it reads
 * as "proteins: …, grains: …" — the way a member chooses from it — rather
 * than as one long column. There are no totals: these are alternatives to
 * pick from, not a menu to eat all of. `readOnly` for the member's view.
 */
export default function AllowedFoodSection({
  entries,
  foods,
  readOnly = false,
  onAdd,
  onUpdate,
  onDelete,
  onFoodCreated,
}) {
  // A food is on the list once (the API enforces it too), so the picker
  // stops offering whatever's already there.
  const listedIds = entries.map((entry) => entry.food);
  const groups = groupByCategory(entries);

  return (
    <div>
      {entries.length === 0 ? (
        <p className="muted exercise-empty">
          {readOnly ? "خوراکی‌ای ثبت نشده." : "هنوز خوراکی‌ای به این فهرست اضافه نشده."}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="allowed-group">
            {/* Headings only once there's something to tell apart — a list
                that's all one category would just gain a "سایر" on top. */}
            {groups.length > 1 && <h3 className="allowed-group-title">{group.label}</h3>}
            <FoodEntryList
              entries={group.entries}
              foods={foods}
              readOnly={readOnly}
              amountRequired={false}
              excludeIds={listedIds}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onFoodCreated={onFoodCreated}
            />
          </div>
        ))
      )}

      {!readOnly && (
        <FoodEntryForm
          foods={foods}
          amountRequired={false}
          excludeIds={listedIds}
          submitLabel="+ افزودن به فهرست"
          onSubmit={(payload) => onAdd({ ...payload, order: entries.length })}
          onFoodCreated={onFoodCreated}
        />
      )}
    </div>
  );
}
