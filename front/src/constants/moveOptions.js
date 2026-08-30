// The backend stores/returns English keys (Django TextChoices), so these
// values must stay exactly as the API expects — only the labels are
// translated. Centralized here so the list filters, the add-move form, and
// the move card badges can't drift out of sync with each other.

export const CATEGORIES = [
  ["chest", "سینه"],
  ["back", "پشت"],
  ["legs", "پا"],
  ["shoulders", "شانه"],
  ["arms", "بازو"],
  ["core", "شکم"],
  ["cardio", "هوازی"],
  ["full_body", "کل بدن"],
  ["other", "سایر"],
];

export const DIFFICULTIES = [
  ["beginner", "مبتدی"],
  ["intermediate", "متوسط"],
  ["advanced", "پیشرفته"],
];

export const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
export const DIFFICULTY_LABELS = Object.fromEntries(DIFFICULTIES);
