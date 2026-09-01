import { useCallback, useEffect, useState } from "react";

import { deleteWeightLog, listMyWeightLogs, logWeight } from "../../api/weightLogs.js";
import { formatDate } from "../../utils/format.js";
import { getBmiCategory } from "../../utils/bmi.js";
import JalaliDateInput from "../common/JalaliDateInput.jsx";
import { TrashIcon } from "../common/icons.jsx";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A small trend line over logged weights — newest-last so it reads left-to-right chronologically. */
function WeightSparkline({ logs }) {
  const width = 320;
  const height = 72;
  const padding = 10;
  const weights = logs.map((l) => l.weight_kg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const points = logs.map((log, i) => {
    const x = padding + (i / (logs.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (log.weight_kg - min) / range) * (height - padding * 2);
    return [x, y];
  });

  return (
    <svg
      className="weight-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`روند وزن از ${weights[0]} به ${weights[weights.length - 1]} کیلوگرم`}
    >
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map(([x, y], i) => (
        <circle key={logs[i].id} cx={x} cy={y} r="2.5" fill="var(--color-accent)" />
      ))}
    </svg>
  );
}

/** Self-service weight-tracking card for the settings page: log an entry,
 * see the trend, see the current height-derived BMI. `heightCm`/`bmi` come
 * from the parent (the logged-in user's profile) so this doesn't need its
 * own copy of /auth/me/; `onWeightChange` lets the parent refresh that
 * profile after a log is added/removed, since latest_weight_kg/bmi are
 * derived server-side from the weight log, not from this component's state. */
export default function WeightTracker({ heightCm, bmi, onWeightChange }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayIso());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listMyWeightLogs();
      setLogs(data);
    } catch {
      setError("بارگذاری تاریخچه وزن با مشکل مواجه شد.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const value = Number(weight);
    if (!weight || !(value > 0)) {
      setError("وزن معتبر وارد کنید.");
      return;
    }
    setIsSaving(true);
    try {
      await logWeight({ weight_kg: value, recorded_at: date || todayIso() });
      setWeight("");
      await Promise.all([load(), onWeightChange?.()]);
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ثبت وزن با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(log) {
    try {
      await deleteWeightLog(log.id);
      await Promise.all([load(), onWeightChange?.()]);
    } catch {
      setError("حذف رکورد با مشکل مواجه شد.");
    }
  }

  const chronological = [...logs].reverse();
  const category = getBmiCategory(bmi);

  return (
    <section className="card plan-section">
      <h2 className="plan-section-title">پیگیری وزن</h2>

      {heightCm ? (
        bmi != null && (
          <p className="muted mb-3">
            BMI فعلی: <strong className="text-ink">{bmi}</strong>
            {category && <span className={`badge badge-${category.variant} mr-2`}>{category.label}</span>}
          </p>
        )
      ) : (
        <p className="muted mb-3">برای محاسبه BMI، ابتدا قد خود را در بخش «اطلاعات شخصی» وارد کنید.</p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <label className="field">
            <span className="label">وزن (کیلوگرم)</span>
            <input
              className="input"
              type="number"
              step="0.1"
              min="0"
              dir="ltr"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">تاریخ</span>
            <JalaliDateInput value={date} onChange={(v) => setDate(v || todayIso())} />
          </label>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "در حال ثبت…" : "ثبت وزن"}
          </button>
        </div>
      </form>

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : logs.length === 0 ? (
        <p className="muted exercise-empty">هنوز وزنی ثبت نشده.</p>
      ) : (
        <>
          {chronological.length >= 2 && <WeightSparkline logs={chronological} />}
          <ul className="assignment-list">
            {logs.map((log) => (
              <li key={log.id} className="assignment-row">
                <div className="assignment-row-main">
                  <span className="assignment-name">{log.weight_kg} کیلوگرم</span>
                  <span className="muted assignment-meta">{formatDate(log.recorded_at)}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => handleDelete(log)}
                  aria-label={`حذف رکورد ${formatDate(log.recorded_at)}`}
                >
                  <TrashIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
