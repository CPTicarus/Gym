import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deletePost, getPost } from "../../api/blog.js";
import { POST_CATEGORY_LABELS } from "../../constants/blogOptions.js";
import { formatDate } from "../../utils/format.js";

/** One full article. Open to every authenticated role — a draft simply
 * 404s for anyone but its author and admins (enforced by the API), which
 * is what the "not found" message below covers. */
export default function BlogPostPage() {
  const { postId } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getPost(postId);
        if (!cancelled) setPost(data);
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.response?.status === 404
            ? "این بلاگ پیدا نشد یا هنوز منتشر نشده است."
            : "بارگذاری بلاگ با مشکل مواجه شد."
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function handleDelete() {
    if (!window.confirm(`بلاگ «${post.title}» برای همیشه حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    setIsDeleting(true);
    try {
      await deletePost(postId);
      navigate("/blog");
    } catch {
      setError("حذف بلاگ با مشکل مواجه شد.");
      setIsDeleting(false);
    }
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;

  if (!post) {
    return (
      <div>
        <Link to="/blog" className="muted back-link">
          ← بازگشت به بلاگ
        </Link>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <Link to="/blog" className="muted back-link">
        ← بازگشت به بلاگ
      </Link>

      {post.cover_image && (
        <img
          src={post.cover_image}
          alt=""
          className="mb-4 w-full rounded-lg border border-line bg-neutral-soft object-cover"
        />
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {post.category && (
          <span className="badge badge-accent">
            {POST_CATEGORY_LABELS[post.category] ?? post.category}
          </span>
        )}
        {post.status === "draft" && <span className="badge badge-neutral">پیش‌نویس</span>}
      </div>

      <h1 className="page-title">{post.title}</h1>
      <p className="page-subtitle">
        {post.author_name || "نویسنده نامشخص"} — {formatDate(post.published_at ?? post.created_at)}
      </p>

      {post.summary && <p className="mt-4 text-[15px] font-semibold leading-8">{post.summary}</p>}

      {/* Content is plain text (no rich-text editor), so line breaks the
          author typed are the whole formatting story — preserve them. */}
      <p className="mt-4 whitespace-pre-line text-[15px] leading-8">{post.content}</p>

      {error && (
        <p className="error-text mt-4" role="alert">
          {error}
        </p>
      )}

      {post.can_edit && (
        <div className="form-actions mt-6 border-t border-line pt-4">
          <button className="btn btn-danger" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "در حال حذف…" : "حذف"}
          </button>
          <Link to={`/blog/${post.id}/edit`} className="btn btn-primary">
            ویرایش
          </Link>
        </div>
      )}
    </div>
  );
}
