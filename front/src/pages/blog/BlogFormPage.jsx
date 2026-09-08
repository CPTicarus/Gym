import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { createPost, getPost, updatePost } from "../../api/blog.js";
import FilePicker from "../../components/common/FilePicker.jsx";
import { POST_CATEGORIES } from "../../constants/blogOptions.js";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

/** Write or edit a post. Trainer/admin only by route; the API additionally
 * refuses an edit by anyone who isn't the author (or an admin), so opening
 * someone else's post here just fails on save rather than silently
 * overwriting it. */
export default function BlogFormPage() {
  const navigate = useNavigate();
  const { postId } = useParams();
  const isEditMode = Boolean(postId);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState(null);
  const [currentCover, setCurrentCover] = useState(null);

  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await getPost(postId);
        if (cancelled) return;
        setTitle(data.title);
        setSummary(data.summary ?? "");
        setCategory(data.category ?? "");
        setContent(data.content ?? "");
        setCurrentCover(data.cover_image ?? null);
        setIsPublished(data.status === "published");
      } catch {
        if (!cancelled) setLoadError("بارگذاری بلاگ با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [postId, isEditMode]);

  /** `status` comes from which button was pressed, not from a field —
   * "save as draft" and "publish" are the two things an author actually
   * wants to do, so they're two buttons rather than a dropdown. */
  async function save(status) {
    setError(null);
    setSaved(false);
    if (!title.trim()) {
      setError("عنوان الزامی است.");
      return;
    }
    if (!content.trim()) {
      setError("متن بلاگ الزامی است.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        summary: summary.trim(),
        category,
        content,
        status,
        coverImage,
      };
      if (isEditMode) {
        const updated = await updatePost(postId, payload);
        setCurrentCover(updated.cover_image ?? null);
        setIsPublished(updated.status === "published");
        setCoverImage(null);
        setSaved(true);
        setIsSubmitting(false);
      } else {
        const created = await createPost(payload);
        navigate(`/blog/${created.id}`);
      }
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ذخیره بلاگ با مشکل مواجه شد.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (loadError) return <p className="error-text">{loadError}</p>;

  return (
    <div className="form-page">
      <Link to="/blog" className="muted back-link">
        ← بازگشت به بلاگ
      </Link>

      <h1 className="page-title">{isEditMode ? "ویرایش بلاگ" : "بلاگ جدید"}</h1>
      <p className="page-subtitle">
        {isEditMode
          ? isPublished
            ? "این بلاگ منتشر شده و همه اعضا می‌توانند آن را ببینند."
            : "این بلاگ هنوز پیش‌نویس است و فقط شما (و مدیران) آن را می‌بینید."
          : "بلاگ را بنویسید و به‌صورت پیش‌نویس ذخیره کنید یا همین حالا برای اعضا منتشر کنید."}
      </p>

      <form className="card max-w-[720px]" onSubmit={(e) => e.preventDefault()} noValidate>
        <label className="field">
          <span className="label">عنوان*</span>
          <input
            className="input"
            dir="auto"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً چقدر پروتئین در روز لازم داریم؟"
            required
          />
        </label>

        <label className="field">
          <span className="label">خلاصه (در فهرست بلاگ نمایش داده می‌شود)</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={2}
            maxLength={300}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="یکی دو جمله درباره موضوع بلاگ"
          />
        </label>

        <label className="field">
          <span className="label">موضوع</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {POST_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="label">متن بلاگ*</span>
          <textarea
            className="textarea"
            dir="auto"
            rows={14}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="متن کامل بلاگ…"
            required
          />
        </label>

        <div className="field">
          <span className="label">تصویر شاخص (اختیاری)</span>
          <FilePicker file={coverImage} onChange={setCoverImage} accept="image/*" buttonLabel="انتخاب عکس" />
        </div>

        {currentCover && !coverImage && (
          <img
            src={currentCover}
            alt=""
            className="mb-4 max-h-40 w-full rounded-lg border border-line object-cover"
          />
        )}

        {saved && <p className="success-text">تغییرات ذخیره شد.</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => save("draft")}
            disabled={isSubmitting}
          >
            {isPublished ? "بازگرداندن به پیش‌نویس" : "ذخیره پیش‌نویس"}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            onClick={() => save("published")}
            disabled={isSubmitting}
          >
            {isSubmitting ? "در حال ذخیره…" : isPublished ? "ذخیره تغییرات" : "انتشار"}
          </button>
        </div>
      </form>
    </div>
  );
}
