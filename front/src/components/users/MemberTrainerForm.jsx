import { useEffect, useState } from "react";

import { listAvailableTrainers, updateUser } from "../../api/users.js";
import { trainerName } from "../../utils/format.js";

export default function MemberTrainerForm({ member, onSaved }) {
  const [trainers, setTrainers] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [trainerId, setTrainerId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    listAvailableTrainers(controller.signal).then(setTrainers).catch(() => {
      if (!controller.signal.aborted) setLoadError(true);
    });
    return () => controller.abort();
  }, [loadAttempt]);

  function reloadTrainers() {
    setTrainers(null);
    setLoadError(false);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const updated = await updateUser(member.id, { trainer_id: trainerId === "" ? null : Number(trainerId) });
      onSaved(updated);
      setTrainerId(null);
      setSaveMessage("انتخاب مربی ذخیره شد.");
    } catch (err) {
      if (err?.response?.data?.trainer_id) {
        setTrainerId(null);
        reloadTrainers();
        setSaveError("مربی انتخاب‌شده دیگر در دسترس نیست. مربی دیگری انتخاب کنید.");
      } else {
        setSaveError("ذخیره مربی با مشکل مواجه شد.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  const current = member.trainer;
  const currentId = current ? String(current.id) : "";
  const currentUnavailable = current && trainers && !trainers.some(({ id }) => id === current.id);

  return (
    <section className="card plan-section">
      <h2 className="plan-section-title">مربی عضو</h2>
      <form onSubmit={handleSubmit}>
        <label className="field">
          <span className="label">مربی</span>
          <select
            className="select"
            value={trainerId ?? currentId}
            disabled={!trainers || isSaving}
            onChange={(e) => {
              setTrainerId(e.target.value);
              setSaveMessage("");
            }}
          >
            <option value="">بدون مربی</option>
            {current && (!trainers || currentUnavailable) && (
              <option value={current.id} disabled>
                {trainerName(current)}{currentUnavailable ? " (در دسترس نیست)" : ""}
              </option>
            )}
            {trainers?.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>{trainerName(trainer)}</option>
            ))}
          </select>
        </label>
        {!trainers && !loadError && <p className="muted">در حال بارگذاری مربیان…</p>}
        {loadError && (
          <div>
            <p className="error-text" role="alert">فهرست مربیان بارگذاری نشد.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reloadTrainers}>تلاش دوباره</button>
          </div>
        )}
        {saveMessage && <p className="success-text" role="status">{saveMessage}</p>}
        {saveError && <p className="error-text" role="alert">{saveError}</p>}
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!trainers || isSaving || trainerId === null || trainerId === currentId}
        >
          {isSaving ? "در حال ذخیره…" : "ذخیره مربی"}
        </button>
      </form>
    </section>
  );
}
