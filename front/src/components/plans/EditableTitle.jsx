import { useState } from "react";

import { CheckIcon, PencilIcon, XIcon } from "../common/icons.jsx";

/**
 * A page-title <h1> with a pencil button that swaps it for an inline
 * rename form. `onSave(trimmedName)` should PATCH the plan and throw on
 * failure — this component handles the editing/saving/error UI around it.
 */
export default function EditableTitle({ value, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  function startEdit() {
    setDraft(value);
    setError(null);
    setIsEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("نام نمی‌تواند خالی باشد.");
      return;
    }
    if (trimmed === value) {
      setIsEditing(false);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSave(trimmed);
      setIsEditing(false);
    } catch {
      setError("ذخیره نام با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing) {
    return (
      <div>
        <form className="editable-title-form" onSubmit={handleSave}>
          <input
            className="input"
            dir="auto"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isSaving}
            autoFocus
          />
          <button className="icon-btn icon-btn-sm" type="submit" disabled={isSaving} aria-label="ذخیره نام">
            <CheckIcon size={16} />
          </button>
          <button
            className="icon-btn icon-btn-sm"
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            aria-label="لغو ویرایش"
          >
            <XIcon size={16} />
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>
    );
  }

  return (
    <div className="editable-title">
      <h1 className="page-title">{value}</h1>
      <button type="button" className="icon-btn icon-btn-sm" onClick={startEdit} aria-label="ویرایش نام">
        <PencilIcon size={16} />
      </button>
    </div>
  );
}
