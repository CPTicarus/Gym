import { useState } from "react";

import Modal from "../common/Modal.jsx";

/**
 * Shared by the workout and diet plan builders — edits name, goal, and
 * description in one place. `goalOptions` is WORKOUT_GOALS or DIET_GOALS
 * (they differ per plan type); `onSave(payload)` PATCHes and reloads.
 */
export default function EditPlanInfoModal({ plan, goalOptions, onSave, onClose }) {
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState(plan.goal ?? "");
  const [description, setDescription] = useState(plan.description ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("نام الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ name: trimmedName, goal, description: description.trim() });
      onClose();
    } catch {
      setError("ذخیره تغییرات با مشکل مواجه شد.");
      setIsSaving(false);
    }
  }

  return (
    <Modal title="ویرایش برنامه" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="label">نام برنامه</span>
          <input className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label className="field">
          <span className="label">هدف</span>
          <select className="select" value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option value="">—</option>
            {goalOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">توضیحات (اختیاری)</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "در حال ذخیره…" : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
