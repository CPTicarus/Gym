// Backend stores English keys (Django TextChoices) — only labels are
// translated. Keep in sync with HealthCondition.Condition in
// apps/accounts/models.py.
//
// These are codes rather than free text so a future plan feature can act
// on them (skip squats for a flagged knee, say). OTHER is the escape
// hatch for anything not listed: it still reaches the trainer, it just
// can't be reasoned about automatically.
export const HEALTH_CONDITIONS = [
  ["back_pain", "کمردرد"],
  ["knee_pain", "زانودرد"],
  ["shoulder_pain", "درد شانه"],
  ["neck_pain", "گردن‌درد"],
  ["wrist_pain", "درد مچ دست"],
  ["ankle_pain", "درد مچ پا"],
  ["hernia", "فتق / دیسک"],
  ["asthma", "آسم"],
  ["heart_condition", "بیماری قلبی"],
  ["high_blood_pressure", "فشار خون بالا"],
  ["diabetes", "دیابت"],
  ["recent_surgery", "جراحی اخیر"],
  ["pregnancy", "بارداری"],
];

export const OTHER_CONDITION = "other";

export const HEALTH_CONDITION_LABELS = Object.fromEntries(HEALTH_CONDITIONS);

/** What to show for one recorded condition — the member's own wording for
 *  an "other" entry, the standard label otherwise. */
export function conditionLabel(condition) {
  if (condition.condition === OTHER_CONDITION) return condition.description || "سایر";
  return HEALTH_CONDITION_LABELS[condition.condition] ?? condition.condition;
}
