import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchAllMoves } from "../../api/moves.js";
import MoveCard from "../../components/moves/MoveCard.jsx";
import MoveDetailModal from "../../components/moves/MoveDetailModal.jsx";
import { CATEGORIES, DIFFICULTIES } from "../../constants/moveOptions.js";
import { useAuth } from "../../hooks/useAuth.js";
import { toPersianDigits } from "../../utils/jalali.js";
import { normalizeSearch } from "../../utils/search.js";

const CATEGORY_FILTER_OPTIONS = [["", "همه دسته‌ها"], ...CATEGORIES];
const DIFFICULTY_FILTER_OPTIONS = [["", "همه سطوح"], ...DIFFICULTIES];

/**
 * The move library. The whole library is loaded once and filtered in the
 * browser — it used to show one page of 20 from the server and had no way
 * to reach the rest, so a gym's 21st move simply wasn't in its library.
 * Filtering locally also makes search instant, and folds Persian spelling
 * differences (see normalizeSearch) the server's search didn't.
 */
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

  useEffect(() => {
    let cancelled = false;
    fetchAllMoves()
      .then((data) => {
        if (!cancelled) setMoves(data);
      })
      .catch(() => {
        if (!cancelled) setError("بارگذاری حرکات با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const q = normalizeSearch(search);
    return moves.filter(
      (move) =>
        (!category || move.category === category) &&
        (!difficulty || move.difficulty === difficulty) &&
        (!q || normalizeSearch(move.name).includes(q) || normalizeSearch(move.alias).includes(q))
    );
  }, [moves, search, category, difficulty]);

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
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <p>{moves.length === 0 ? "هنوز حرکتی ثبت نشده." : "حرکتی با این فیلتر پیدا نشد."}</p>
          {canManageMoves && moves.length === 0 && (
            <Link to="/moves/new" className="btn btn-primary btn-sm">
              اولین حرکت را اضافه کنید
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="muted mb-3 text-xs">
            {toPersianDigits(visible.length)} حرکت
            {visible.length !== moves.length && ` از ${toPersianDigits(moves.length)}`}
          </p>
          <div className="move-grid">
            {visible.map((move) => (
              <MoveCard key={move.id} move={move} editable={canManageMoves} onView={setViewMoveId} />
            ))}
          </div>
        </>
      )}

      {viewMoveId && <MoveDetailModal moveId={viewMoveId} onClose={() => setViewMoveId(null)} />}
    </div>
  );
}
