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

// Media types are derived server-side from the file's extension — the
// uploader never picks one — so these are labels only, no <select>.
// Keep in sync with MoveMedia.MediaType in apps/moves/models.py.
export const MEDIA_TYPE_LABELS = {
  image: "عکس",
  gif: "GIF",
  video: "ویدیو",
};

// Exactly what the backend's FileExtensionValidator accepts, so the file
// dialog can't offer something the upload would then reject.
// Keep in sync with ALLOWED_MEDIA_EXTENSIONS in apps/moves/models.py.
export const MEDIA_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm";
