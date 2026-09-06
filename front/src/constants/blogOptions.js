// Backend stores English keys (Django TextChoices) — only labels are translated.
// Keep keys in sync with apps/blog/models.py.

export const POST_CATEGORIES = [
  ["training", "تمرین"],
  ["nutrition", "تغذیه"],
  ["news", "اخبار باشگاه"],
  ["health", "سلامت"],
  ["other", "سایر"],
];

export const POST_STATUSES = [
  ["draft", "پیش‌نویس"],
  ["published", "منتشرشده"],
];

export const POST_CATEGORY_LABELS = Object.fromEntries(POST_CATEGORIES);
export const POST_STATUS_LABELS = Object.fromEntries(POST_STATUSES);
