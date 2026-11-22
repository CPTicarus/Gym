import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { claimMember, listUnassignedMembers, listUsers } from "../../api/users.js";
import AddUserModal from "../../components/users/AddUserModal.jsx";
import UserListItem from "../../components/users/UserListItem.jsx";
import { useAppConfig } from "../../hooks/useAppConfig.js";
import { useAuth } from "../../hooks/useAuth.js";
import { fullName } from "../../utils/format.js";

const ROLE_FILTER_OPTIONS = [
  ["", "همه نقش‌ها"],
  ["member", "عضو"],
  ["trainer", "مربی"],
  ["admin", "مدیر"],
  ["accounting", "حسابداری"],
];

export default function DashboardPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const isTrainer = role === "trainer";
  const canAddUser = isAdmin || role === "accounting";
  const { isSelfSignup } = useAppConfig();

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [needsTrainer, setNeedsTrainer] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [claimingId, setClaimingId] = useState(null);
  const [claimError, setClaimError] = useState(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const showTrainerQueue = isTrainer && showUnassigned;

  const load = useCallback(async (signal) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { page };
      if (search) params.search = search;
      if (waitingOnly && !showTrainerQueue) params.waiting_for_plan = "true";
      if (isAdmin && needsTrainer) params.needs_trainer = "true";
      if (isAdmin && roleFilter && !waitingOnly && !needsTrainer) params.role = roleFilter;
      const data = showTrainerQueue ? await listUnassignedMembers(params, signal) : await listUsers(params, signal);
      if (signal?.aborted) return;
      const results = data.results ?? data;
      setUsers(results);
      setCount(data.count ?? results.length);
      setHasNext(Boolean(data.next));
      setHasPrev(Boolean(data.previous));
    } catch {
      if (!signal?.aborted) setError("بارگذاری کاربران با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [search, roleFilter, waitingOnly, needsTrainer, page, isAdmin, showTrainerQueue]);

  // Any filter change should reset back to page 1.
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter, waitingOnly, needsTrainer]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => load(controller.signal), 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [load, reloadVersion]);

  function changeTrainerView(unassigned) {
    if (showTrainerQueue === unassigned) return;
    setShowUnassigned(unassigned);
    setSearch("");
    setPage(1);
    setIsLoading(true);
    setError(null);
    setClaimError(null);
  }

  async function handleClaim(member) {
    setClaimError(null);
    setClaimingId(member.id);
    try {
      await claimMember(member.id);
      navigate(`/users/${member.id}`);
    } catch (err) {
      if (err?.response?.status === 404) {
        setClaimError("این عضو دیگر برای پذیرش در دسترس نیست. فهرست به‌روزرسانی می‌شود.");
        setIsLoading(true);
        setPage(1);
        setReloadVersion((version) => version + 1);
      } else {
        setClaimError("پذیرش عضو با مشکل مواجه شد. دوباره تلاش کنید.");
      }
    } finally {
      setClaimingId(null);
    }
  }

  const directorySubtitle = isAdmin
    ? "فهرست همهٔ کاربران باشگاه."
    : isTrainer ? "فهرست اعضای تحت نظر شما." : "فهرست اعضای باشگاه.";
  const queueSubtitle = showTrainerQueue ? "می‌توانید یکی از اعضای بدون مربی را تحت نظر بگیرید." : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">داشبورد</h1>
          <p className="page-subtitle">
            {queueSubtitle ?? (needsTrainer
              ? "اعضایی که مربی فعال ندارند."
              : waitingOnly
                ? "اعضایی که هنوز برنامه تمرینی فعالی ندارند؛ هر که زودتر ثبت‌نام کرده، اول."
                : directorySubtitle)}
          </p>
        </div>
        {canAddUser && (
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)}>
            {isAdmin ? "+ افزودن کاربر" : "+ افزودن عضو"}
          </button>
        )}
      </div>

      {isTrainer && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="فهرست اعضا">
          <button
            type="button"
            className={`btn ${showTrainerQueue ? "btn-ghost" : "btn-primary"}`}
            aria-pressed={!showTrainerQueue}
            disabled={claimingId !== null}
            onClick={() => changeTrainerView(false)}
          >
            اعضای من
          </button>
          <button
            type="button"
            className={`btn ${showTrainerQueue ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={showTrainerQueue}
            disabled={claimingId !== null}
            onClick={() => changeTrainerView(true)}
          >
            اعضای بدون مربی
          </button>
        </div>
      )}

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder={showTrainerQueue ? "جستجوی نام عضو…" : "جستجوی نام، ایمیل یا شماره تماس…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isAdmin && !waitingOnly && !needsTrainer && (
          <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            {ROLE_FILTER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        {isSelfSignup && !showTrainerQueue && (
          <label className="checkbox-field filter-checkbox">
            <input type="checkbox" checked={waitingOnly} onChange={(e) => setWaitingOnly(e.target.checked)} />
            <span>فقط اعضای منتظر برنامه</span>
          </label>
        )}
        {isAdmin && (
          <label className="checkbox-field filter-checkbox">
            <input type="checkbox" checked={needsTrainer} onChange={(e) => setNeedsTrainer(e.target.checked)} />
            <span>فقط اعضای بدون مربی فعال</span>
          </label>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {showTrainerQueue && claimError && <p className="error-text" role="alert">{claimError}</p>}

      {error ? null : isLoading ? (
        <p className="muted">در حال بارگذاری کاربران…</p>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <p>
            {showTrainerQueue && !search
              ? "عضوی برای پذیرش در انتظار نیست."
              : waitingOnly && !needsTrainer && !showTrainerQueue && !search
                ? "کسی منتظر برنامه نیست."
                : "کاربری با این مشخصات پیدا نشد."}
          </p>
        </div>
      ) : (
        <>
          <div className="user-list">
            {showTrainerQueue ? users.map((u) => (
              <UserListItem
                key={u.id}
                user={{ ...u, role: "member" }}
                actions={(
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label={`پذیرش ${fullName(u) || "عضو"}`}
                    disabled={claimingId !== null}
                    onClick={() => handleClaim(u)}
                  >
                    {claimingId === u.id ? "در حال پذیرش…" : "پذیرش عضو"}
                  </button>
                )}
              />
            )) : users.map((u) => (
              <UserListItem key={u.id} user={u} to={`/users/${u.id}`}>
                {u.role === "member" && u.membership_end_date && (
                  <span className={`badge ${u.is_membership_active ? "badge-success badge-live" : "badge-danger"}`}>
                    {u.is_membership_active ? "فعال" : "غیرفعال"}
                  </span>
                )}
                {/* Signed up, never paid — their plans stay locked until
                    they do (User.plans_locked; never set in a
                    staff-managed gym). */}
                {u.plans_locked && !u.membership_end_date && (
                  <span className="badge badge-accent">پرداخت‌نشده</span>
                )}
                {/* Height and weight are what a plan is written from. */}
                {waitingOnly && u.bmi == null && <span className="badge badge-neutral">بدون قد و وزن</span>}
              </UserListItem>
            ))}
          </div>

          {(hasNext || hasPrev) && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
                قبلی
              </button>
              <span className="muted pagination-count">{count} کاربر</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
                بعدی
              </button>
            </div>
          )}
        </>
      )}

      {isAddOpen && (
        <AddUserModal
          canCreateStaff={isAdmin}
          onClose={() => setIsAddOpen(false)}
          onCreated={() => {
            setIsAddOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
