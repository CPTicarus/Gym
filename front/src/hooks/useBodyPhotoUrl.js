import { useEffect, useState } from "react";

import { getBodyPhotoBlob, getBodyPhotoExampleBlob } from "../api/body.js";

// Both kinds live in the private tree behind their own endpoint. Keyed by a
// plain string rather than taking a fetch function as an argument, so the
// effect below can depend on it without every caller render re-fetching.
const LOADERS = {
  member: getBodyPhotoBlob,
  example: getBodyPhotoExampleBlob,
};

/**
 * Loads one body photo and hands back an object URL for it.
 *
 * A plain `<img src="/api/body-photos/3/file/">` would not work, and that's
 * by design rather than an obstacle: these images come from a view that
 * checks who is asking, the token travels in an Authorization header (see
 * api/axiosClient.js), and the browser does not attach headers to an <img>
 * request. So the bytes are fetched like any other API call and wrapped in
 * an object URL.
 *
 * Shared by the thumbnail and the fullscreen viewer, which need the same
 * bytes in two very different frames. Each caller gets its own URL — the
 * fullscreen view re-requests, which is a cheap hit against the browser
 * cache for examples and one extra fetch for a member's own photo.
 *
 * The URL is revoked on unmount. Without that, opening a few photos would
 * pin each one in memory for the life of the tab — worth avoiding for
 * these images on its own, never mind the leak.
 */
export function useBodyPhotoUrl(photoId, kind = "member") {
  const [url, setUrl] = useState(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    setUrl(null);
    setHasFailed(false);

    LOADERS[kind](photoId)
      .then((blob) => {
        // Guard before creating the URL, not just before setting state — an
        // object URL created after unmount has nothing left to revoke it.
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setHasFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, kind]);

  return { url, hasFailed };
}
