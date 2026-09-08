// Backend stores English keys (Django TextChoices) — only labels are
// translated. Keep in sync with SupplementPlan.Goal in
// apps/supplements/models.py.
export const SUPPLEMENT_GOALS = [
  ["bulking", "افزایش حجم"],
  ["cutting", "کات و تفکیک"],
  ["recovery", "ریکاوری"],
  ["performance", "افزایش عملکرد"],
  ["general", "عمومی"],
  ["other", "سایر"],
];

export const SUPPLEMENT_GOAL_LABELS = Object.fromEntries(SUPPLEMENT_GOALS);
