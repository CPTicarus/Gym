import { useEffect, useRef, useState } from "react";

import { getChatAttachment } from "../../api/chat.js";
import Modal from "../../components/common/Modal.jsx";

const PREVIEW_IMAGES = new Set([
  "image/avif", "image/bmp", "image/gif", "image/jpeg", "image/png", "image/webp", "image/x-icon",
]);
const PREVIEW_VIDEOS = new Set([
  "video/mp4", "video/mpeg", "video/ogg", "video/quicktime", "video/webm",
]);

export default function ChatAttachmentPreview({ attachment, onClose }) {
  const { id, name } = attachment;
  const detailsRef = useRef(null);
  const [media, setMedia] = useState(null);
  const [requestError, setRequestError] = useState(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    const opener = document.activeElement;
    detailsRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    getChatAttachment(id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setMedia({ url: objectUrl, type: blob.type });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setRequestError(error?.response?.status === 404
          ? "این پیوست دیگر در دسترس نیست."
          : "دریافت پیوست با مشکل مواجه شد.");
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const canPreviewImage = media && PREVIEW_IMAGES.has(media.type);
  const canPreviewVideo = media && PREVIEW_VIDEOS.has(media.type);

  return (
    <Modal title="پیوست پیام" onClose={onClose}>
      <div className="space-y-3" tabIndex={-1} ref={detailsRef}>
        <p className="break-all text-sm font-semibold" dir="auto">{name}</p>
        {requestError ? (
          <p className="error-text" role="alert">{requestError}</p>
        ) : media ? (
          <>
            {!previewFailed && canPreviewImage && (
              <img
                className="max-h-[55dvh] max-w-full object-contain"
                src={media.url}
                alt={name}
                onError={() => setPreviewFailed(true)}
              />
            )}
            {!previewFailed && canPreviewVideo && (
              <video
                className="max-h-[55dvh] w-full"
                src={media.url}
                controls
                playsInline
                aria-label={name}
                onError={() => setPreviewFailed(true)}
              />
            )}
            {(previewFailed || (!canPreviewImage && !canPreviewVideo)) && (
              <p className="muted text-sm">برای مشاهده، فایل را دریافت کنید.</p>
            )}
            <a className="btn btn-primary btn-sm" href={media.url} download={name}>دریافت فایل</a>
          </>
        ) : (
          <p className="muted text-sm" role="status">در حال دریافت فایل…</p>
        )}
      </div>
    </Modal>
  );
}
