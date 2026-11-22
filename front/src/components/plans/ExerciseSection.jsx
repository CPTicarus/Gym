import { useState } from "react";

import { formatExerciseAmount, getSetTargets, parseExerciseAmount } from "../../utils/exerciseAmount.js";
import { nextOrder } from "../../utils/ordering.js";
import { dayBlocks } from "../../utils/supersets.js";
import { PencilIcon, TrashIcon } from "../common/icons.jsx";
import ExerciseAmountField from "./ExerciseAmountField.jsx";
import ExerciseDetail from "./ExerciseDetail.jsx";
import MoveCombobox from "./MoveCombobox.jsx";
import SupersetForm from "./SupersetForm.jsx";
import SupersetFrame from "./SupersetFrame.jsx";

/**
 * The fields for one exercise, used BOTH to add a new one and to edit an
 * existing one. Sharing it is the point: an add form and a separate edit
 * form drift apart the first time a field is added to one of them.
 *
 * `onCancel` is what distinguishes the two uses — an edit form is
 * dismissible and is unmounted by its parent on save, so it doesn't reset
 * itself; the add form stays mounted and clears after each submit.
 *
 * A superset supplies the move's set count and rest.
 */
function ExerciseForm({ moves, exercise, withRest, superset, submitLabel, onSubmit, onCancel }) {
  const [moveId, setMoveId] = useState(exercise?.move ? String(exercise.move) : "");
  const [sets, setSets] = useState(exercise?.sets != null ? String(exercise.sets) : "");
  const [amount, setAmount] = useState(() => formatExerciseAmount(exercise));
  const [amountType, setAmountType] = useState(
    exercise?.duration_seconds != null || exercise?.seconds_per_set != null ? "duration" : "reps"
  );
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
  const hasRest = withRest && !superset;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!moveId) {
      setError("یک حرکت انتخاب کنید.");
      return;
    }
    const setCount = superset?.sets ?? (sets === "" ? null : Number(sets));
    const prescription = parseExerciseAmount(amount, amountType, setCount);
    if (prescription.error) {
      setError(prescription.error);
      return;
    }
    setIsSaving(true);
    try {
      // Empty strings must become null, not "" — DRF rejects "" for
      // nullable integer fields.
      await onSubmit({
        move: Number(moveId),
        ...(!superset && { sets: setCount ?? getSetTargets(prescription)?.length ?? null }),
        ...prescription,
        ...(hasRest && { rest_seconds: rest === "" ? null : Number(rest) }),
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

      <div className="exercise-prescription-fields">
        {!superset && (
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
        )}
        <ExerciseAmountField
          amount={amount}
          amountType={amountType}
          onAmountChange={setAmount}
          onTypeChange={setAmountType}
        />
        {hasRest && (
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

function ExerciseSummary({ exercise }) {
  return (
    <div className="exercise-row-main">
      <span className="exercise-name">{exercise.move_detail?.name ?? "—"}</span>
      <ExerciseDetail exercise={exercise} />
      {exercise.notes && <span className="muted exercise-notes">{exercise.notes}</span>}
    </div>
  );
}

function RowActions({ label, onEdit, onDelete }) {
  return (
    <div className="flex flex-none items-center gap-1">
      <button type="button" className="icon-btn icon-btn-sm" onClick={onEdit} aria-label={`ویرایش ${label}`}>
        <PencilIcon size={15} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-sm icon-btn-danger"
        onClick={onDelete}
        aria-label={`حذف ${label}`}
      >
        <TrashIcon size={16} />
      </button>
    </div>
  );
}

/**
 * Renders one list of exercises plus an "add" form. Used by all three
 * workout-plan sections — warmup, a single day, and daily items — since
 * they differ only in whether rest_seconds applies and which endpoint
 * the parent wires into onAdd/onUpdate/onDelete.
 *
 * Passing `supersets` (a training day's) turns them on: the day's moves are
 * grouped into superset boxes (see dayBlocks), each with its round editable
 * and room to add a move, and a "+ superset" form appears under the add
 * form. A superset's moves go through the same onAdd/onUpdate/onDelete as
 * any exercise — they ARE the day's exercises; only the round has its own
 * callbacks.
 */
export default function ExerciseSection({
  exercises = [],
  supersets,
  moves = [],
  onAdd,
  onUpdate,
  onDelete,
  onAddSuperset,
  onUpdateSuperset,
  onDeleteSuperset,
  withRest = false,
  emptyText = "هنوز حرکتی اضافه نشده.",
  readOnly = false,
}) {
  // Whatever is open as a form in place of what it edits — one at a time:
  // "exercise-<id>", "superset-<id>" (its round), or "join-<id>" (adding a
  // move to that superset).
  const [openForm, setOpenForm] = useState(null);
  const [isAddingSuperset, setIsAddingSuperset] = useState(false);

  const blocks = dayBlocks({ exercises, supersets });
  const appendOrder = nextOrder(exercises);

  /** A move's row contents — or, while it's being edited, its form. */
  function exerciseContent(exercise, superset) {
    const key = `exercise-${exercise.id}`;
    if (openForm === key) {
      return (
        <ExerciseForm
          moves={moves}
          exercise={exercise}
          withRest={withRest}
          superset={superset}
          submitLabel="ذخیره"
          onCancel={() => setOpenForm(null)}
          onSubmit={async (payload) => {
            await onUpdate(exercise, payload);
            setOpenForm(null);
          }}
        />
      );
    }
    return (
      <>
        <ExerciseSummary exercise={exercise} />
        {!readOnly && (
          <RowActions
            label={exercise.move_detail?.name ?? "حرکت"}
            onEdit={() => setOpenForm(key)}
            onDelete={() => onDelete(exercise)}
          />
        )}
      </>
    );
  }

  function renderSuperset(superset) {
    const roundKey = `superset-${superset.id}`;
    const joinKey = `join-${superset.id}`;
    const label = superset.name || "سوپرست";
    return (
      <SupersetFrame
        key={roundKey}
        superset={superset}
        renderMove={(exercise) => <div className="superset-move-body">{exerciseContent(exercise, superset)}</div>}
        editor={
          openForm === roundKey ? (
            <SupersetForm
              moves={moves}
              superset={superset}
              onCancel={() => setOpenForm(null)}
              onSubmit={async (payload) => {
                await onUpdateSuperset(superset, payload);
                setOpenForm(null);
              }}
            />
          ) : null
        }
        actions={
          !readOnly && (
            <RowActions
              label={label}
              onEdit={() => setOpenForm(roundKey)}
              onDelete={() => {
                if (window.confirm(`«${label}» با همه حرکاتش حذف شود؟`)) onDeleteSuperset(superset);
              }}
            />
          )
        }
        footer={
          !readOnly &&
          (openForm === joinKey ? (
            <ExerciseForm
              moves={moves}
              superset={superset}
              submitLabel="+ افزودن به سوپرست"
              onCancel={() => setOpenForm(null)}
              onSubmit={async (payload) => {
                await onAdd({ ...payload, superset: superset.id, order: appendOrder });
                setOpenForm(null);
              }}
            />
          ) : (
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenForm(joinKey)}>
                + حرکت دیگر در این سوپرست
              </button>
            </div>
          ))
        }
      />
    );
  }

  return (
    <div>
      {blocks.length === 0 ? (
        <p className="muted exercise-empty">{emptyText}</p>
      ) : (
        <ul className="exercise-list">
          {blocks.map((block) =>
            block.type === "superset" ? (
              renderSuperset(block.superset)
            ) : (
              // The row becomes the form in place, so it stays where it is
              // in the list while you edit it.
              <li
                key={block.key}
                className={`exercise-row${openForm === block.key ? " flex-col items-stretch" : ""}`}
              >
                {exerciseContent(block.exercise)}
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
          onSubmit={(payload) => onAdd({ ...payload, order: appendOrder })}
        />
      )}

      {!readOnly &&
        onAddSuperset &&
        (isAddingSuperset ? (
          <SupersetForm
            moves={moves}
            onCancel={() => setIsAddingSuperset(false)}
            onSubmit={async (payload) => {
              await onAddSuperset(payload);
              setIsAddingSuperset(false);
            }}
          />
        ) : (
          <div className="form-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsAddingSuperset(true)}>
              + سوپرست — چند حرکت پشت سر هم
            </button>
          </div>
        ))}
    </div>
  );
}
