import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  addSupplementItem,
  assignSupplementPlan,
  deleteSupplementAssignment,
  deleteSupplementItem,
  updateSupplementItem,
  deleteSupplementPlan,
  getSupplementPlan,
  listSupplementAssignments,
  updateSupplementAssignment,
  updateSupplementPlan,
} from "../../api/supplements.js";
import { PencilIcon } from "../../components/common/icons.jsx";
import AssignMemberModal from "../../components/plans/AssignMemberModal.jsx";
import EditPlanInfoModal from "../../components/plans/EditPlanInfoModal.jsx";
import PlanAssignments from "../../components/plans/PlanAssignments.jsx";
import SupplementItemList from "../../components/supplements/SupplementItemList.jsx";
import { SUPPLEMENT_GOALS, SUPPLEMENT_GOAL_LABELS } from "../../constants/supplementOptions.js";

export default function SupplementBuilderPage() {
  const { planId } = useParams();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const [itemError, setItemError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAssignments = useCallback(async () => {
    const data = await listSupplementAssignments({ plan: planId });
    setAssignments(data.results ?? data);
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const data = await getSupplementPlan(planId);
        if (cancelled) return;
        setPlan(data);
        await loadAssignments();
      } catch {
        if (!cancelled) setError("بارگذاری برنامه با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [planId, loadAssignments]);

  async function handleAddItem(payload) {
    setItemError(null);
    const created = await addSupplementItem(planId, payload);
    setPlan((prev) => ({ ...prev, items: [...prev.items, created] }));
  }

  async function handleUpdateItem(item, payload) {
    setItemError(null);
    const updated = await updateSupplementItem(planId, item.id, payload);
    setPlan((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === item.id ? updated : i)),
    }));
  }

  async function handleDeleteItem(item) {
    if (!window.confirm(`«${item.name}» از این برنامه حذف شود؟`)) return;
    setDeletingId(item.id);
    try {
      await deleteSupplementItem(planId, item.id);
      setPlan((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== item.id) }));
    } catch {
      setItemError("حذف مکمل با مشکل مواجه شد.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAssign(userId) {
    const result = await assignSupplementPlan(planId, userId);
    await loadAssignments();
    setIsAssignOpen(false);
    // Assigning replaces whatever the member was on, so say which one went.
    setToast(
      result.previous_plan_archived
        ? `اختصاص داده شد. برنامه قبلی («${result.previous_plan_archived}») بایگانی شد.`
        : "برنامه اختصاص داده شد."
    );
  }

  async function handleDeletePlan() {
    const count = assignments?.length ?? 0;
    const warning =
      count > 0
        ? `این برنامه به ${count} عضو اختصاص داده شده. با حذف برنامه، این اختصاص‌ها هم حذف می‌شوند.\n\nبرنامه «${plan.name}» برای همیشه حذف شود؟`
        : `برنامه «${plan.name}» برای همیشه حذف شود؟ این کار قابل بازگشت نیست.`;
    if (!window.confirm(warning)) return;
    setIsDeleting(true);
    try {
      await deleteSupplementPlan(planId);
      navigate("/supplements");
    } catch {
      setError("حذف برنامه با مشکل مواجه شد.");
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (!plan) return <p className="error-text">{error}</p>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/supplements" className="muted back-link">
            ← بازگشت به مکمل‌ها
          </Link>
          <div className="editable-title">
            <h1 className="page-title">{plan.name}</h1>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              onClick={() => setIsInfoOpen(true)}
              aria-label="ویرایش اطلاعات برنامه"
            >
              <PencilIcon size={15} />
            </button>
          </div>
          {plan.goal && (
            <span className="badge badge-neutral">
              {SUPPLEMENT_GOAL_LABELS[plan.goal] ?? plan.goal}
            </span>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => setIsAssignOpen(true)}>
          اختصاص به عضو
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {toast && <p className="success-text">{toast}</p>}
      {plan.description && <p className="muted plan-description">{plan.description}</p>}

      <section className="card plan-section">
        <h2 className="plan-section-title">اقلام برنامه</h2>
        <p className="muted plan-section-hint">
          مقدار و زمان مصرف را همان‌طور که به ورزشکار می‌گویید بنویسید — مثلاً «۳۰ گرم، بعد از تمرین».
        </p>

        <SupplementItemList
          items={plan.items}
          onAdd={handleAddItem}
          onUpdate={handleUpdateItem}
          onDelete={handleDeleteItem}
          deletingId={deletingId}
        />

        {itemError && (
          <p className="error-text" role="alert">
            {itemError}
          </p>
        )}

      </section>

      <section className="card plan-section">
        <h2 className="plan-section-title">اختصاص داده شده به</h2>
        <PlanAssignments
          assignments={assignments}
          onStatusChange={async (assignment, status) => {
            await updateSupplementAssignment(assignment.id, { status });
            await loadAssignments();
          }}
          onRemove={async (assignment) => {
            await deleteSupplementAssignment(assignment.id);
            await loadAssignments();
          }}
        />
      </section>

      <div className="form-actions">
        <button className="btn btn-danger" onClick={handleDeletePlan} disabled={isDeleting}>
          {isDeleting ? "در حال حذف…" : "حذف برنامه"}
        </button>
      </div>

      {isAssignOpen && (
        <AssignMemberModal
          planName={plan.name}
          onAssign={handleAssign}
          onClose={() => setIsAssignOpen(false)}
        />
      )}

      {isInfoOpen && (
        <EditPlanInfoModal
          plan={plan}
          goalOptions={SUPPLEMENT_GOALS}
          onClose={() => setIsInfoOpen(false)}
          // The modal closes itself once onSave resolves.
          onSave={async (payload) => {
            const updated = await updateSupplementPlan(planId, payload);
            setPlan((prev) => ({ ...prev, ...updated }));
          }}
        />
      )}
    </div>
  );
}
