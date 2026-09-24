import { NUTRIENTS } from "../../constants/foodOptions.js";
import { formatNumber } from "../../utils/nutrition.js";

const FLOOR_HINT = "برای بعضی خوراکی‌ها این مقدار ثبت نشده — مقدار واقعی بیشتر است.";

/**
 * A labelled total — "جمع وعده" as a line of chips, "جمع روز" as a
 * readout. Renders nothing when none of the foods in it has any numbers,
 * rather than a label with nothing after it.
 */
export function NutrientTotals({ label, totals, incomplete, variant = "chips" }) {
  if (!Object.values(totals).some((value) => value != null)) return null;
  return (
    <div className={`nutrient-totals nutrient-totals-${variant}`}>
      <span className="nutrient-totals-label">{label}</span>
      <NutrientSummary nutrients={totals} incomplete={incomplete} variant={variant} />
    </div>
  );
}

/**
 * Nutrient values: a row of chips ("۳۳۰ کالری", "۶۲ گرم پروتئین"), or with
 * variant="readout" a strip of gauges, for a day's totals.
 *
 * Only nutrients that have a value are shown, so a gym that tracks
 * calories and macros alone never sees empty fibre or sugar slots. Keys in
 * `incomplete` (see sumNutrients) are floors rather than full figures —
 * some food in the total has no number for them — and carry a "+".
 */
export default function NutrientSummary({ nutrients, incomplete = [], coreOnly = false, variant = "chips" }) {
  const shown = NUTRIENTS.filter(({ key, core }) => nutrients?.[key] != null && (core || !coreOnly));
  if (shown.length === 0) return null;

  if (variant === "readout") {
    return (
      <dl className="nutrient-readout">
        {shown.map((nutrient) => {
          const isFloor = incomplete.includes(nutrient.key);
          return (
            <div key={nutrient.key} className="nutrient-readout-cell" title={isFloor ? FLOOR_HINT : undefined}>
              {/* The unit rides with the label ("گرم پروتئین") rather than the
                  number, which keeps the number narrow enough for the four
                  usual gauges to share one row on a phone. */}
              <dt className="nutrient-readout-label">
                {nutrient.unit ? `${nutrient.unit} ${nutrient.label}` : nutrient.label}
              </dt>
              <dd className="nutrient-readout-value">
                {formatNumber(nutrients[nutrient.key], nutrient.decimals)}
                {isFloor && "+"}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return (
    <ul className="nutrient-chips">
      {shown.map((nutrient) => {
        const isFloor = incomplete.includes(nutrient.key);
        return (
          <li key={nutrient.key} className="nutrient-chip" title={isFloor ? FLOOR_HINT : undefined}>
            <span className="nutrient-chip-value">
              {formatNumber(nutrients[nutrient.key], nutrient.decimals)}
              {isFloor && "+"}
            </span>{" "}
            {nutrient.unit ? `${nutrient.unit} ${nutrient.label}` : nutrient.label}
          </li>
        );
      })}
    </ul>
  );
}
