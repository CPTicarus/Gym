import { useCallback, useEffect, useState } from "react";

import { listUsers } from "../../api/users.js";
import Modal from "../common/Modal.jsx";

/**
 * Search members and assign the plan to one. `onAssign(userId)` is
 * supplied by the parent so this works for both workout and diet plans.
 */
export default function AssignMemberModal({ onClose, onAssign, planName }) {
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
            return (
              <li key={m.id} className="assign-row">
                <div className="assign-row-main">
                  <span className="assign-name">{fullName}</span>
                  <span className="muted assign-username ltr">{m.username}</span>
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
