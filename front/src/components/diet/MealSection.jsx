import { mealTotals } from "../../utils/nutrition.js";
import { TrashIcon } from "../common/icons.jsx";
import FoodEntryForm from "./FoodEntryForm.jsx";
import FoodEntryList from "./FoodEntryList.jsx";
import { NutrientTotals } from "./NutrientSummary.jsx";

/** One meal slot — its name/time, its foods with what each amount comes
 * to, the meal's total, and (when editable) the add-food form. Nested
 * inside a day's block, and shared by the trainer's builder and the
 * member's read-only plan (`readOnly`), where only the reading half
 * renders. */
export default function MealSection({
  meal,
  foods,
  onDeleteMeal,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onFoodCreated,
  readOnly = false,
}) {
  const { totals, incomplete } = mealTotals(meal);

  return (
    <div className="meal-block">
      <div className="day-block-head">
        <h4 className="day-block-title">
          {meal.name}
          {/* The space stays outside the .ltr span: inside a bidi isolate
              it lands on the far side of the time, gluing it to the name. */}
          {meal.time && (
            <>
              {" "}
              <span className="muted meal-time ltr">{meal.time.slice(0, 5)}</span>
            </>
          )}
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
        <>
          <FoodEntryList
            entries={meal.items}
            foods={foods}
            readOnly={readOnly}
            amountRequired
            onUpdate={onUpdateItem}
            onDelete={onDeleteItem}
            onFoodCreated={onFoodCreated}
          />
          <NutrientTotals label="جمع وعده" totals={totals} incomplete={incomplete} />
        </>
      )}

      {!readOnly && (
        <FoodEntryForm
          foods={foods}
          amountRequired
          submitLabel="+ افزودن خوراکی"
          onSubmit={(payload) => onAddItem({ ...payload, order: meal.items.length })}
          onFoodCreated={onFoodCreated}
        />
      )}
    </div>
  );
}
