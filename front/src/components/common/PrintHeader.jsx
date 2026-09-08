import { BRAND_NAME } from "../../config/brand.js";
import { useAuth } from "../../hooks/useAuth.js";
import { formatDate, fullName } from "../../utils/format.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * A heading that exists only on paper.
 *
 * A printed sheet leaves the app entirely: it gets carried around a gym,
 * put down, picked up by someone else. Without a name and a date on it,
 * it's an anonymous list of exercises — so the print view says whose it
 * is and when it was printed, which the screen never needs to.
 */
export default function PrintHeader({ title }) {
  const { user } = useAuth();

  return (
    <div className="print-only print-header">
      <span className="print-brand">{BRAND_NAME}</span>
      <span className="print-owner">
        {fullName(user)} — {title}
      </span>
      <span className="print-date">{formatDate(todayIso())}</span>
    </div>
  );
}
