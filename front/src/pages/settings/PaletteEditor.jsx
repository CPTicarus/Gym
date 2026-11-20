import { useLayoutEffect, useRef, useState } from "react";

import { COLOR_LABELS, paletteStyle, SCHEME_LABELS } from "../../config/brand.js";
import { useTheme } from "../../hooks/useTheme.js";

function expandHex(value) {
  if (/^#[a-f\d]{3,4}$/i.test(value)) {
    return "#" + [...value.slice(1)].map((digit) => digit + digit).join("");
  }
  return value;
}

export default function PaletteEditor({ draft, onChange }) {
  const { theme } = useTheme();
  const [mode, setMode] = useState(theme);
  const preview = useRef(null);
  const [baseColors, setBaseColors] = useState({});
  const colorKey = `${mode}_colors`;
  const colors = draft[colorKey];

  useLayoutEffect(() => {
    const css = getComputedStyle(preview.current);
    const entries = Object.keys(COLOR_LABELS).map((key) => [
      key, expandHex(css.getPropertyValue(`--gym-${key}`).trim()),
    ]);
    setBaseColors(Object.fromEntries(entries));
  }, [draft.scheme, mode]);

  return (
    <section className="card space-y-4" aria-labelledby="palette-heading">
      <h2 className="text-lg" id="palette-heading">رنگ‌بندی برنامه</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field mb-0">
          <span className="label">طرح رنگ</span>
          <select className="select" value={draft.scheme} onChange={(e) => onChange({
            scheme: e.target.value, light_colors: {}, dark_colors: {},
          })}>
            {Object.entries(SCHEME_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="field mb-0">
          <span className="label">حالت پیش‌نمایش و ویرایش</span>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="light">روشن</option>
            <option value="dark">تیره</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-muted">با انتخاب طرح جدید، رنگ‌های هر دو حالت به رنگ‌های همان طرح برمی‌گردند.</p>

      <div className="palette-preview" data-scheme={draft.scheme} data-theme={mode} ref={preview} aria-label="پیش‌نمایش رنگ‌بندی">
        <div style={paletteStyle(colors)} className="overflow-hidden border border-line bg-canvas text-ink">
          <div className="flex items-center gap-3 bg-chrome px-4 py-2 text-chrome-ink">
            <span className="h-4 w-1 shrink-0 bg-accent" />
            <span className="brand-mark">{draft.name}</span>
          </div>
          <div className="m-4 space-y-2 border border-line bg-surface p-4">
            {draft.tagline && <p className="font-bold">{draft.tagline}</p>}
            {draft.note && <p className="text-sm text-muted">{draft.note}</p>}
            <span className="inline-block bg-accent px-4 py-1 text-sm font-bold text-accent-ink">ورود</span>
          </div>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer font-semibold">سفارشی‌سازی رنگ‌های حالت {mode === "light" ? "روشن" : "تیره"}</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(COLOR_LABELS).map(([key, label]) => {
            const color = colors[key] ?? baseColors[key] ?? "#000000";
            return (
              <label key={key} className="flex items-center gap-2 border border-line px-2 py-1.5 text-sm">
                <input type="color" value={color.slice(0, 7)} className="h-8 w-10 shrink-0 cursor-pointer"
                  onChange={(e) => onChange({ [colorKey]: { ...colors, [key]: e.target.value + color.slice(7) } })} />
                {label}
              </label>
            );
          })}
        </div>
        <button type="button" className="btn btn-ghost btn-sm mt-3" disabled={!Object.keys(colors).length}
          onClick={() => onChange({ [colorKey]: {} })}>بازنشانی رنگ‌های این حالت</button>
      </details>
    </section>
  );
}
