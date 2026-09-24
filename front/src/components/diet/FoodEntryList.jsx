import { useState } from "react";

import { entryNutrients, formatAmount, formatServing, servingNutrients } from "../../utils/nutrition.js";
import { PencilIcon, TrashIcon } from "../common/icons.jsx";
import FoodEntryForm from "./FoodEntryForm.jsx";
import NutrientSummary from "./NutrientSummary.jsx";

/** One entry as read: the food, how much, and what that amount comes to —
 * or, for an allowed food given no amount, what the food is per serving. */
function FoodEntrySummary({ entry }) {
  const food = entry.food_detail;
  const perServing = entry.amount == null ? servingNutrients(food) : null;
  const hasServingNumbers = perServing && Object.values(perServing).some((value) => value != null);

  return (
    <div className="exercise-row-main">
      <span className="exercise-name">
        {food.name}
        {entry.amount != null && <span className="muted"> — {formatAmount(entry.amount, food.unit)}</span>}
      </span>
      {entry.amount != null ? (
        <NutrientSummary nutrients={entryNutrients(entry)} coreOnly />
      ) : (
        hasServingNumbers && (
          <div className="food-entry-serving">
            <span className="muted">{formatServing(food)}:</span>
            <NutrientSummary nutrients={perServing} coreOnly />
          </div>
        )
      )}
      {entry.notes && <span className="muted exercise-notes">{entry.notes}</span>}
    </div>
  );
}

/**
 * A list of food entries (meal items, or allowed foods). Editable rows turn
 * into a FoodEntryForm in place, so a row keeps its position while it's
 * being edited — the same as exercise rows in the workout builder.
 */
export default function FoodEntryList({
  entries,
  foods,
  readOnly = false,
  amountRequired,
  excludeIds,
  onUpdate,
  onDelete,
  onFoodCreated,
}) {
  const [editingId, setEditingId] = useState(null);

  return (
    <ul className="exercise-list">
      {entries.map((entry) =>
        editingId === entry.id ? (
          <li key={entry.id} className="exercise-row flex-col items-stretch">
            <FoodEntryForm
              foods={foods}
              entry={entry}
              amountRequired={amountRequired}
              // The entry's own food stays pickable while it's being edited.
              excludeIds={excludeIds?.filter((id) => id !== entry.food)}
              submitLabel="ذخیره"
              onCancel={() => setEditingId(null)}
              onSubmit={async (payload) => {
                await onUpdate(entry, payload);
                setEditingId(null);
              }}
              onFoodCreated={onFoodCreated}
            />
          </li>
        ) : (
          <li key={entry.id} className="exercise-row">
            <FoodEntrySummary entry={entry} />
            {!readOnly && (
              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => setEditingId(entry.id)}
                  aria-label={`ویرایش ${entry.food_detail.name}`}
                >
                  <PencilIcon size={15} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm icon-btn-danger"
                  onClick={() => onDelete(entry)}
                  aria-label={`حذف ${entry.food_detail.name}`}
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            )}
          </li>
        )
      )}
    </ul>
  );
}
