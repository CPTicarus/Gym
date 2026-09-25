import { useEffect, useRef, useState } from "react";

import {
  deleteBodyPhotoExample,
  listBodyPhotoExamples,
  uploadBodyPhotoExample,
} from "../../api/body.js";
import { BODY_POSES } from "../../constants/bodyPoses.js";
import { TrashIcon } from "../common/icons.jsx";
import BodyPhotoImage from "./BodyPhotoImage.jsx";

function ExampleSlot({ pose, label, example, isBusy, onPick, onDelete }) {
  const inputRef = useRef(null);

  return (
    <div className="body-photo-slot">
      <span className="body-photo-label">{label}</span>

      {example ? (
        <BodyPhotoImage
          photoId={example.id}
          kind="example"
          version={example.updated_at}
          alt={`نمونه ${label}`}
        />
      ) : (
        <div className="body-photo-frame is-empty">نمونه‌ای ثبت نشده</div>
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
          {example ? "تعویض" : "افزودن"}
        </button>
        {example && (
          <button
            type="button"
            className="icon-btn icon-btn-sm icon-btn-danger"
            disabled={isBusy}
            onClick={() => onDelete(example)}
            aria-label={`حذف نمونه ${label}`}
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Where a trainer sets the gym's demonstration photos.
 *
 * "Front, side, back" leaves a member guessing about distance, lighting,
 * what to wear and where to put their arms. One posed photo per angle
 * answers all of it, and it shows up in the empty slot the member is
 * about to fill rather than as instructions they'd have to go and find.
 *
 * Gym-wide: one set for everybody. Having none is fine — members just see
 * empty slots, exactly as before these existed.
 */
export default function BodyPhotoExampleManager() {
  const [examples, setExamples] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyPose, setBusyPose] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listBodyPhotoExamples()
      .then((data) => {
        if (!cancelled) setExamples(data);
      })
      .catch(() => {
        if (!cancelled) setError("بارگذاری نمونه‌ها با مشکل مواجه شد.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePick(pose, file) {
    setError(null);
    setBusyPose(pose);
    try {
      const saved = await uploadBodyPhotoExample(pose, file);
      // One example per pose gym-wide, so this replaces rather than adds.
      setExamples((prev) => [...prev.filter((e) => e.pose !== pose), saved]);
    } catch (err) {
      const detail = err?.response?.data?.image?.[0];
      setError(
        detail || "ثبت نمونه با مشکل مواجه شد. عکس باید jpg، png یا webp و کمتر از ۸ مگابایت باشد."
      );
    } finally {
      setBusyPose(null);
    }
  }

  async function handleDelete(example) {
    if (!window.confirm("این نمونه حذف شود؟ اعضا دیگر آن را نمی‌بینند.")) return;
    setError(null);
    setBusyPose(example.pose);
    try {
      await deleteBodyPhotoExample(example.id);
      setExamples((prev) => prev.filter((e) => e.id !== example.id));
    } catch {
      setError("حذف نمونه با مشکل مواجه شد.");
    } finally {
      setBusyPose(null);
    }
  }

  const byPose = Object.fromEntries(examples.map((e) => [e.pose, e]));

  return (
    <section className="card plan-section">
      <h2 className="plan-section-title">نمونه عکس‌های بدن</h2>
      <p className="muted plan-section-hint">
        برای هر زاویه یک عکس نمونه بگذارید تا اعضا بدانند عکس درست چه شکلی است. این نمونه‌ها را همه
        اعضای باشگاه در صفحه «بدن من» می‌بینند، پس عکسی بگذارید که برای نمایش عمومی مناسب باشد.
        گذاشتن نمونه اجباری نیست.
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
            <ExampleSlot
              key={pose}
              pose={pose}
              label={label}
              example={byPose[pose]}
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
