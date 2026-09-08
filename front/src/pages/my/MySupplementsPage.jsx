import { useEffect, useState } from "react";

import { listMySupplementPlans } from "../../api/supplements.js";
import PlanHistoryList from "../../components/plans/PlanHistoryList.jsx";
import SupplementItemList from "../../components/supplements/SupplementItemList.jsx";
import { SUPPLEMENT_GOAL_LABELS } from "../../constants/supplementOptions.js";

export default function MySupplementsPage() {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listMySupplementPlans();
        if (!cancelled) setAssignments(data.results ?? data);
      } catch {
        if (!cancelled) setError("بارگذاری برنامه مکمل با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = assignments.filter((a) => a.status === "active");
  const history = assignments.filter((a) => a.status !== "active");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">مکمل‌های من</h1>
          <p className="page-subtitle">برنامه مصرف مکملی که مربی برای شما تنظیم کرده است.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : active.length === 0 ? (
        /* Having no protocol is the ordinary case, not something missing —
           the wording says so rather than reading like an empty shelf. */
        <div className="empty-state">
          <p>در حال حاضر برنامه مکملی برای شما تنظیم نشده است.</p>
          <p className="text-xs">
            این بخش برای ورزشکارانی است که به‌صورت حرفه‌ای تمرین می‌کنند. اگر به آن نیاز دارید با
            مربی‌تان صحبت کنید.
          </p>
        </div>
      ) : (
        active.map((assignment) => {
          const plan = assignment.plan_detail;
          return (
            <section key={assignment.id} className="card plan-section">
              <div className="plan-card-head">
                <h2 className="plan-section-title">{plan.name}</h2>
                {plan.goal && (
                  <span className="badge badge-neutral">
                    {SUPPLEMENT_GOAL_LABELS[plan.goal] ?? plan.goal}
                  </span>
                )}
              </div>
              {plan.description && <p className="muted plan-description">{plan.description}</p>}
              <SupplementItemList items={plan.items} />
            </section>
          );
        })
      )}

      {history.length > 0 && (
        <PlanHistoryList assignments={history} goalLabels={SUPPLEMENT_GOAL_LABELS} />
      )}
    </div>
  );
}
