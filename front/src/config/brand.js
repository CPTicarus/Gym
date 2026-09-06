// Everything gym-specific that isn't a color or a font lives here.
// To reuse this app for a different gym: edit this file, the @theme block
// in src/index.css, and (optionally) the font <link> in index.html —
// nothing else needs to change.

export const BRAND_NAME = "پلاک";
export const BRAND_TAGLINE = "باشگاه ایلیا";
export const BRAND_NOTE = "شنبه دیر است، امروز وقتشه!";

// The scrolling strip on the login screen. Login only, on purpose: it's
// the one place with nothing else competing for attention. Running it
// behind the app itself just pulls the eye off whatever the page is for.
// Short lines only — this is signage, not prose; anything long enough to
// need reading twice will have scrolled past. A gym puts its own notices
// here (class times, closures, campaigns) without touching a component.
export const BRAND_TICKER = [
  "برنامه تمرینی و غذایی اختصاصی",
  "کتابخانه حرکات با ویدیو و تصویر",
  "پیگیری وزن و شاخص توده بدنی",
  "امروز سنگین‌تر از دیروز",
];

// One of these is drawn at login and shown in the top bar for the rest of
// the session. `{name}` is replaced with the person's full name; lines
// without it are addressed to nobody in particular, which is fine — the
// mix is what stops it reading like a mail merge. A gym rewrites these in
// its own voice without touching a component.
export const GREETINGS = [
  "امروز همون روزه، {name}",
  "بیشتر فشار بیار، {name}",
  "یک تکرار بیشتر از دیروز، {name}",
  "فقط یک ست دیگه مونده",
  "سنگین‌تر از دفعه قبل، {name}",
  "بدنت می‌تونه؛ ذهنت رو راضی کن",
  "امروز رو هم بزن، {name}",
  "قوی‌تر از دیروز",
];

