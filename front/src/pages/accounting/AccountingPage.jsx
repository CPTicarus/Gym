import { useCallback, useEffect, useState } from "react";

import { listAccountingMembers } from "../../api/accounting.js";
import UserListItem from "../../components/users/UserListItem.jsx";
import { formatDate } from "../../utils/format.js";

export default function AccountingPage() {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
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
      const params = { page, ordering: "membership_end_date" };
      if (search) params.search = search;
      const data = await listAccountingMembers(params);
      const results = data.results ?? data;
      setMembers(results);
      setCount(data.count ?? results.length);
      setHasNext(Boolean(data.next));
      setHasPrev(Boolean(data.previous));
    } catch {
      setError("بارگذاری اطلاعات با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
    } finally {
      setIsLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    const timeout = setTimeout(load, 250);
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">حسابداری</h1>
          <p className="page-subtitle">وضعیت عضویت اعضا، مرتب‌شده بر اساس نزدیک‌ترین تاریخ انقضا.</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder="جستجوی عضو…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری…</p>
      ) : members.length === 0 ? (
        <div className="empty-state">
          <p>عضوی با این مشخصات پیدا نشد.</p>
        </div>
      ) : (
        <>
          <div className="user-list">
            {members.map((m) => (
              <UserListItem key={m.id} user={m} to={`/users/${m.id}`}>
                <span className={`badge ${m.is_membership_active ? "badge-success" : "badge-danger"}`}>
                  {m.is_membership_active ? "فعال" : "غیرفعال"}
                </span>
                <span className="muted user-row-date ltr">{formatDate(m.membership_end_date)}</span>
              </UserListItem>
            ))}
          </div>

          {(hasNext || hasPrev) && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
                قبلی
              </button>
              <span className="muted pagination-count">{count} عضو</span>
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
