// Bundled defaults for gyms that have no saved overrides or cannot load their settings.
export const DEFAULT_BRANDING = {
  name: "پلاک",
  tagline: "باشگاه ایلیا",
  note: "شنبه دیر است، امروز وقتشه!",
  ticker: [
    "برنامه تمرینی و غذایی اختصاصی",
    "کتابخانه حرکات با ویدیو و تصویر",
    "پیگیری وزن و شاخص توده بدنی",
    "امروز سنگین‌تر از دیروز",
  ],
  greetings: [
    "امروز همون روزه، {name}",
    "بیشتر فشار بیار، {name}",
    "یک تکرار بیشتر از دیروز، {name}",
    "فقط یک ست دیگه مونده",
    "سنگین‌تر از دفعه قبل، {name}",
    "بدنت می‌تونه؛ ذهنت رو راضی کن",
    "امروز رو هم بزن، {name}",
    "قوی‌تر از دیروز",
  ],
  scheme: "original",
  light_colors: {},
  dark_colors: {},
};

export const SCHEME_LABELS = { original: "اصلی", ocean: "اقیانوس", forest: "جنگل" };

export const COLOR_LABELS = {
  accent: "رنگ اصلی",
  "accent-ink": "نوشته روی رنگ اصلی",
  "accent-dark": "لینک و دکمه هنگام اشاره",
  "accent-soft": "پس‌زمینه تأکیدی",
  canvas: "پس‌زمینه صفحه",
  surface: "پس‌زمینه کارت‌ها",
  ink: "متن اصلی",
  muted: "متن فرعی",
  line: "خطوط و کادرها",
  "neutral-soft": "پس‌زمینه خنثی",
  chrome: "زمینه منو و صفحه ورود",
  "chrome-ink": "نوشته روی منو",
  success: "موفقیت",
  "success-soft": "پس‌زمینه موفقیت",
  danger: "خطا",
  "danger-soft": "پس‌زمینه خطا",
};

export function paletteStyle(colors) {
  return Object.fromEntries(
    Object.entries(colors)
      .filter(([key, color]) => Object.hasOwn(COLOR_LABELS, key) && /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(color))
      .map(([key, color]) => [`--gym-${key}`, color])
  );
}
