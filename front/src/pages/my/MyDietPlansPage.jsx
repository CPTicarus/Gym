import { useEffect, useState } from "react";

import { listMyDietPlans } from "../../api/diet.js";
import MealSection from "../../components/diet/MealSection.jsx";
import PlanHistoryList from "../../components/plans/PlanHistoryList.jsx";
import { DIET_GOAL_LABELS } from "../../constants/planOptions.js";
import { getTodayWeekday, WEEKDAY_LABELS } from "../../constants/weekdays.js";

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

                {plan.days?.length ? (
                  plan.days.map((day) => (
                    <div key={day.id} className="day-block">
                      <h3 className="day-block-title">
                        {WEEKDAY_LABELS[day.day_of_week]}
                        {day.day_of_week === getTodayWeekday() && (
                          <span className="badge badge-accent mr-2">امروز</span>
                        )}
                      </h3>
                      {day.meals.length === 0 ? (
                        <p className="muted exercise-empty">وعده‌ای ثبت نشده.</p>
                      ) : (
                        day.meals.map((meal) => <MealSection key={meal.id} meal={meal} readOnly />)
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
