import { toPersianDigits } from "../../utils/jalali.js";

/**
 * A trend line for one measured value across a member's history.
 *
 * Entries missing that value are skipped rather than plotted as zero —
 * someone who logged a waist but no weight hasn't lost all their weight,
 * and a line dropping to the axis would say exactly that.
 *
 * Oldest-first so it reads left to right chronologically, which is how a
 * chart reads regardless of the page being RTL.
 */
export default function MeasurementTrend({ entries, field, unit, label }) {
  const points = entries
    .filter((entry) => entry[field] != null)
    .slice()
    .reverse();

  if (points.length < 2) return null;

  const width = 320;
  const height = 72;
  const padding = 10;
  const values = points.map((p) => p[field]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((point, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (point[field] - min) / range) * (height - padding * 2);
    return [x, y];
  });

  const first = values[0];
  const last = values[values.length - 1];
  const change = Math.round((last - first) * 10) / 10;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="muted text-xs">
          {toPersianDigits(first)} ← {toPersianDigits(last)} {unit}
          {change !== 0 && (
            <span className={change < 0 ? "text-success mr-1" : "text-accent-dark mr-1"}>
              ({change > 0 ? "+" : "−"}
              {toPersianDigits(Math.abs(change))})
            </span>
          )}
        </span>
      </div>
      <svg
        className="weight-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`روند ${label} از ${first} به ${last} ${unit}`}
      >
        <polyline
          points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map(([x, y], i) => (
          <circle key={points[i].id} cx={x} cy={y} r="2.5" fill="var(--color-accent)" />
        ))}
      </svg>
    </div>
  );
}
