import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listMoves } from "../../api/moves.js";
import MoveCard from "../../components/moves/MoveCard.jsx";
import MoveDetailModal from "../../components/moves/MoveDetailModal.jsx";
import { CATEGORIES, DIFFICULTIES } from "../../constants/moveOptions.js";
import { useAuth } from "../../hooks/useAuth.js";

const CATEGORY_FILTER_OPTIONS = [["", "همه دسته‌ها"], ...CATEGORIES];
const DIFFICULTY_FILTER_OPTIONS = [["", "همه سطوح"], ...DIFFICULTIES];

export default function MoveListPage() {
  const { role } = useAuth();
  const canManageMoves = role === "trainer" || role === "admin";

  const [moves, setMoves] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMoveId, setViewMoveId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      if (difficulty) params.difficulty = difficulty;
      const data = await listMoves(params);
      setMoves(data.results ?? data); // tolerate a non-paginated response too
    } catch {
      setError("بارگذاری حرکات با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
    } finally {
      setIsLoading(false);
    }
  }, [search, category, difficulty]);

  useEffect(() => {
    const timeout = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">کتابخانه حرکات</h1>
          <p className="page-subtitle">حرکات مرجع به‌همراه توضیحات و تصویر یا ویدیوی آموزشی.</p>
        </div>
        {canManageMoves && (
          <Link to="/moves/new" className="btn btn-primary">
            + افزودن حرکت
          </Link>
        )}
      </div>

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder="جستجوی حرکت…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_FILTER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          {DIFFICULTY_FILTER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری حرکات…</p>
      ) : moves.length === 0 ? (
        <div className="empty-state">
          <p>هنوز حرکتی با این فیلتر پیدا نشد.</p>
          {canManageMoves && (
            <Link to="/moves/new" className="btn btn-primary btn-sm">
              اولین حرکت را اضافه کنید
            </Link>
          )}
        </div>
      ) : (
        <div className="move-grid">
          {moves.map((move) => (
            <MoveCard key={move.id} move={move} editable={canManageMoves} onView={setViewMoveId} />
          ))}
        </div>
      )}

      {viewMoveId && <MoveDetailModal moveId={viewMoveId} onClose={() => setViewMoveId(null)} />}
    </div>
  );
}
