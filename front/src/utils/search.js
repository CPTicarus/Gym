/**
 * Fold away the differences that make the "same" Persian text fail to
 * match: Arabic yeh/kaf versus the Persian letters (depends on whose
 * keyboard typed it), a ZWNJ versus a space ("تخم‌مرغ" / "تخم مرغ"),
 * letter case, and runs of whitespace.
 */
export function normalizeSearch(text) {
  return String(text ?? "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Persian alphabetical order. The database sorts by code point, which puts
// پ چ ژ ک گ after every other letter.
const collator = new Intl.Collator("fa");

/** A copy of `items` sorted by name, in Persian alphabetical order. */
export function sortByName(items) {
  return [...items].sort((a, b) => collator.compare(a.name, b.name));
}
