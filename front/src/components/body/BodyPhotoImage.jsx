import { useBodyPhotoUrl } from "../../hooks/useBodyPhotoUrl.js";

/**
 * One body photo as a thumbnail — a member's own, or the gym's example for
 * a pose. The loading and the object-URL lifetime live in useBodyPhotoUrl,
 * which the fullscreen viewer shares.
 */
export default function BodyPhotoImage({ photoId, alt, kind = "member", className = "" }) {
  const { url, hasFailed } = useBodyPhotoUrl(photoId, kind);

  if (hasFailed) {
    return <div className={`body-photo-frame is-empty ${className}`}>بارگذاری نشد</div>;
  }
  if (!url) {
    return <div className={`body-photo-frame is-empty ${className}`}>…</div>;
  }
  return <img className={`body-photo-frame ${className}`} src={url} alt={alt} />;
}
