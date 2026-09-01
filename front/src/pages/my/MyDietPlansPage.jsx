import { useEffect, useState } from "react";

import { listMyDietPlans } from "../../api/diet.js";
import PlanHistoryList from "../../components/plans/PlanHistoryList.jsx";
import { DIET_GOAL_LABELS } from "../../constants/planOptions.js";
import { formatItemMacros } from "../../utils/planFormat.js";

export default function MyDietPlansPage() {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listMyDietPlans();
        if (!cancelled) setAssignments(data.results ?? data);
      } catch {
        if (!cancelled) setError("بارگذاری برنامه‌های غذایی با مشکل مواجه شد.");
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
          <h1 className="page-title">برنامه غذایی من</h1>
          <p className="page-subtitle">برنامه‌های غذایی که مربی برای شما تنظیم کرده است.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : assignments.length === 0 ? (
        <div className="empty-state">
          <p>هنوز برنامه غذایی‌ای برای شما ثبت نشده.</p>
        </div>
      ) : (
        <>
          {active.length === 0 && (
            <div className="empty-state">
              <p>در حال حاضر برنامه غذایی فعالی ندارید.</p>
            </div>
          )}
          {active.map((a) => {
            const plan = a.plan_detail;
            if (!plan) return null;
            return (
              <div key={a.id} className="card plan-section">
                <div className="plan-card-head">
                  <h2 className="plan-section-title">{plan.name}</h2>
                </div>
                {plan.goal && (
                  <p className="muted plan-section-hint">{DIET_GOAL_LABELS[plan.goal] ?? plan.goal}</p>
                )}
                {plan.description && <p className="plan-description">{plan.description}</p>}

                {plan.meals?.length ? (
                  plan.meals.map((meal) => (
                    <div key={meal.id} className="day-block">
                      <h3 className="day-block-title">
                        {meal.name}
                        {meal.time && <span className="muted meal-time ltr"> {meal.time.slice(0, 5)}</span>}
                      </h3>
                      {meal.items?.length ? (
                        <ul className="exercise-list">
                          {meal.items.map((item) => (
                            <li key={item.id} className="exercise-row">
                              <div className="exercise-row-main">
                                <span className="exercise-name">
                                  {item.food_name}
                                  {item.quantity && <span className="muted"> — {item.quantity}</span>}
                                </span>
                                <span className="muted exercise-detail">{formatItemMacros(item)}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted exercise-empty">خوراکی‌ای ثبت نشده.</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted exercise-empty">وعده‌ای ثبت نشده.</p>
                )}
              </div>
            );
          })}

          <PlanHistoryList assignments={history} goalLabels={DIET_GOAL_LABELS} />
        </>
      )}
    </div>
  );
}
