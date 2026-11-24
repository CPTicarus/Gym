import { useState } from "react";

import { COLOR_LABELS, DEFAULT_BRANDING } from "../../config/brand.js";
import { useAppConfig } from "../../hooks/useAppConfig.js";
import ChatMediaSettingsForm from "./ChatMediaSettingsForm.jsx";
import PaletteEditor from "./PaletteEditor.jsx";
import ServerBackupsPanel from "./ServerBackupsPanel.jsx";
import ServerResourcesPanel from "./ServerResourcesPanel.jsx";

const TEXT_FIELDS = [
  { key: "name", label: "نام باشگاه", max: 80 },
  { key: "tagline", label: "عنوان صفحه ورود", max: 160 },
  { key: "note", label: "یادداشت صفحه ورود", max: 240 },
];
const LIST_FIELDS = [
  { key: "ticker", label: "اعلان‌های نواری صفحه ورود" },
  { key: "greetings", label: "پیام‌های خوشامدگویی" },
];

function toDraft(brand) {
  return { ...brand, ticker: brand.ticker.join("\n"), greetings: brand.greetings.join("\n") };
}

function splitLines(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function getChanges(draft, branding) {
  const changes = {};
  for (const { key } of [...TEXT_FIELDS, ...LIST_FIELDS, { key: "scheme" }]) {
    const value = Array.isArray(branding[key]) ? splitLines(draft[key]) : draft[key].trim();
    const serialized = JSON.stringify(value);
    if (serialized !== JSON.stringify(branding[key])) {
      changes[key] = serialized === JSON.stringify(DEFAULT_BRANDING[key]) ? null : value;
    }
  }
  for (const mode of ["light_colors", "dark_colors"]) {
    const colors = {};
    for (const token of Object.keys(COLOR_LABELS)) {
      if (draft[mode][token] !== branding[mode][token]) colors[token] = draft[mode][token] ?? null;
    }
    if (Object.keys(colors).length) changes[mode] = colors;
  }
  return changes;
}

function BrandingForm() {
  const { branding, saveBranding } = useAppConfig();
  const [draft, setDraft] = useState(() => toDraft(branding));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const changes = getChanges(draft, branding);

  function edit(fields) {
    setDraft((current) => ({ ...current, ...fields }));
    setSaved(false);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("نام باشگاه را وارد کنید.");
      return;
    }
    for (const { key, label } of LIST_FIELDS) {
      const lines = splitLines(draft[key]);
      if (lines.length > 40 || lines.some((line) => line.length > 200)) {
        setError(`«${label}» حداکثر ۴۰ سطر می‌پذیرد و هر سطر باید حداکثر ۲۰۰ نویسه باشد.`);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      setDraft(toDraft(await saveBranding(changes)));
      setSaved(true);
    } catch {
      setError("ذخیره تنظیمات انجام نشد. دوباره تلاش کنید.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <section className="card" aria-labelledby="text-heading">
          <h2 id="text-heading" className="mb-4 text-lg">نام و پیام‌های باشگاه</h2>
          {TEXT_FIELDS.map(({ key, label, max }) => (
            <label key={key} className="field">
              <span className="label">{label}</span>
              <input className="input" dir="auto" value={draft[key]} maxLength={max} required={key === "name"}
                onChange={(e) => edit({ [key]: e.target.value })} />
            </label>
          ))}
          {LIST_FIELDS.map(({ key, label }) => (
            <label key={key} className="field">
              <span className="label">{label}</span>
              <textarea className="textarea" dir="auto" rows={4} value={draft[key]}
                onChange={(e) => edit({ [key]: e.target.value })} />
              <span className="text-xs text-muted">
                {key === "greetings"
                  ? <>هر پیام در یک سطر. برای نمایش نام کاربر از <bdi dir="ltr">{"{name}"}</bdi> استفاده کنید.</>
                  : "هر اعلان را در یک سطر بنویسید."}
              </span>
            </label>
          ))}
        </section>
        <PaletteEditor draft={draft} onChange={edit} />
        {error && <p role="alert" className="error-text">{error}</p>}
        {saved && <p role="status" className="success-text">تنظیمات باشگاه ذخیره شد.</p>}
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" disabled={!Object.keys(changes).length}
            onClick={() => edit(toDraft(branding))}>لغو تغییرات</button>
          <button className="btn btn-primary" disabled={!Object.keys(changes).length}>
            {saving ? "در حال ذخیره…" : "ذخیره تنظیمات"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export default function SystemSettingsPage() {
  const { isLoaded, hasBranding, chatMediaMaxSizeMb, retryConfig } = useAppConfig();
  return (
    <div className="form-page max-w-2xl">
      <h1 className="page-title">تنظیمات سیستم</h1>
      <div className="mt-4 space-y-6">
        <ServerResourcesPanel />
        <ServerBackupsPanel />
        {!isLoaded ? <p role="status">در حال بارگذاری تنظیمات باشگاه…</p> : hasBranding ? (
          <>
            {chatMediaMaxSizeMb !== undefined && <ChatMediaSettingsForm />}
            <BrandingForm />
          </>
        ) : (
          <div className="card">
            <p role="alert" className="error-text">دریافت تنظیمات باشگاه انجام نشد.</p>
            <button type="button" className="btn btn-ghost" onClick={retryConfig}>تلاش دوباره</button>
          </div>
        )}
      </div>
    </div>
  );
}
