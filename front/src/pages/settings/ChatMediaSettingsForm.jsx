import { useState } from "react";

import { useAppConfig } from "../../hooks/useAppConfig.js";

export default function ChatMediaSettingsForm() {
  const { chatMediaMaxSizeMb, chatMediaRetentionDays, saveChatMediaSettings } = useAppConfig();
  const [maxSize, setMaxSize] = useState(() => String(chatMediaMaxSizeMb));
  const [retention, setRetention] = useState(() => String(chatMediaRetentionDays ?? ""));
  const [keepForever, setKeepForever] = useState(chatMediaRetentionDays === null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const changes = {};
  const sizeMb = Number(maxSize);
  const retentionDays = keepForever ? null : Number(retention);
  if (sizeMb !== chatMediaMaxSizeMb) changes.chat_media_max_size_mb = sizeMb;
  if (retentionDays !== chatMediaRetentionDays) changes.chat_media_retention_days = retentionDays;
  const hasChanges = Object.keys(changes).length > 0;

  async function submit(event) {
    event.preventDefault();
    if (!hasChanges) return;
    setSaving(true);
    setFeedback(null);
    try {
      const settings = await saveChatMediaSettings(changes);
      setMaxSize(String(settings.chat_media_max_size_mb));
      setRetention(String(settings.chat_media_retention_days ?? ""));
      setKeepForever(settings.chat_media_retention_days === null);
      setFeedback({ message: "تنظیمات فایل‌های گفتگو ذخیره شد." });
    } catch {
      setFeedback({ error: true, message: "ذخیره تنظیمات فایل‌های گفتگو انجام نشد. دوباره تلاش کنید." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" aria-labelledby="chat-media-heading">
      <h2 id="chat-media-heading" className="mb-4 text-lg">فایل‌های گفتگو</h2>
      <form onSubmit={submit} onChange={() => setFeedback(null)}>
        <fieldset disabled={saving} className="min-w-0">
          <label className="field">
            <span className="label">حداکثر حجم هر فایل (مگابایت)</span>
            <input className="input" type="number" min="1" max="100" required value={maxSize}
              onChange={(event) => setMaxSize(event.target.value)} />
          </label>
          <label className="mb-3 flex items-center gap-2">
            <input type="checkbox" checked={keepForever} onChange={(event) => setKeepForever(event.target.checked)} />
            نگهداری دائمی فایل‌های گفتگو
          </label>
          {!keepForever && (
            <label className="field">
              <span className="label">مدت نگهداری هر فایل (روز)</span>
              <input className="input" type="number" min="1" max="36500" required value={retention}
                onChange={(event) => setRetention(event.target.value)} />
            </label>
          )}
          <p className="text-sm text-muted">
            مدت نگهداری از زمان ارسال فایل محاسبه می‌شود و برای فایل‌های قبلی هم اعمال می‌شود.
            فایل‌های منقضی‌شده فوراً از دسترس خارج می‌شوند و در پاک‌سازی دوره‌ای حذف می‌شوند.
          </p>
          {feedback && (
            <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "error-text" : "success-text"}>
              {feedback.message}
            </p>
          )}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={!hasChanges}>
              {saving ? "در حال ذخیره…" : "ذخیره تنظیمات گفتگو"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
