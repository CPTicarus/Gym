import { useBodyPhotoUrl } from "../../hooks/useBodyPhotoUrl.js";

/**
 * One body photo as a thumbnail — a member's own, or the gym's example for
 * a pose. The loading and the object-URL lifetime live in useBodyPhotoUrl,
 * which the fullscreen viewer shares. Pass the photo's upload time as
 * `version` so a replaced photo is fetched again (see that hook).
 */
export default function BodyPhotoImage({ photoId, alt, kind = "member", version, className = "" }) {
  const { url, hasFailed } = useBodyPhotoUrl(photoId, kind, version);

  if (hasFailed) {
    return <div className={`body-photo-frame is-empty ${className}`}>بارگذاری نشد</div>;
  }
  if (!url) {
    return <div className={`body-photo-frame is-empty ${className}`}>…</div>;
  }
  return <img className={`body-photo-frame ${className}`} src={url} alt={alt} />;
}
