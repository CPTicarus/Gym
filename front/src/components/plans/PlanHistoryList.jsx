import { useState } from "react";

import { ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_STATUS_VARIANT } from "../../constants/planOptions.js";
import { formatDate } from "../../utils/format.js";

/**
 * A member's own paused/completed plan assignments — collapsed by default
 * so the landing view stays focused on whichever plan is currently active.
 * Read-only: members don't get to change assignment status, only staff do.
 */
export default function PlanHistoryList({ assignments, goalLabels }) {
  const [isOpen, setIsOpen] = useState(false);

  if (assignments.length === 0) return null;

  return (
    <section className="card plan-section">
      <button
        type="button"
        className="plan-history-toggle"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <span>تاریخچه برنامه‌ها ({assignments.length})</span>
        <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
      </button>

      {isOpen && (
        <ul className="assignment-list">
          {assignments.map((a) => {
            const plan = a.plan_detail;
            if (!plan) return null;
            return (
              <li key={a.id} className="assignment-row">
                <div className="assignment-row-main">
                  <span className="assignment-name">{plan.name}</span>
                  <span className="muted assignment-meta">
                    {plan.goal ? goalLabels[plan.goal] ?? plan.goal : "بدون هدف مشخص"} • {formatDate(a.assigned_at)}
                  </span>
                </div>
                <span className={`badge badge-${ASSIGNMENT_STATUS_VARIANT[a.status] ?? "neutral"}`}>
                  {ASSIGNMENT_STATUS_LABELS[a.status] ?? a.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
