import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listPosts } from "../../api/blog.js";
import { POST_CATEGORIES, POST_CATEGORY_LABELS, POST_STATUSES } from "../../constants/blogOptions.js";
import { useAuth } from "../../hooks/useAuth.js";
import { formatDate } from "../../utils/format.js";

const CATEGORY_FILTER_OPTIONS = [["", "همه موضوع‌ها"], ...POST_CATEGORIES];
const STATUS_FILTER_OPTIONS = [["", "همه وضعیت‌ها"], ...POST_STATUSES];

function PostCard({ post }) {
  return (
    <Link
      to={`/blog/${post.id}`}
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface no-underline shadow-card transition-colors hover:bg-neutral-soft"
    >
      {post.cover_image && (
        <img
          src={post.cover_image}
          alt=""
          className="h-40 w-full bg-neutral-soft object-cover"
          loading="lazy"
        />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {post.category && (
            <span className="badge badge-accent">
              {POST_CATEGORY_LABELS[post.category] ?? post.category}
            </span>
          )}
          {post.status === "draft" && <span className="badge badge-neutral">پیش‌نویس</span>}
        </div>

        <h3 className="text-[17px]">{post.title}</h3>
        {post.summary && <p className="line-clamp-3 text-sm text-muted">{post.summary}</p>}

        <p className="mt-auto pt-1 text-xs text-muted">
          {post.author_name || "نویسنده نامشخص"} — {formatDate(post.published_at ?? post.created_at)}
        </p>
      </div>
    </Link>
  );
}

/** The gym's blog. Everyone reads it; trainers and admins also write it —
 * for them the list additionally shows their own unpublished drafts. */
export default function BlogListPage() {
  const { role } = useAuth();
  const canWrite = role === "trainer" || role === "admin";

  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      if (canWrite && status) params.status = status;
      const data = await listPosts(params);
      setPosts(data.results ?? data);
    } catch {
      setError("بارگذاری بلاگ با مشکل مواجه شد. کمی بعد دوباره امتحان کنید.");
    } finally {
      setIsLoading(false);
    }
  }, [search, category, status, canWrite]);

  useEffect(() => {
    const timeout = setTimeout(load, 250); // debounce search typing
    return () => clearTimeout(timeout);
  }, [load]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">مطالب</h1>
          <p className="page-subtitle">
            {canWrite
              ? "نوشته‌های آموزشی، تغذیه‌ای و اخبار باشگاه — برای همه اعضا."
              : "نوشته‌های مربیان و مدیران باشگاه درباره تمرین، تغذیه و اخبار."}
          </p>
        </div>
        {canWrite && (
          <Link to="/blog/new" className="btn btn-primary">
            + بلاگ جدید
          </Link>
        )}
      </div>

      <div className="filter-bar">
        <input
          className="input"
          type="search"
          dir="auto"
          placeholder="جستجو در بلاگ…"
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
        {canWrite && (
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTER_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {isLoading ? (
        <p className="muted">در حال بارگذاری بلاگ…</p>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <p>هنوز بلاگی با این فیلتر پیدا نشد.</p>
          {canWrite && (
            <Link to="/blog/new" className="btn btn-primary btn-sm">
              اولین نوشته را بنویسید
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
