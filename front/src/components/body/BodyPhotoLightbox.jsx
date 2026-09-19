import { useEffect, useRef } from "react";

import { XIcon } from "../common/icons.jsx";
import { useBodyPhotoUrl } from "../../hooks/useBodyPhotoUrl.js";

/**
 * One body photo, filling the screen.
 *
 * Not built on the shared Modal: that caps at 480px wide and 85vh tall and
 * carries a title bar, which is right for a form and wrong for the only
 * thing this exists to do — show a photo as large as the device allows. A
 * trainer squinting at a 100px-wide thumbnail on a phone is the whole
 * reason it's here.
 *
 * Closes on Escape, on the backdrop, and on the button. Focus moves to the
 * close button on open and returns to whatever opened it on close, so a
 * keyboard user isn't dropped back at the top of the page.
 */
export default function BodyPhotoLightbox({ photoId, kind = "member", label, onClose }) {
  const { url, hasFailed } = useBodyPhotoUrl(photoId, kind);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    closeRef.current?.focus();

    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);

    // The page behind must not scroll under the photo — on a phone that
    // reads as the image sliding around rather than the page moving.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      // Back to the control that opened this, not to the top of the page.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="body-photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <button
        ref={closeRef}
        type="button"
        className="icon-btn icon-btn-inverse body-photo-lightbox-close"
        onClick={onClose}
        aria-label="بستن"
      >
        <XIcon size={20} />
      </button>

      {label && <span className="body-photo-lightbox-label">{label}</span>}

      {hasFailed ? (
        <p className="body-photo-lightbox-message">بارگذاری نشد</p>
      ) : !url ? (
        <p className="body-photo-lightbox-message">در حال بارگذاری…</p>
      ) : (
        <img
          className="body-photo-lightbox-image"
          src={url}
          alt={label}
          // Tapping the photo itself shouldn't dismiss it — only the space
          // around it. Closing the thing you just tried to look at closely
          // is the opposite of what the tap meant.
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
