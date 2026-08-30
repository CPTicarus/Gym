import { useCallback, useEffect, useState } from "react";

import { listUsers } from "../../api/users.js";
import UserListItem from "../../components/users/UserListItem.jsx";
import { useAuth } from "../../hooks/useAuth.js";

const ROLE_FILTER_OPTIONS = [
  ["", "همه نقش‌ها"],
  ["member", "عضو"],
  ["trainer", "مربی"],
  ["admin", "مدیر"],
  ["accounting", "حسابداری"],
];

export default function DashboardPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = { page };
      if (search) params.search = search;
      if (isAdmin && roleFilter) params.role = roleFilter;
      const data = await listUsers(params);
      const results = data.results ?? data;
      setUsers(results);
      setCount(data.count ?? results.length);
      setHasNext(Boolean(data.next));
      setHasPrev(Boolean(data.previous));
    } catch {
      setError("بارگذاری کاربران با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, page, isAdmin]);

  // Any filter change should reset back to page 1.
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  useEffect(() => {
    const timeout = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">داشبورد</h1>
          <p className="page-subtitle">{isAdmin ? "فهرست همهٔ کاربران باشگاه." : "فهرست اعضای باشگاه."}</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder="جستجوی نام، ایمیل یا شماره تماس…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isAdmin && (
          <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            {ROLE_FILTER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری کاربران…</p>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <p>کاربری با این مشخصات پیدا نشد.</p>
        </div>
      ) : (
        <>
          <div className="user-list">
            {users.map((u) => (
              <UserListItem key={u.id} user={u}>
                {u.role === "member" && u.membership_end_date && (
                  <span className={`badge ${u.is_membership_active ? "badge-success" : "badge-danger"}`}>
                    {u.is_membership_active ? "فعال" : "غیرفعال"}
                  </span>
                )}
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
    </div>
  );
}
