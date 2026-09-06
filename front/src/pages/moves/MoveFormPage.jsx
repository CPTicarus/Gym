import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  addMoveMedia,
  createMove,
  deleteMoveMedia,
  getMediaLimits,
  getMove,
  reorderMoveMedia,
  updateMove,
} from "../../api/moves.js";
import FilePicker from "../../components/common/FilePicker.jsx";
import MoveMediaList from "../../components/moves/MoveMediaList.jsx";
import {
  CATEGORIES,
  DIFFICULTIES,
  MEDIA_ACCEPT,
  mediaTypeForFile,
} from "../../constants/moveOptions.js";
import { toPersianDigits } from "../../utils/jalali.js";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

const BYTES_PER_MB = 1024 * 1024;

function formatMb(bytes) {
  return toPersianDigits((bytes / BYTES_PER_MB).toFixed(1).replace(/\.0$/, ""));
}

/**
 * Where a picked file sits against its type's caps: null when it's fine,
 * otherwise a message and whether it's a hard stop.
 *
 * `limits` may not have loaded yet (or the endpoint may have failed) — in
 * that case nothing is claimed here and the server, which enforces the
 * same caps on the way in, remains the backstop.
 */
function checkFileSize(file, limits) {
  const mediaType = mediaTypeForFile(file);
  const caps = limits?.[mediaType];
  if (!caps) return null;

  if (file.size > caps.max_bytes) {
    return {
      blocking: true,
      message: `حجم این فایل ${formatMb(file.size)} مگابایت است و بیشتر از حد مجاز (${formatMb(
        caps.max_bytes
      )} مگابایت) است. فایل را فشرده کنید یا به‌جای بارگذاری، لینکش را وارد کنید.`,
    };
  }
  if (file.size > caps.warn_bytes) {
    return {
      blocking: false,
      message: `حجم این فایل ${formatMb(file.size)} مگابایت است. بارگذاری‌اش ممکن است طول بکشد و برای اعضا هم کند باز شود — اگر می‌توانید فشرده‌ترش کنید.`,
    };
  }
  return null;
}

