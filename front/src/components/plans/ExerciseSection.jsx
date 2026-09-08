import { useState } from "react";

import { formatExerciseDetail } from "../../utils/planFormat.js";
import { PencilIcon, TrashIcon } from "../common/icons.jsx";
import MoveCombobox from "./MoveCombobox.jsx";

/** A move is measured one way or the other — counted reps, or held for a
 *  duration (a plank) — never both, so an exercise maps onto one value
 *  plus a type rather than two separate inputs. */
function amountFieldsFrom(exercise) {
  if (exercise?.duration_seconds != null) {
    return { amount: String(exercise.duration_seconds), amountType: "duration" };
  }
  return { amount: exercise?.reps != null ? String(exercise.reps) : "", amountType: "reps" };
}

/**
 * The fields for one exercise, used BOTH to add a new one and to edit an
 * existing one. Sharing it is the point: an add form and a separate edit
 * form drift apart the first time a field is added to one of them.
 *
 * `onCancel` is what distinguishes the two uses — an edit form is
 * dismissible and is unmounted by its parent on save, so it doesn't reset
 * itself; the add form stays mounted and clears after each submit.
 */
function ExerciseForm({ moves, exercise, withRest, submitLabel, onSubmit, onCancel }) {
  const initialAmount = amountFieldsFrom(exercise);
  const [moveId, setMoveId] = useState(exercise?.move ? String(exercise.move) : "");
  const [sets, setSets] = useState(exercise?.sets != null ? String(exercise.sets) : "");
  const [amount, setAmount] = useState(initialAmount.amount);
  const [amountType, setAmountType] = useState(initialAmount.amountType);
  const [rest, setRest] = useState(
    exercise?.rest_seconds != null ? String(exercise.rest_seconds) : ""
  );
  const [notes, setNotes] = useState(exercise?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  // Bumped after each successful add to force MoveCombobox to remount (see
  // its own comment for why this beats syncing its query from moveId).
  const [comboKey, setComboKey] = useState(0);

  const isEdit = Boolean(onCancel);

  async function handleSubmit(e) {
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
      await onSubmit({
        move: Number(moveId),
        sets: sets === "" ? null : Number(sets),
        reps: amountType === "reps" ? amountValue : null,
        duration_seconds: amountType === "duration" ? amountValue : null,
        ...(withRest ? { rest_seconds: rest === "" ? null : Number(rest) } : {}),
        notes: notes.trim(),
      });
      if (!isEdit) {
        setMoveId("");
        setComboKey((k) => k + 1);
        setSets("");
        setAmount("");
        setAmountType("reps");
        setRest("");
        setNotes("");
      }
    } catch {
      setError(isEdit ? "ذخیره تغییرات با مشکل مواجه شد." : "افزودن حرکت با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="exercise-add-form" onSubmit={handleSubmit}>
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

      <div className="form-actions">
        {isEdit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            انصراف
          </button>
        )}
        <button
          className={isEdit ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}
          type="submit"
          disabled={isSaving}
        >
          {isSaving ? "در حال ذخیره…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * Renders one list of exercises plus an "add" form. Used by all three
 * workout-plan sections — warmup, a single day, and daily items — since
 * they differ only in whether rest_seconds applies and which endpoint
 * the parent wires into onAdd/onUpdate/onDelete.
 */
export default function ExerciseSection({
  exercises = [],
  moves = [],
  onAdd,
  onUpdate,
  onDelete,
  withRest = false,
  emptyText = "هنوز حرکتی اضافه نشده.",
  readOnly = false,
}) {
  const [editingId, setEditingId] = useState(null);

  return (
    <div>
      {exercises.length === 0 ? (
        <p className="muted exercise-empty">{emptyText}</p>
      ) : (
        <ul className="exercise-list">
          {exercises.map((ex) =>
            editingId === ex.id ? (
              // The row becomes the form in place, so it stays where it is
              // in the list while you edit it.
              <li key={ex.id} className="exercise-row flex-col items-stretch">
                <ExerciseForm
                  moves={moves}
                  exercise={ex}
                  withRest={withRest}
                  submitLabel="ذخیره"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (payload) => {
                    await onUpdate(ex, payload);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={ex.id} className="exercise-row">
                <div className="exercise-row-main">
                  <span className="exercise-name">{ex.move_detail?.name ?? "—"}</span>
                  <span className="muted exercise-detail">{formatExerciseDetail(ex)}</span>
                  {ex.notes && <span className="muted exercise-notes">{ex.notes}</span>}
                </div>
                {!readOnly && (
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={() => setEditingId(ex.id)}
                      aria-label={`ویرایش ${ex.move_detail?.name ?? "حرکت"}`}
                    >
                      <PencilIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm icon-btn-danger"
                      onClick={() => onDelete(ex)}
                      aria-label={`حذف ${ex.move_detail?.name ?? "حرکت"}`}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      )}

      {!readOnly && (
        <ExerciseForm
          moves={moves}
          withRest={withRest}
          submitLabel="+ افزودن حرکت"
          onSubmit={(payload) => onAdd({ ...payload, order: exercises.length })}
        />
      )}
    </div>
  );
}
