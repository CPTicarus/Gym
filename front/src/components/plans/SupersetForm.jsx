import { useRef, useState } from "react";

import { toPersianDigits } from "../../utils/jalali.js";
import { TrashIcon } from "../common/icons.jsx";
import MoveCombobox from "./MoveCombobox.jsx";

// One move on its own is just a move — see Superset in apps/workouts/models.py.
const MIN_MOVES = 2;

/**
 * A superset's round — how many sets, the rest after each round, an
 * optional name — and, when creating one, the moves done back to back in
 * it, in order. Editing (`superset` given) shows the round only: the moves
 * are edited in their own rows, like any exercise.
 */
export default function SupersetForm({ moves, superset, onSubmit, onCancel }) {
  const isEdit = Boolean(superset);
  const rowKey = useRef(0);
  const newRow = () => ({ key: rowKey.current++, moveId: "", amount: "", amountType: "reps" });

  const [name, setName] = useState(superset?.name ?? "");
  const [sets, setSets] = useState(superset?.sets != null ? String(superset.sets) : "");
  const [rest, setRest] = useState(superset?.rest_seconds != null ? String(superset.rest_seconds) : "");
  const [notes, setNotes] = useState(superset?.notes ?? "");
  const [rows, setRows] = useState(() => (isEdit ? [] : Array.from({ length: MIN_MOVES }, newRow)));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  function updateRow(key, changes) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const setCount = Number(sets);
    if (sets === "" || !Number.isInteger(setCount) || setCount < 1) {
      setError("تعداد ست سوپرست را وارد کنید.");
      return;
    }
    if (rows.some((row) => !row.moveId)) {
      setError("برای هر ردیف یک حرکت انتخاب کنید.");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        sets: setCount,
        rest_seconds: rest === "" ? null : Number(rest),
        notes: notes.trim(),
        ...(!isEdit && {
          exercises: rows.map((row) => {
            // A move is counted in reps or held for seconds, never both.
            const amount = row.amount === "" ? null : Number(row.amount);
            return {
              move: Number(row.moveId),
              reps: row.amountType === "reps" ? amount : null,
              duration_seconds: row.amountType === "duration" ? amount : null,
            };
          }),
        }),
      });
    } catch {
      setError(isEdit ? "ذخیره سوپرست با مشکل مواجه شد." : "ساخت سوپرست با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={`superset-form${isEdit ? " is-edit" : ""}`} onSubmit={handleSubmit} noValidate>
      {!isEdit && (
        <>
          <h4 className="superset-form-title">سوپرست جدید</h4>
          <p className="muted plan-section-hint">
            حرکات به همین ترتیب و پشت سر هم انجام می‌شوند؛ استراحت بعد از تمام شدن هر دور است.
          </p>
        </>
      )}

      <input
        className="input"
        dir="auto"
        placeholder="نام (اختیاری) — مثلاً سوپرست سینه"
        aria-label="نام سوپرست"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {/* Units written beside the boxes rather than as placeholders, so a
          filled-in form still says which number is the rounds and which the
          rest. */}
      <div className="superset-form-round">
        <div className="exercise-amount-field">
          <input
            className="input"
            type="number"
            min="1"
            dir="auto"
            placeholder="مثلاً ۴"
            aria-label="تعداد ست"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
          />
          <span className="amount-unit">ست</span>
        </div>
        <div className="exercise-amount-field">
          <input
            className="input"
            type="number"
            min="0"
            dir="auto"
            placeholder="مثلاً ۹۰"
            aria-label="استراحت بعد از هر دور به ثانیه"
            value={rest}
            onChange={(e) => setRest(e.target.value)}
          />
          <span className="amount-unit">ثانیه استراحت بعد از هر دور</span>
        </div>
      </div>

      {!isEdit && (
        <>
          <ol className="superset-form-moves">
            {rows.map((row, index) => (
              <li key={row.key} className="superset-form-move">
                <span className="superset-index" aria-hidden="true">
                  {toPersianDigits(index + 1)}
                </span>
                <div className="superset-form-move-fields">
                  <MoveCombobox
                    moves={moves}
                    value={row.moveId}
                    onChange={(moveId) => updateRow(row.key, { moveId })}
                    placeholder={`حرکت ${toPersianDigits(index + 1)} — جستجو…`}
                  />
                  <div className="exercise-amount-field">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      dir="auto"
                      placeholder="مقدار"
                      aria-label={`مقدار حرکت ${index + 1}`}
                      value={row.amount}
                      onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                    />
                    <select
                      className="select"
                      aria-label={`نوع مقدار حرکت ${index + 1}`}
                      value={row.amountType}
                      onChange={(e) => updateRow(row.key, { amountType: e.target.value })}
                    >
                      <option value="reps">تکرار</option>
                      <option value="duration">ثانیه</option>
                    </select>
                  </div>
                </div>
                {rows.length > MIN_MOVES && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm icon-btn-danger"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    aria-label={`حذف حرکت ${index + 1}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          <div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((prev) => [...prev, newRow()])}>
              + حرکت دیگر
            </button>
          </div>
        </>
      )}

      <input
        className="input"
        dir="auto"
        placeholder="یادداشت (اختیاری)"
        aria-label="یادداشت سوپرست"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {error && <p className="error-text">{error}</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          انصراف
        </button>
        <button className="btn btn-secondary btn-sm" type="submit" disabled={isSaving}>
          {isSaving ? "در حال ذخیره…" : isEdit ? "ذخیره" : "ساخت سوپرست"}
        </button>
      </div>
    </form>
  );
}
