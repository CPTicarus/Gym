import { useCallback, useEffect, useState } from "react";

import { listUsers } from "../../api/users.js";
import { getBmiCategory } from "../../utils/bmi.js";
import Modal from "../common/Modal.jsx";

function isOutOfBmiRange(bmi, minBmi, maxBmi) {
  if (bmi == null) return false;
  if (minBmi != null && bmi < minBmi) return true;
  if (maxBmi != null && bmi > maxBmi) return true;
  return false;
}

/**
 * Search members and assign the plan to one. `onAssign(userId)` is
 * supplied by the parent so this works for both workout and diet plans.
 * `minBmi`/`maxBmi` (workout plans only) let this flag members whose BMI
 * falls outside the plan's safe range before the trainer even clicks
 * assign — the backend re-checks and warns too, this is just earlier.
 */
export default function AssignMemberModal({ onClose, onAssign, planName, minBmi, maxBmi }) {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [assignedIds, setAssignedIds] = useState([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { role: "member" };
      if (search) params.search = search;
      const data = await listUsers(params);
      setMembers(data.results ?? data);
    } catch {
      setError("بارگذاری فهرست اعضا با مشکل مواجه شد.");
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  async function handleAssign(member) {
    setError(null);
    setAssigningId(member.id);
    try {
      await onAssign(member.id);
      setAssignedIds((prev) => [...prev, member.id]);
    } catch {
      setError("اختصاص برنامه با مشکل مواجه شد.");
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <Modal title={`اختصاص «${planName}»`} onClose={onClose}>
      <input
        className="input assign-search"
        type="search"
        dir="auto"
        placeholder="جستجوی عضو…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : members.length === 0 ? (
        <p className="muted">عضوی پیدا نشد.</p>
      ) : (
        <ul className="assign-list">
          {members.map((m) => {
            const fullName = [m.first_name, m.last_name].filter(Boolean).join(" ") || m.username;
            const isAssigned = assignedIds.includes(m.id);
            const outOfRange = isOutOfBmiRange(m.bmi, minBmi, maxBmi);
            const category = getBmiCategory(m.bmi);
            return (
              <li key={m.id} className="assign-row">
                <div className="assign-row-main">
                  <span className="assign-name">{fullName}</span>
                  <span className="flex items-center gap-2">
                    <span className="muted assign-username ltr">{m.username}</span>
                    {m.bmi != null && (
                      <span className={`badge badge-${outOfRange ? "danger" : category?.variant ?? "neutral"}`}>
                        BMI: {m.bmi}
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className={`btn btn-sm ${isAssigned ? "btn-ghost" : "btn-primary"}`}
                  onClick={() => handleAssign(m)}
                  disabled={isAssigned || assigningId === m.id}
                >
                  {isAssigned ? "اختصاص داده شد" : assigningId === m.id ? "…" : "اختصاص"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
