import { useEffect, useRef, useState } from "react";

import {
  deleteBodyPhoto,
  listBodyPhotoExamples,
  listMyBodyPhotos,
  replaceBodyPhoto,
  updateBodyPhotoNote,
  uploadBodyPhoto,
} from "../../api/body.js";
import { BODY_POSES, EXTRA_POSE, MAX_EXTRA_PHOTOS, MAX_NOTE_LENGTH } from "../../constants/bodyPoses.js";
import { toPersianDigits } from "../../utils/jalali.js";
import Modal from "../common/Modal.jsx";
import { TrashIcon } from "../common/icons.jsx";
import BodyPhotoImage from "./BodyPhotoImage.jsx";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const UPLOAD_ERROR = "ثبت عکس با مشکل مواجه شد. عکس باید jpg، png یا webp و کمتر از ۸ مگابایت باشد.";

function uploadErrorMessage(err) {
  return err?.response?.data?.image?.[0] || UPLOAD_ERROR;
}

/** A button that opens the photo picker, with its hidden file input. */
function PickImageButton({ label, disabled, onFile }) {
  const inputRef = useRef(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={IMAGE_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first, so picking the same file twice in a row (after a
          // failed upload) still fires a change event.
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
    </>
  );
}

/**
 * One photo slot: whatever is stored in it, plus the controls to replace
 * or remove it. Used for the three main poses — fixed slots rather than a
 * list you add to, which is what makes that set legible to a trainer:
 * three known angles, each either filled or not — and for each extra,
 * which has no label but can carry a note (`onEditNote`).
 */
function PhotoSlot({ label, alt, photo, example, isBusy, onPick, onDelete, onEditNote }) {
  const name = label ?? alt;
  return (
    <div className="body-photo-slot">
      {label && <span className="body-photo-label">{label}</span>}

      {photo ? (
        <BodyPhotoImage photoId={photo.id} version={photo.uploaded_at} alt={name} />
      ) : example ? (
        // The gym's demonstration, shown in the slot it explains. Dimmed
        // and captioned so it can't be mistaken for a photo the member has
        // already uploaded — the whole slot still reads as empty.
        <div className="body-photo-example">
          <BodyPhotoImage
            photoId={example.id}
            kind="example"
            version={example.updated_at}
            alt={`نمونه ${label}`}
          />
          <span className="body-photo-example-tag">نمونه</span>
        </div>
      ) : (
        <div className="body-photo-frame is-empty">عکسی ثبت نشده</div>
      )}

      {photo && onEditNote && (
        <button
          type="button"
          className={`body-photo-note body-photo-note-btn${photo.note ? "" : " is-empty"}`}
          onClick={() => onEditNote(photo)}
          title={photo.note || undefined}
        >
          {photo.note || "+ یادداشت"}
        </button>
      )}

      <div className="body-photo-actions">
        <PickImageButton label={photo ? "تعویض" : "افزودن"} disabled={isBusy} onFile={onPick} />
        {photo && (
          <button
            type="button"
            className="icon-btn icon-btn-sm icon-btn-danger"
            disabled={isBusy}
            onClick={() => onDelete(photo)}
            aria-label={label ? `حذف عکس ${label}` : `حذف ${alt}`}
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Add, change or clear the note on an extra photo. A dialog rather than a
 * field in the slot, which is a third of a phone's width. */
function NoteModal({ photo, onSave, onClose }) {
  const [text, setText] = useState(photo.note ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSave(photo, text.trim());
      onClose();
    } catch {
      setError("ذخیره یادداشت با مشکل مواجه شد.");
      setIsSaving(false);
    }
  }

  return (
    <Modal title="یادداشت برای مربی" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span className="label">اگر چیزی درباره این عکس هست که مربی باید بداند</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            autoFocus
            placeholder=""
            value={text}
            onChange={(e) => setText(e.target.value)}
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

/**
 * Photos past the main three, for the few members who want to show more —
 * a back lat spread, a side chest, whatever their trainer asked to see.
 *
 * Just photos: what one shows is plain from the picture, so adding one is
 * a single tap straight to the photo picker, with nothing to fill in. A
 * note for the trainer is there for anyone who wants it, under the photo.
 *
 * Behind one quiet toggle, collapsed: most members will never use this,
 * and the three main slots are what the page is for. It starts open when
 * there's already something in it, so a member never has to go looking
 * for photos they added themselves.
 */
function ExtraPhotos({ extras, busyKey, error, onAdd, onReplace, onDelete, onSaveNote }) {
  const [isOpen, setIsOpen] = useState(extras.length > 0);
  const [notePhoto, setNotePhoto] = useState(null);
  const isFull = extras.length >= MAX_EXTRA_PHOTOS;

  return (
    <div className="body-photo-extras">
      <button
        type="button"
        className="body-photo-extras-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span>
          عکس‌های بیشتر
          {extras.length > 0 && ` — ${toPersianDigits(extras.length)} عکس`}
        </span>
        <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
      </button>

      {isOpen && (
        <>
          <p className="muted plan-section-hint">
            تا {toPersianDigits(MAX_EXTRA_PHOTOS)} عکس اجازه آپلود دارید
          </p>

          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}

          {extras.length > 0 && (
            <div className="body-photo-grid">
              {extras.map((photo, index) => (
                <PhotoSlot
                  key={photo.id}
                  alt={`عکس بیشتر ${toPersianDigits(index + 1)}`}
                  photo={photo}
                  isBusy={busyKey === `extra-${photo.id}`}
                  onPick={(file) => onReplace(photo, file)}
                  onDelete={onDelete}
                  onEditNote={setNotePhoto}
                />
              ))}
            </div>
          )}

          {isFull ? (
            <p className="muted plan-section-hint">
              به سقف {toPersianDigits(MAX_EXTRA_PHOTOS)} عکس رسیده‌اید — برای عکس تازه، یکی را حذف کنید.
            </p>
          ) : (
            <PickImageButton
              label={busyKey === "extra-new" ? "در حال ثبت…" : "+ افزودن عکس"}
              disabled={busyKey === "extra-new"}
              onFile={onAdd}
            />
          )}
        </>
      )}

      {notePhoto && <NoteModal photo={notePhoto} onSave={onSaveNote} onClose={() => setNotePhoto(null)} />}
    </div>
  );
}

/**
 * The member's own front / side / back photos, and any extras.
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
  // Which slot is mid-request: a main pose's name, "extra-<id>", or
  // "extra-new" while one is being added.
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState(null);
  const [extraError, setExtraError] = useState(null);

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

  /** Run one upload/replace/delete with its slot marked busy; errors land
   * next to the photos they're about. */
  async function run(key, isExtra, action, failure) {
    const setSlotError = isExtra ? setExtraError : setError;
    setSlotError(null);
    setBusyKey(key);
    try {
      await action();
    } catch (err) {
      setSlotError(failure(err));
    } finally {
      setBusyKey(null);
    }
  }

  function handlePickMain(pose, file) {
    run(pose, false, async () => {
      const saved = await uploadBodyPhoto(pose, file);
      // Replace the row for this pose rather than appending — the server
      // swaps in place, so a second "front" is the same record.
      setPhotos((prev) => [...prev.filter((p) => p.pose !== pose), saved]);
    }, uploadErrorMessage);
  }

  function handleAddExtra(file) {
    run("extra-new", true, async () => {
      const saved = await uploadBodyPhoto(EXTRA_POSE, file);
      setPhotos((prev) => [...prev, saved]);
    }, uploadErrorMessage);
  }

  function handleReplaceExtra(photo, file) {
    run(`extra-${photo.id}`, true, async () => {
      const saved = await replaceBodyPhoto(photo.id, file);
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? saved : p)));
    }, uploadErrorMessage);
  }

  /** Throws on failure — the note dialog shows its own error. */
  async function handleSaveNote(photo, note) {
    const saved = await updateBodyPhotoNote(photo.id, note);
    // Only the note is taken from the response. The server's uploaded_at
    // moves on any save, and it's what the image is versioned by, so
    // taking it would re-download a picture that hasn't changed.
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, note: saved.note } : p)));
  }

  function handleDelete(photo) {
    if (!window.confirm("این عکس حذف شود؟")) return;
    const isExtra = photo.pose === EXTRA_POSE;
    run(isExtra ? `extra-${photo.id}` : photo.pose, isExtra, async () => {
      await deleteBodyPhoto(photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    }, () => "حذف عکس با مشکل مواجه شد.");
  }

  const byPose = Object.fromEntries(photos.filter((p) => p.pose !== EXTRA_POSE).map((p) => [p.pose, p]));
  const extras = photos.filter((p) => p.pose === EXTRA_POSE);
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
        <>
          <div className="body-photo-grid">
            {BODY_POSES.map(([pose, label]) => (
              <PhotoSlot
                key={pose}
                label={label}
                photo={byPose[pose]}
                example={examplesByPose[pose]}
                isBusy={busyKey === pose}
                onPick={(file) => handlePickMain(pose, file)}
                onDelete={handleDelete}
              />
            ))}
          </div>

          <ExtraPhotos
            extras={extras}
            busyKey={busyKey}
            error={extraError}
            onAdd={handleAddExtra}
            onReplace={handleReplaceExtra}
            onDelete={handleDelete}
            onSaveNote={handleSaveNote}
          />
        </>
      )}
    </section>
  );
}
