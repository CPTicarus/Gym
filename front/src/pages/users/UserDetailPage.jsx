import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { deleteDietAssignment, listDietAssignments, updateDietAssignment } from "../../api/diet.js";
import { getUser, updateUser } from "../../api/users.js";
import {
  deleteWorkoutAssignment,
  listWorkoutAssignments,
  updateWorkoutAssignment,
} from "../../api/workouts.js";
import { TrashIcon } from "../../components/common/icons.jsx";
import JalaliDateInput from "../../components/common/JalaliDateInput.jsx";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_STATUS_VARIANT,
} from "../../constants/planOptions.js";
import { ROLE_LABELS } from "../../constants/roles.js";
import { useAuth } from "../../hooks/useAuth.js";
import { getBmiCategory } from "../../utils/bmi.js";
import { formatDate } from "../../utils/format.js";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

/** One assigned plan row — status dropdown + unassign, shared by both plan types. */
function AssignmentRow({ assignment, planHref, onStatusChange, onRemove, canEdit }) {
  return (
    <li className="assignment-row">
      <div className="assignment-row-main">
        <Link to={planHref} className="assignment-name">
          {assignment.plan_name}
        </Link>
        <span className="muted assignment-meta">
          {formatDate(assignment.assigned_at)}
          {assignment.assigned_by ? ` • ${assignment.assigned_by}` : ""}
        </span>
      </div>
      <div className="assignment-row-end">
        {canEdit ? (
          <select
            className="select select-sm"
            value={assignment.status}
            onChange={(e) => onStatusChange(assignment, e.target.value)}
            aria-label="وضعیت"
          >
            {ASSIGNMENT_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span className={`badge badge-${ASSIGNMENT_STATUS_VARIANT[assignment.status] ?? "neutral"}`}>
            {assignment.status}
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            onClick={() => onRemove(assignment)}
            aria-label={`حذف اختصاص ${assignment.plan_name}`}
          >
            <TrashIcon size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

export default function UserDetailPage() {
  const { userId } = useParams();
  const { role } = useAuth();

  const isAdmin = role === "admin";
  const canEditMembership = isAdmin || role === "accounting";
  const canEditAssignments = isAdmin || role === "trainer";

  const [user, setUser] = useState(null);
  const [workoutAssignments, setWorkoutAssignments] = useState([]);
  const [dietAssignments, setDietAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadAssignments = useCallback(async () => {
    const [w, d] = await Promise.all([
      listWorkoutAssignments({ user: userId }),
      listDietAssignments({ user: userId }),
    ]);
    setWorkoutAssignments(w.results ?? w);
    setDietAssignments(d.results ?? d);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setIsLoading(true);
      setError(null);
      try {
        const userData = await getUser(userId);
        if (cancelled) return;
        setUser(userData);
        setStartDate(userData.membership_start_date ?? "");
        setEndDate(userData.membership_end_date ?? "");
        await loadAssignments();
      } catch {
        if (!cancelled) setError("بارگذاری اطلاعات کاربر با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [userId, loadAssignments]);

  async function handleSaveMembership(e) {
    e.preventDefault();
    setSaveError(null);
    setToast(null);
    setIsSaving(true);
    try {
      const updated = await updateUser(userId, {
        membership_start_date: startDate || null,
        membership_end_date: endDate || null,
      });
      setUser((prev) => ({ ...prev, ...updated }));
      setToast("وضعیت عضویت بروزرسانی شد.");
    } catch (err) {
      setSaveError(
        err?.response?.data ? formatApiError(err.response.data) : "ذخیره تغییرات با مشکل مواجه شد."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (error && !user) return <p className="error-text">{error}</p>;
  if (!user) return null;

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/dashboard" className="muted back-link">
            ← بازگشت به داشبورد
          </Link>
          <h1 className="page-title">{fullName}</h1>
          <p className="page-subtitle ltr">{user.username}</p>
        </div>
        <span className="badge badge-role">{ROLE_LABELS[user.role] ?? user.role}</span>
      </div>

      {error && <p className="error-text">{error}</p>}
      {toast && <p className="success-text">{toast}</p>}

      {/* Profile summary — read-only here; people edit their own via Settings */}
      <section className="card plan-section">
        <h2 className="plan-section-title">اطلاعات کاربر</h2>
        <dl className="detail-grid">
          <div className="detail-item">
            <dt className="label">ایمیل</dt>
            <dd className="detail-value ltr">{user.email || "—"}</dd>
          </div>
          <div className="detail-item">
            <dt className="label">شماره تماس</dt>
            <dd className="detail-value ltr">{user.phone_number || "—"}</dd>
          </div>
          <div className="detail-item">
            <dt className="label">تاریخ تولد</dt>
            <dd className="detail-value ltr">{formatDate(user.date_of_birth)}</dd>
          </div>
          <div className="detail-item">
            <dt className="label">تاریخ عضویت</dt>
            <dd className="detail-value ltr">{formatDate(user.created_at)}</dd>
          </div>
          <div className="detail-item">
            <dt className="label">قد</dt>
            <dd className="detail-value ltr">{user.height_cm ? `${user.height_cm} cm` : "—"}</dd>
          </div>
          <div className="detail-item">
            <dt className="label">آخرین وزن ثبت‌شده</dt>
            <dd className="detail-value ltr">{user.latest_weight_kg ? `${user.latest_weight_kg} kg` : "—"}</dd>
          </div>
          {user.bmi != null && (
            <div className="detail-item">
              <dt className="label">BMI</dt>
              <dd className="detail-value">
                {user.bmi}
                {getBmiCategory(user.bmi) && (
                  <span className={`badge badge-${getBmiCategory(user.bmi).variant} mr-2`}>
                    {getBmiCategory(user.bmi).label}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Membership window — the piece that previously only existed in Django admin */}
      {user.role === "member" && (
        <section className="card plan-section">
          <div className="plan-card-head">
            <h2 className="plan-section-title">وضعیت عضویت</h2>
            <span className={`badge ${user.is_membership_active ? "badge-success" : "badge-danger"}`}>
              {user.is_membership_active ? "فعال" : "غیرفعال"}
            </span>
          </div>

          {canEditMembership ? (
            <form onSubmit={handleSaveMembership}>
              <div className="field-row">
                <label className="field">
                  <span className="label">تاریخ شروع</span>
                  <JalaliDateInput value={startDate} onChange={setStartDate} />
                </label>
                <label className="field">
                  <span className="label">معتبر تا</span>
                  <JalaliDateInput value={endDate} onChange={setEndDate} />
                </label>
              </div>

              {saveError && (
                <p className="error-text" role="alert">
                  {saveError}
                </p>
              )}

              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "در حال ذخیره…" : "ذخیره"}
                </button>
              </div>
            </form>
          ) : (
            <dl className="detail-grid">
              <div className="detail-item">
                <dt className="label">تاریخ شروع</dt>
                <dd className="detail-value ltr">{formatDate(user.membership_start_date)}</dd>
              </div>
              <div className="detail-item">
                <dt className="label">معتبر تا</dt>
                <dd className="detail-value ltr">{formatDate(user.membership_end_date)}</dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {/* Assigned plans — answers "what is this person actually doing?" */}
      <section className="card plan-section">
        <h2 className="plan-section-title">برنامه‌های تمرینی</h2>
        {workoutAssignments.length === 0 ? (
          <p className="muted exercise-empty">برنامه تمرینی‌ای اختصاص داده نشده.</p>
        ) : (
          <ul className="assignment-list">
            {workoutAssignments.map((a) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                planHref={`/plans/${a.plan}`}
                canEdit={canEditAssignments}
                onStatusChange={async (assignment, status) => {
                  await updateWorkoutAssignment(assignment.id, { status });
                  await loadAssignments();
                }}
                onRemove={async (assignment) => {
                  await deleteWorkoutAssignment(assignment.id);
                  await loadAssignments();
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card plan-section">
        <h2 className="plan-section-title">برنامه‌های غذایی</h2>
        {dietAssignments.length === 0 ? (
          <p className="muted exercise-empty">برنامه غذایی‌ای اختصاص داده نشده.</p>
        ) : (
          <ul className="assignment-list">
            {dietAssignments.map((a) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                planHref={`/diet/${a.plan}`}
                canEdit={canEditAssignments}
                onStatusChange={async (assignment, status) => {
                  await updateDietAssignment(assignment.id, { status });
                  await loadAssignments();
                }}
                onRemove={async (assignment) => {
                  await deleteDietAssignment(assignment.id);
                  await loadAssignments();
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
