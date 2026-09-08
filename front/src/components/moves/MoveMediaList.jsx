import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "../common/icons.jsx";
import { MEDIA_TYPE_LABELS } from "../../constants/moveOptions.js";
import { toPersianDigits } from "../../utils/jalali.js";

const ROW_BTN = "icon-btn icon-btn-sm flex-none disabled:cursor-not-allowed disabled:opacity-40";
const DELETE_BTN = `${ROW_BTN} icon-btn-danger`;

function Thumbnail({ item }) {
  const frame = "h-12 w-12 flex-none rounded-md border border-line object-cover";

  if (item.file) {
    // Everything that isn't a video is an <img> — a GIF included, which is
    // how it gets to animate in the thumbnail.
    if (item.media_type === "video") {
      // preload="metadata" is enough for the browser to paint a first frame
      // as the thumbnail without pulling the whole clip down.
      return <video src={item.file} className={`${frame} bg-neutral-soft`} muted preload="metadata" />;
    }
    return <img src={item.file} alt="" className={frame} loading="lazy" />;
  }
  // Externally hosted (e.g. an unlisted YouTube link) — nothing to preview
  // without embedding the provider's player, which the list doesn't need.
  return (
    <span
      className={`${frame} flex items-center justify-center bg-neutral-soft text-[11px] font-semibold text-muted`}
    >
      لینک
    </span>
  );
}

/**
 * The media attached to a move, in the order members will see it, with
 * arrows to move an item up or down and a button to remove one. Position
 * is what the numbers show —
 * they're the list index, not the stored `order` value, so they stay
 * 1..n even if the stored numbers ever have gaps.
 */
export default function MoveMediaList({ items, onMove, onDelete, isReordering, deletingId }) {
  return (
    <ul className="media-list">
      {items.map((item, index) => (
        <li key={item.id} className="media-list-item">
          <span className="flex h-6 w-6 flex-none items-center justify-center bg-ink text-xs font-bold text-canvas">
            {toPersianDigits(index + 1)}
          </span>

          <Thumbnail item={item} />

          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="badge badge-neutral">
              {MEDIA_TYPE_LABELS[item.media_type] ?? item.media_type}
            </span>
            <span className={`w-full truncate ${item.external_url ? "ltr" : ""}`}>
              {item.caption || item.external_url || "فایل بارگذاری‌شده"}
            </span>
          </div>

          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              className={ROW_BTN}
              onClick={() => onMove(index, -1)}
              disabled={isReordering || index === 0}
              aria-label={`انتقال به بالا — مورد ${toPersianDigits(index + 1)}`}
            >
              <ChevronUpIcon size={16} />
            </button>
            <button
              type="button"
              className={ROW_BTN}
              onClick={() => onMove(index, 1)}
              disabled={isReordering || index === items.length - 1}
              aria-label={`انتقال به پایین — مورد ${toPersianDigits(index + 1)}`}
            >
              <ChevronDownIcon size={16} />
            </button>
            {/* Set apart from the arrows so a mistimed tap on a small
                screen nudges the order rather than deleting something. */}
            <button
              type="button"
              className={`${DELETE_BTN} ms-1`}
              onClick={() => onDelete(item)}
              disabled={isReordering || deletingId === item.id}
              aria-label={`حذف مورد ${toPersianDigits(index + 1)}`}
            >
              <TrashIcon size={16} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
