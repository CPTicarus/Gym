import { useState } from "react";

import { PencilIcon, TrashIcon } from "../common/icons.jsx";

/**
 * The fields for one supplement entry, used BOTH to add a new one and to
 * edit an existing one — so the two can't drift apart as fields are added.
 *
 * `onCancel` marks the edit use: that form is unmounted by its parent on
 * save, so it doesn't clear itself; the add form stays mounted and does.
 */
function SupplementItemForm({ item, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(item?.name ?? "");
  const [dosage, setDosage] = useState(item?.dosage ?? "");
  const [timing, setTiming] = useState(item?.timing ?? "");
  const [frequency, setFrequency] = useState(item?.frequency ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = Boolean(onCancel);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("نام مکمل الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        dosage: dosage.trim(),
        timing: timing.trim(),
        frequency: frequency.trim(),
        notes: notes.trim(),
      });
      if (!isEdit) {
        setName("");
        setDosage("");
        setTiming("");
        setFrequency("");
        setNotes("");
      }
    } catch {
      setError(isEdit ? "ذخیره تغییرات با مشکل مواجه شد." : "افزودن مکمل با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="exercise-add-form" onSubmit={handleSubmit} noValidate>
      <div className="item-add-top">
        <input
          className="input"
          dir="auto"
          placeholder="نام مکمل (مثلاً وی پروتئین)"
          aria-label="نام مکمل"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          dir="auto"
          placeholder="مقدار (مثلاً ۳۰ گرم)"
          aria-label="مقدار"
          value={dosage}
          onChange={(e) => setDosage(e.target.value)}
        />
      </div>

      <div className="item-add-top">
        <input
          className="input"
          dir="auto"
          placeholder="زمان مصرف (مثلاً بعد از تمرین)"
          aria-label="زمان مصرف"
          value={timing}
          onChange={(e) => setTiming(e.target.value)}
        />
        <input
          className="input"
          dir="auto"
          placeholder="تناوب (مثلاً روزانه)"
          aria-label="تناوب"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
        />
      </div>

      <input
        className="input"
        dir="auto"
        placeholder="توضیح (اختیاری)"
        aria-label="توضیح"
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
 * The contents of a protocol — one row per product, with its dose and
 * when to take it.
 *
 * Read-only when the handlers are absent, which is how the member-facing
 * page reuses it.
 */
export default function SupplementItemList({ items = [], onAdd, onUpdate, onDelete, deletingId }) {
  const [editingId, setEditingId] = useState(null);
  const readOnly = !onAdd;

  return (
    <div>
      {items.length === 0 ? (
        <p className="muted exercise-empty">هنوز مکملی به این برنامه اضافه نشده.</p>
      ) : (
        <ul className="exercise-list">
          {items.map((item) =>
            editingId === item.id ? (
              // The row becomes the form in place, so it keeps its position
              // in the protocol while you edit it.
              <li key={item.id} className="exercise-row flex-col items-stretch">
                <SupplementItemForm
                  item={item}
                  submitLabel="ذخیره"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (payload) => {
                    await onUpdate(item, payload);
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={item.id} className="exercise-row">
                <div className="exercise-row-main">
                  <span className="exercise-name">
                    {item.name}
                    {item.dosage && <span className="ltr mr-2 font-normal">{item.dosage}</span>}
                  </span>
                  {(item.timing || item.frequency) && (
                    <span className="muted exercise-detail">
                      {[item.timing, item.frequency].filter(Boolean).join(" • ")}
                    </span>
                  )}
                  {item.notes && <span className="muted exercise-notes">{item.notes}</span>}
                </div>
                {!readOnly && (
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={() => setEditingId(item.id)}
                      aria-label={`ویرایش ${item.name}`}
                    >
                      <PencilIcon size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm icon-btn-danger"
                      onClick={() => onDelete(item)}
                      disabled={deletingId === item.id}
                      aria-label={`حذف ${item.name}`}
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
        <SupplementItemForm
          submitLabel="+ افزودن مکمل"
          onSubmit={(payload) => onAdd({ ...payload, order: items.length })}
        />
      )}
    </div>
  );
}
