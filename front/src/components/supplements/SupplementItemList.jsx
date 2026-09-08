import { TrashIcon } from "../common/icons.jsx";

/**
 * The contents of a protocol — one row per product, with its dose and
 * when to take it.
 *
 * Read-only when `onDelete` is absent, which is how the member-facing
 * page reuses it.
 */
export default function SupplementItemList({ items, onDelete, deletingId }) {
  if (!items?.length) {
    return <p className="muted exercise-empty">هنوز مکملی به این برنامه اضافه نشده.</p>;
  }

  return (
    <ul className="exercise-list">
      {items.map((item) => (
        <li key={item.id} className="exercise-row">
          <div className="exercise-row-main">
            <span className="exercise-name">
              {item.name}
              {item.dosage && <span className="ltr mr-2 font-normal">{item.dosage}</span>}
            </span>
            {(item.timing || item.frequency) && (
              <span className="muted exercise-detail">
                {[item.timing, item.frequency].filter(Boolean).join(" • ")}
              </span>
            )}
            {item.notes && <span className="muted exercise-notes">{item.notes}</span>}
          </div>
          {onDelete && (
            <button
              type="button"
              className="icon-btn icon-btn-sm flex-none border-danger/40 text-danger hover:bg-danger-soft"
              onClick={() => onDelete(item)}
              disabled={deletingId === item.id}
              aria-label={`حذف ${item.name}`}
            >
              <TrashIcon size={16} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
