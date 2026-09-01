import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createWorkoutPlan, listWorkoutPlans } from "../../api/workouts.js";
import Modal from "../../components/common/Modal.jsx";
import { WORKOUT_GOALS, WORKOUT_GOAL_LABELS } from "../../constants/planOptions.js";

export default function PlanListPage() {
  const navigate = useNavigate();

  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState("");
  const [goal, setGoal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isTemplate, setIsTemplate] = useState(false);
  const [newMinBmi, setNewMinBmi] = useState("");
  const [newMaxBmi, setNewMaxBmi] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (goal) params.goal = goal;
      const data = await listWorkoutPlans(params);
      setPlans(data.results ?? data);
    } catch {
      setError("بارگذاری برنامه‌ها با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
    } finally {
      setIsLoading(false);
    }
  }, [search, goal]);

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("نام برنامه الزامی است.");
      return;
    }
    if (newMinBmi !== "" && newMaxBmi !== "" && Number(newMinBmi) > Number(newMaxBmi)) {
      setCreateError("حداقل BMI نمی‌تواند بیشتر از حداکثر باشد.");
      return;
    }
    setIsSaving(true);
    try {
      const created = await createWorkoutPlan({
        name: newName.trim(),
        description: newDescription.trim(),
        goal: newGoal,
        is_template: isTemplate,
        min_bmi: newMinBmi === "" ? null : Number(newMinBmi),
        max_bmi: newMaxBmi === "" ? null : Number(newMaxBmi),
      });
      navigate(`/plans/${created.id}`); // straight into the builder
    } catch {
      setCreateError("ساخت برنامه با مشکل مواجه شد.");
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">برنامه‌های تمرینی</h1>
          <p className="page-subtitle">ساخت برنامه و اختصاص آن به اعضا.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsCreating(true)}>
          + برنامه جدید
        </button>
      </div>

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder="جستجوی برنامه…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="">همه هدف‌ها</option>
          {WORKOUT_GOALS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : plans.length === 0 ? (
        <div className="empty-state">
          <p>هنوز برنامه‌ای ساخته نشده.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setIsCreating(true)}>
            ساخت اولین برنامه
          </button>
        </div>
      ) : (
        <div className="plan-grid">
          {plans.map((p) => (
            <Link key={p.id} to={`/plans/${p.id}`} className="plan-card">
              <div className="plan-card-head">
                <h3 className="plan-card-title">{p.name}</h3>
                {p.is_template && <span className="badge badge-accent">الگو</span>}
              </div>
              {p.goal && <span className="badge badge-neutral">{WORKOUT_GOAL_LABELS[p.goal] ?? p.goal}</span>}
              {(p.min_bmi != null || p.max_bmi != null) && (
                <span className="badge badge-neutral">
                  BMI: {p.min_bmi ?? "—"}–{p.max_bmi ?? "—"}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {isCreating && (
        <Modal title="برنامه تمرینی جدید" onClose={() => setIsCreating(false)}>
          <form onSubmit={handleCreate} noValidate>
            <label className="field">
              <span className="label">نام برنامه</span>
              <input
                className="input"
                dir="auto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثلاً برنامه ۳ روزه مبتدی"
                required
              />
            </label>

            <label className="field">
              <span className="label">هدف</span>
              <select className="select" value={newGoal} onChange={(e) => setNewGoal(e.target.value)}>
                <option value="">—</option>
                {WORKOUT_GOALS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">توضیحات (اختیاری)</span>
              <textarea
                className="textarea"
                dir="auto"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </label>

            <div className="field">
              <span className="label">نوع برنامه</span>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="plan-scope"
                  checked={!isTemplate}
                  onChange={() => setIsTemplate(false)}
                />
                <span>یک‌باره — برای یک عضو خاص</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="plan-scope"
                  checked={isTemplate}
                  onChange={() => setIsTemplate(true)}
                />
                <span>الگو — قابل استفاده و اختصاص به چند عضو</span>
              </label>
            </div>

            <div className="field">
              <span className="label">محدوده ایمن BMI (اختیاری)</span>
              <p className="muted plan-section-hint">
                هنگام اختصاص این برنامه، اگر BMI عضو خارج از این محدوده باشد هشدار داده می‌شود.
              </p>
              <div className="field-row">
                <label className="field">
                  <span className="label">حداقل</span>
                  <input
                    className="input"
                    dir="ltr"
                    type="number"
                    step="0.1"
                    min="0"
                    value={newMinBmi}
                    onChange={(e) => setNewMinBmi(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="label">حداکثر</span>
                  <input
                    className="input"
                    dir="ltr"
                    type="number"
                    step="0.1"
                    min="0"
                    value={newMaxBmi}
                    onChange={(e) => setNewMaxBmi(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {createError && (
              <p className="error-text" role="alert">
                {createError}
              </p>
            )}

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={isSaving}>
                {isSaving ? "در حال ساخت…" : "ساخت و ادامه"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
