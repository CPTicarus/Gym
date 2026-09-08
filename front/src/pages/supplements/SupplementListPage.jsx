import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createSupplementPlan, listSupplementPlans } from "../../api/supplements.js";
import Modal from "../../components/common/Modal.jsx";
import {
  SUPPLEMENT_GOALS,
  SUPPLEMENT_GOAL_LABELS,
} from "../../constants/supplementOptions.js";
import { toPersianDigits } from "../../utils/jalali.js";

export default function SupplementListPage() {
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
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (goal) params.goal = goal;
      const data = await listSupplementPlans(params);
      setPlans(data.results ?? data);
    } catch {
      setError("بارگذاری برنامه‌های مکمل با مشکل مواجه شد.");
    } finally {
      setIsLoading(false);
    }
  }, [search, goal]);

  useEffect(() => {
    const timeout = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(timeout);
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("نام برنامه الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      const created = await createSupplementPlan({
        name: newName.trim(),
        description: newDescription.trim(),
        goal: newGoal,
      });
      navigate(`/supplements/${created.id}`);
    } catch {
      setCreateError("ساخت برنامه با مشکل مواجه شد.");
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">مکمل‌ها</h1>
          <p className="page-subtitle">
            برنامه مصرف مکمل برای ورزشکارانی که به‌صورت حرفه‌ای تمرین می‌کنند — بیشتر اعضا به آن
            نیازی ندارند.
          </p>
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
          placeholder="جستجوی برنامه یا نام مکمل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={goal} onChange={(e) => setGoal(e.target.value)}>
          <option value="">همه هدف‌ها</option>
          {SUPPLEMENT_GOALS.map(([value, label]) => (
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
          <p>هنوز برنامه مکملی ساخته نشده.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setIsCreating(true)}>
            ساخت اولین برنامه
          </button>
        </div>
      ) : (
        <div className="plan-grid">
          {plans.map((p) => (
            <Link key={p.id} to={`/supplements/${p.id}`} className="plan-card">
              <div className="plan-card-head">
                <h3 className="plan-card-title">{p.name}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {p.goal && (
                  <span className="badge badge-neutral">
                    {SUPPLEMENT_GOAL_LABELS[p.goal] ?? p.goal}
                  </span>
                )}
                <span className="muted text-xs">
                  {toPersianDigits(p.item_count ?? 0)} قلم
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isCreating && (
        <Modal title="برنامه مکمل جدید" onClose={() => setIsCreating(false)}>
          <form onSubmit={handleCreate} noValidate>
            <label className="field">
              <span className="label">نام برنامه</span>
              <input
                className="input"
                dir="auto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثلاً آماده‌سازی مسابقه"
                required
              />
            </label>

            <label className="field">
              <span className="label">هدف</span>
              <select className="select" value={newGoal} onChange={(e) => setNewGoal(e.target.value)}>
                <option value="">—</option>
                {SUPPLEMENT_GOALS.map(([value, label]) => (
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
