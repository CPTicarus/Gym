// Backend stores English keys (Django TextChoices) — only labels are
// translated. Keep in sync with User.Gender in apps/accounts/models.py.
//
// Both gender and date of birth are optional: an empty gender means "not
// stated", which is also why there's no "other" option — an optional field
// doesn't need one to avoid forcing an answer.
export const GENDERS = [
  ["male", "مرد"],
  ["female", "زن"],
];

export const GENDER_LABELS = Object.fromEntries(GENDERS);
