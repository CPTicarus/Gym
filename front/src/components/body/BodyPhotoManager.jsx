import { useEffect, useRef, useState } from "react";

import {
  deleteBodyPhoto,
  listBodyPhotoExamples,
  listMyBodyPhotos,
  uploadBodyPhoto,
} from "../../api/body.js";
import { BODY_POSES } from "../../constants/bodyPoses.js";
import { TrashIcon } from "../common/icons.jsx";
import BodyPhotoImage from "./BodyPhotoImage.jsx";

/**
 * One pose: whatever is stored for it, plus the controls to replace or
 * remove it. Keeping the three slots fixed — rather than a list you add
 * to — is what makes the set legible to a trainer: three known angles,
 * each either filled or not.
 */
function PoseSlot({ pose, label, photo, example, isBusy, onPick, onDelete }) {
  const inputRef = useRef(null);

  return (
    <div className="body-photo-slot">
      <span className="body-photo-label">{label}</span>

      {photo ? (
        <BodyPhotoImage photoId={photo.id} alt={label} />
      ) : example ? (
        // The gym's demonstration, shown in the slot it explains. Dimmed
        // and captioned so it can't be mistaken for a photo the member has
        // already uploaded — the whole slot still reads as empty.
        <div className="body-photo-example">
          <BodyPhotoImage photoId={example.id} kind="example" alt={`نمونه ${label}`} />
          <span className="body-photo-example-tag">نمونه</span>
        </div>
      ) : (
        <div className="body-photo-frame is-empty">عکسی ثبت نشده</div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first, so picking the same file twice in a row (after a
          // failed upload) still fires a change event.
          e.target.value = "";
          if (file) onPick(pose, file);
        }}
      />

      <div className="body-photo-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={isBusy}
          onClick={() => inputRef.current?.click()}
        >
          {photo ? "تعویض" : "افزودن"}
        </button>
        {photo && (
          <button
            type="button"
            className="icon-btn icon-btn-sm icon-btn-danger"
            disabled={isBusy}
            onClick={() => onDelete(photo)}
            aria-label={`حذف عکس ${label}`}
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The member's own front / side / back photos.
 *
 * Worth being explicit in the UI about who sees these, which is why the
 * hint below names the audience rather than saying something vague about
 * privacy: someone is being asked to photograph their own body, and the
 * honest answer to "who will see this" is short enough to just state.
 */
export default function BodyPhotoManager() {
  const [photos, setPhotos] = useState([]);
  const [examples, setExamples] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPose, setBusyPose] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listMyBodyPhotos()
      .then((data) => {
        if (!cancelled) setPhotos(data);
      })
      .catch(() => {
        if (!cancelled) setError("بارگذاری عکس‌ها با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Separate, and failing silently: the examples are guidance. A gym that
  // hasn't posed for them yet, or a request that fails, just means the
  // empty slots look the way they always did.
  useEffect(() => {
    let cancelled = false;
    listBodyPhotoExamples()
      .then((data) => {
        if (!cancelled) setExamples(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePick(pose, file) {
    setError(null);
    setBusyPose(pose);
    try {
      const saved = await uploadBodyPhoto(pose, file);
      // Replace the row for this pose rather than appending — the server
      // swaps in place, so a second "front" is the same record.
      setPhotos((prev) => [...prev.filter((p) => p.pose !== pose), saved]);
    } catch (err) {
      const detail = err?.response?.data?.image?.[0];
      setError(detail || "ثبت عکس با مشکل مواجه شد. عکس باید jpg، png یا webp و کمتر از ۸ مگابایت باشد.");
    } finally {
      setBusyPose(null);
    }
  }

  async function handleDelete(photo) {
    if (!window.confirm("این عکس حذف شود؟")) return;
    setError(null);
    setBusyPose(photo.pose);
    try {
      await deleteBodyPhoto(photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch {
      setError("حذف عکس با مشکل مواجه شد.");
    } finally {
      setBusyPose(null);
    }
  }

  const byPose = Object.fromEntries(photos.map((p) => [p.pose, p]));
  const examplesByPose = Object.fromEntries(examples.map((e) => [e.pose, e]));

  return (
    <section className="card plan-section">
      <h2 className="plan-section-title">عکس‌های بدن</h2>
      <p className="muted plan-section-hint">
        سه عکس از روبرو، پهلو و پشت به مربی کمک می‌کند برنامه دقیق‌تری بنویسد. این عکس‌ها را فقط
        خودتان و مربی می‌بینند، و هر وقت بخواهید می‌توانید حذفشان کنید.
      </p>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : (
        <div className="body-photo-grid">
          {BODY_POSES.map(([pose, label]) => (
            <PoseSlot
              key={pose}
              pose={pose}
              label={label}
              photo={byPose[pose]}
              example={examplesByPose[pose]}
              isBusy={busyPose === pose}
              onPick={handlePick}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  );
}
