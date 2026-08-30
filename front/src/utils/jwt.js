/**
 * Decode a JWT's payload without verifying its signature. This is only
 * used to read non-sensitive claims (role, full_name) client-side for
 * quick UI routing right after login — the backend still verifies the
 * signature on every actual API request, so this is not a trust boundary.
 */
export function decodeJwt(token) {
  try {
    const [, payload] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
