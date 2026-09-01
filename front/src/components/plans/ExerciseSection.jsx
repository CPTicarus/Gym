import { useState } from "react";

import { formatExerciseDetail } from "../../utils/planFormat.js";
import { TrashIcon } from "../common/icons.jsx";
import MoveCombobox from "./MoveCombobox.jsx";

/**
 * Renders one list of exercises plus an "add" form. Used by all three
 * workout-plan sections — warmup, a single day, and daily items — since
 * they differ only in whether rest_seconds applies and which endpoint
 * the parent wires into onAdd/onDelete.
 */

export default function ExerciseSection({
  exercises = [],
  moves = [],
  onAdd,
  onDelete,
  withRest = false,
  emptyText = "هنوز حرکتی اضافه نشده.",
  readOnly = false,
}) {
  const [moveId, setMoveId] = useState("");
  const [sets, setSets] = useState("");
  // A move is measured one way or the other — counted reps, or held for a
  // duration (e.g. a plank) — never both, so this is one value plus a type
  // picker instead of two separate reps/duration inputs.
  const [amount, setAmount] = useState("");
  const [amountType, setAmountType] = useState("reps");
  const [rest, setRest] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  // Bumped after each successful add to force MoveCombobox to remount (see
  // its own comment for why this beats syncing its query from moveId).
  const [comboKey, setComboKey] = useState(0);

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    if (!moveId) {
      setError("یک حرکت انتخاب کنید.");
      return;
    }
    setIsSaving(true);
    try {
      // Empty strings must become null, not "" — DRF rejects "" for
      // nullable integer fields.
      const amountValue = amount === "" ? null : Number(amount);
      await onAdd({
        move: Number(moveId),
        sets: sets === "" ? null : Number(sets),
        reps: amountType === "reps" ? amountValue : null,
        duration_seconds: amountType === "duration" ? amountValue : null,
        ...(withRest ? { rest_seconds: rest === "" ? null : Number(rest) } : {}),
        notes: notes.trim(),
        order: exercises.length,
      });
      setMoveId("");
      setComboKey((k) => k + 1);
      setSets("");
      setAmount("");
      setAmountType("reps");
      setRest("");
      setNotes("");
    } catch {
      setError("افزودن حرکت با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      {exercises.length === 0 ? (
        <p className="muted exercise-empty">{emptyText}</p>
      ) : (
        <ul className="exercise-list">
          {exercises.map((ex) => (
            <li key={ex.id} className="exercise-row">
              <div className="exercise-row-main">
                <span className="exercise-name">{ex.move_detail?.name ?? "—"}</span>
                <span className="muted exercise-detail">{formatExerciseDetail(ex)}</span>
                {ex.notes && <span className="muted exercise-notes">{ex.notes}</span>}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => onDelete(ex)}
                  aria-label={`حذف ${ex.move_detail?.name ?? "حرکت"}`}
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form className="exercise-add-form" onSubmit={handleAdd}>
          <MoveCombobox key={comboKey} moves={moves} value={moveId} onChange={setMoveId} />

          <div className="exercise-add-numbers">
            <input
              className="input"
              type="number"
              min="0"
              dir="auto"
              placeholder="ست"
              aria-label="تعداد ست"
              value={sets}
              onChange={(e) => setSets(e.target.value)}
            />
            <div className="exercise-amount-field">
              <input
                className="input"
                type="number"
                min="0"
                dir="auto"
                placeholder="مقدار"
                aria-label="مقدار"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <select
                className="select"
                aria-label="نوع مقدار"
                value={amountType}
                onChange={(e) => setAmountType(e.target.value)}
              >
                <option value="reps">تکرار</option>
                <option value="duration">ثانیه</option>
              </select>
            </div>
            {withRest && (
              <input
                className="input"
                type="number"
                min="0"
                dir="auto"
                placeholder="استراحت"
                aria-label="استراحت به ثانیه"
                value={rest}
                onChange={(e) => setRest(e.target.value)}
              />
            )}
          </div>

          <input
            className="input"
            dir="auto"
            placeholder="یادداشت (اختیاری)"
            aria-label="یادداشت"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-ghost btn-sm" type="submit" disabled={isSaving}>
            {isSaving ? "در حال افزودن…" : "+ افزودن حرکت"}
          </button>
        </form>
      )}
    </div>
  );
}
