import { useEffect, useState } from "react";

import { listMemberBodyPhotos } from "../../api/body.js";
import { BODY_POSES } from "../../constants/bodyPoses.js";
import { ExpandIcon } from "../common/icons.jsx";
import BodyPhotoImage from "./BodyPhotoImage.jsx";
import BodyPhotoLightbox from "./BodyPhotoLightbox.jsx";

/**
 * One photo in the trainer's read-only grid, openable full screen.
 *
 * Two ways in, on purpose. Double-click/double-tap is the gesture — same
 * one MoveCard uses for edit, and `touch-manipulation` in the stylesheet
 * frees it from the browser's double-tap-to-zoom so it actually arrives.
 * But a double-tap is a mouse idiom that touch screens honour unevenly
 * (see the note in MoveCard.jsx), and it is invisible: nothing about a
 * thumbnail says "do it twice". So there is also a plain expand button,
 * which is what most people will use and what a keyboard can reach.
 *
 * A single click does nothing here — the photo has no other action to be
 * confused with, so there's no timer to disambiguate, unlike MoveCard.
 */
function PhotoSlot({ pose, label, photo, onOpen }) {
  return (
    <div className="body-photo-slot">
      <span className="body-photo-label">{label}</span>

      <div
        className="body-photo-zoomable"
        onDoubleClick={() => onOpen(photo, label)}
        title={`${label} — برای نمایش بزرگ دوبار ضربه بزنید`}
      >
        <BodyPhotoImage photoId={photo.id} alt={label} />
        <button
          type="button"
          className="icon-btn icon-btn-sm body-photo-zoom-btn"
          onClick={() => onOpen(photo, label)}
          aria-label={`نمایش بزرگ ${label}`}
        >
          <ExpandIcon size={15} />
        </button>
      </div>
    </div>
  );
}

/**
 * A member's photos on their profile, for a trainer or admin.
 *
 * Read-only, deliberately: the member uploads and removes these, the same
 * way they own their own measurements and health flags. Staff look.
 *
 * Renders nothing when the member hasn't uploaded any — an empty
 * three-slot panel on every profile would be noise, and the request 403s
 * for accounting, who shouldn't see this section exists at all.
 */
export default function MemberBodyPhotos({ userId }) {
  const [photos, setPhotos] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listMemberBodyPhotos(userId)
      .then((data) => {
        if (!cancelled) setPhotos(data);
      })
      // Silent: a 403 here is the normal answer for a role that may not
      // look, not an error worth putting on their screen.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (photos.length === 0) return null;

  const byPose = Object.fromEntries(photos.map((p) => [p.pose, p]));

  return (
    <section className="card plan-section">
      <h2 className="plan-section-title">عکس‌های بدن</h2>
      <p className="muted plan-section-hint">
        این عکس‌ها را خود عضو ثبت کرده است — برای بررسی فرم بدن و نوشتن برنامه. برای دیدن هر عکس در
        اندازه کامل، روی آن دوبار ضربه بزنید یا دکمه بزرگ‌نمایی را بزنید.
      </p>

      <div className="body-photo-grid">
        {BODY_POSES.filter(([pose]) => byPose[pose]).map(([pose, label]) => (
          <PhotoSlot
            key={pose}
            pose={pose}
            label={label}
            photo={byPose[pose]}
            onOpen={(photo, poseLabel) => setViewing({ photo, label: poseLabel })}
          />
        ))}
      </div>

      {viewing && (
        <BodyPhotoLightbox
          photoId={viewing.photo.id}
          label={viewing.label}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