export default function MoveFormPage() {
  const navigate = useNavigate();
  const { moveId } = useParams();
  const isEditMode = Boolean(moveId);

  // Step 1 in create mode, always-visible "info" form in edit mode
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Once created (or, in edit mode, once loaded) we also show the media section
  const [move, setMove] = useState(null);
  const [mediaItems, setMediaItems] = useState([]);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState(null);

  // Media form
  const [file, setFile] = useState(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaError, setMediaError] = useState(null);
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [mediaLimits, setMediaLimits] = useState(null);
  // Separate from mediaError so a failed reorder reports next to the list
  // rather than down inside the add-media form.
  const [reorderError, setReorderError] = useState(null);

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await getMove(moveId);
        if (cancelled) return;
        setMove(data);
        setName(data.name);
        setAlias(data.alias ?? "");
        setDescription(data.description ?? "");
        setCategory(data.category ?? "");
        setDifficulty(data.difficulty ?? "");
        setMediaItems(data.media ?? []);
      } catch {
        if (!cancelled) setLoadError("بارگذاری حرکت با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [moveId, isEditMode]);

  useEffect(() => {
    // Caps are per-gym config, so they're read from the server rather than
    // duplicated here. A failure is non-fatal: the form just stops warning
    // and lets the server reject anything genuinely over the line.
    let cancelled = false;
    getMediaLimits()
      .then((limits) => {
        if (!cancelled) setMediaLimits(limits);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveInfo(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!name.trim()) {
      setError("نام الزامی است.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (isEditMode) {
        const updated = await updateMove(moveId, { name, alias, description, category, difficulty });
        setMove(updated);
        setSaved(true);
      } else {
        const created = await createMove({ name, alias, description, category, difficulty });
        setMove(created);
      }
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ذخیره حرکت با مشکل مواجه شد.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddMedia(e) {
    e.preventDefault();
    setMediaError(null);
    if (!file && !externalUrl.trim()) {
      setMediaError("یک فایل یا لینک وارد کنید.");
      return;
    }
    if (file && externalUrl.trim()) {
      setMediaError("فقط یکی از فایل یا لینک را وارد کنید، نه هر دو.");
      return;
    }
    // Belt and braces: the add button is already disabled for an oversized
    // file, but a keyboard submit shouldn't be able to slip past it.
    if (fileSizeNotice?.blocking) {
      setMediaError(fileSizeNotice.message);
      return;
    }
    setIsAddingMedia(true);
    try {
      const created = await addMoveMedia(move.id, {
        file,
        externalUrl: externalUrl.trim() || undefined,
        caption: caption.trim() || undefined,
        order: mediaItems.length,
      });
      setMediaItems((prev) => [...prev, created]);
      setFile(null);
      setExternalUrl("");
      setCaption("");
    } catch (err) {
      setMediaError(err?.response?.data ? formatApiError(err.response.data) : "افزودن رسانه با مشکل مواجه شد.");
    } finally {
      setIsAddingMedia(false);
    }
  }

  /** Swap an item with its neighbour. Applied locally first so the arrows
   * feel instant, then persisted — the server's response is what we keep,
   * and a failure rolls the list back rather than leaving the screen
   * disagreeing with the database. */
  async function handleReorderMedia(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= mediaItems.length) return;

    const previous = mediaItems;
    const next = [...mediaItems];
    [next[index], next[target]] = [next[target], next[index]];
    setMediaItems(next);
    setReorderError(null);
    setIsReordering(true);
    try {
      setMediaItems(await reorderMoveMedia(move.id, next.map((m) => m.id)));
    } catch {
      setMediaItems(previous);
      setReorderError("تغییر ترتیب با مشکل مواجه شد. دوباره امتحان کنید.");
    } finally {
      setIsReordering(false);
    }
  }

  async function handleDeleteMedia(item) {
    const label = item.caption || item.external_url || "این رسانه";
    if (!window.confirm(`«${label}» از این حرکت حذف شود؟ این کار قابل بازگشت نیست.`)) return;

    setReorderError(null);
    setDeletingId(item.id);
    try {
      await deleteMoveMedia(move.id, item.id);
      setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
    } catch {
      setReorderError("حذف رسانه با مشکل مواجه شد. دوباره امتحان کنید.");
    } finally {
      setDeletingId(null);
    }
  }

  // Back to a blank step 1, without leaving /moves/new — bulk-adding moves
  // means never round-tripping through the library between each one.
  function handleAddAnother() {
    setMove(null);
    setName("");
    setAlias("");
    setDescription("");
    setCategory("");
    setDifficulty("");
    setError(null);
    setSaved(false);
    setMediaItems([]);
    setFile(null);
    setExternalUrl("");
    setCaption("");
    setMediaError(null);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }

  if (isLoading) return <p className="muted">در حال بارگذاری…</p>;
  if (loadError) return <p className="error-text">{loadError}</p>;

  const showInfoForm = isEditMode || !move;
  const showMediaSection = Boolean(move);
  const fileSizeNotice = file ? checkFileSize(file, mediaLimits) : null;

  return (
    <div className="form-page">
      {showInfoForm && (
        <>
          <h1 className="page-title">{isEditMode ? "ویرایش حرکت" : "افزودن حرکت"}</h1>
          <p className="page-subtitle">
            {isEditMode
              ? "اطلاعات این حرکت را ویرایش کنید."
              : "نام و توضیح حرکت را وارد کنید — در مرحله بعد می‌توانید عکس یا ویدیو اضافه کنید."}
          </p>

          <form className="card form-card" onSubmit={handleSaveInfo} noValidate>
            <label className="field">
              <span className="label">نام حرکت*</span>
              <input
                ref={nameInputRef}
                className="input"
                dir="auto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="پرس سینه"
                required
              />
            </label>

            <label className="field">
              <span className="label">نام مستعار</span>
              <input
                className="input"
                dir="auto"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder=""
              />
            </label>

            <label className="field">
              <span className="label">توضیحات</span>
              <textarea
                className="textarea"
                dir="auto"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="نحوه اجرا، نوع گرفتن میله، مسیر حرکت و اشتباهات رایج — یا این بخش را خالی بگذارید و توضیح را در ویدیو بدهید"
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span className="label">دسته‌بندی*</span>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">—</option>
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">سطح دشواری*</span>
                <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="">—</option>
                  {DIFFICULTIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {saved && <p className="success-text">تغییرات ذخیره شد.</p>}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "در حال ذخیره…" : isEditMode ? "ذخیره تغییرات" : "ذخیره و ادامه"}
              </button>
            </div>
          </form>
        </>
      )}

      {showMediaSection && (
        <>
          {isEditMode ? (
            <h2 className="section-heading">افزودن رسانه آموزشی</h2>
          ) : (
            <>
              <h1 className="page-title">افزودن رسانه آموزشی</h1>
              <p className="page-subtitle">
                «{move.name}» ذخیره شد. یک عکس یا ویدیو از نحوه اجرا اضافه کنید، یا این مرحله را رد کنید.
              </p>
            </>
          )}

          <form className="card form-card" onSubmit={handleAddMedia} noValidate>
            <div className="field">
              <span className="label">بارگذاری فایل</span>
              <FilePicker file={file} onChange={setFile} accept={MEDIA_ACCEPT} />
              {fileSizeNotice ? (
                <p
                  className={
                    fileSizeNotice.blocking
                      ? "mt-1 rounded-lg bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger"
                      : "mt-1 rounded-lg bg-accent-soft px-3 py-2 text-[13px] font-semibold text-accent-dark"
                  }
                  role="alert"
                >
                  {fileSizeNotice.message}
                </p>
              ) : (
                <span className="text-xs text-muted">
                  عکس، GIF یا ویدیو — نوعش از روی خود فایل تشخیص داده می‌شود.
                </span>
              )}
            </div>

            <p className="field-divider">یا</p>

            <label className="field">
              <span className="label">لینک (مثلاً لینک غیرلیست‌شده یوتیوب یا ویمیو)</span>
              <input
                className="input"
                type="url"
                dir="ltr"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>

            <label className="field">
              <span className="label">عنوان (اختیاری)</span>
              <input className="input" dir="auto" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </label>

            {mediaError && (
              <p className="error-text" role="alert">
                {mediaError}
              </p>
            )}

            <div className="form-actions">
              <button
                className="btn btn-secondary"
                type="submit"
                disabled={isAddingMedia || Boolean(fileSizeNotice?.blocking)}
              >
                {isAddingMedia ? "در حال افزودن…" : "افزودن رسانه"}
              </button>
            </div>
          </form>

          {mediaItems.length > 0 && (
            <>
              <h2 className="section-heading">رسانه‌های این حرکت</h2>
              <p className="page-subtitle mb-3">
                اعضا رسانه‌ها را به همین ترتیب می‌بینند — با فلش‌ها جابه‌جایشان کنید.
              </p>
              <MoveMediaList
                items={mediaItems}
                onMove={handleReorderMedia}
                onDelete={handleDeleteMedia}
                isReordering={isReordering}
                deletingId={deletingId}
              />
              {reorderError && (
                <p className="error-text" role="alert">
                  {reorderError}
                </p>
              )}
            </>
          )}

          {!isEditMode && (
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={handleAddAnother}>
                افزودن حرکت بعدی
              </button>
              <button type="button" className="btn btn-primary" onClick={() => navigate("/moves")}>
                پایان — رفتن به کتابخانه
              </button>
            </div>
          )}
        </>
      )}

      {isEditMode && (
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={() => navigate("/moves")}>
            بازگشت به کتابخانه
          </button>
        </div>
      )}
    </div>
  );
}
