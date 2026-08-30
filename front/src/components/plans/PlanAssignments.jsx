import { Link } from "react-router-dom";

import { ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_VARIANT } from "../../constants/planOptions.js";
import { formatDate } from "../../utils/format.js";
import { TrashIcon } from "../common/icons.jsx";

/**
 * "Who currently has this plan" — the counterpart to the assign button.
 * Parent supplies the fetched assignments plus the status/remove handlers
 * so this works for both workout and diet plans.
 */
export default function PlanAssignments({ assignments, onStatusChange, onRemove, canEdit = true }) {
  if (!assignments) return <p className="muted exercise-empty">در حال بارگذاری…</p>;

  if (assignments.length === 0) {
    return <p className="muted exercise-empty">این برنامه هنوز به کسی اختصاص داده نشده.</p>;
  }

  return (
    <ul className="assignment-list">
      {assignments.map((a) => (
        <li key={a.id} className="assignment-row">
          <div className="assignment-row-main">
            <Link to={`/users/${a.user}`} className="assignment-name">
              {a.user_full_name}
            </Link>
            <span className="muted assignment-meta">{formatDate(a.assigned_at)}</span>
          </div>
          <div className="assignment-row-end">
            {canEdit ? (
              <select
                className="select select-sm"
                value={a.status}
                onChange={(e) => onStatusChange(a, e.target.value)}
                aria-label="وضعیت"
              >
                {ASSIGNMENT_STATUSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`badge badge-${ASSIGNMENT_STATUS_VARIANT[a.status] ?? "neutral"}`}>
                {a.status}
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => onRemove(a)}
                aria-label={`حذف اختصاص ${a.user_full_name}`}
              >
                <TrashIcon size={16} />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
