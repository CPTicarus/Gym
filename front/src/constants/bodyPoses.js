// The three angles a trainer needs to judge posture and proportion.
// Order matters — it's the order they're shot in and shown in.
export const BODY_POSES = [
  ["front", "از روبرو"],
  ["side", "از پهلو"],
  ["back", "از پشت"],
];

export const POSE_LABELS = Object.fromEntries(BODY_POSES);

// Anything past the three — a lat spread, a side chest — is an "extra":
// there can be several, each just a photo with an optional note. Keep in
// sync with BodyPhoto.Pose.EXTRA, MAX_EXTRAS and the note's max_length in
// apps/accounts/models.py.
export const EXTRA_POSE = "extra";
export const MAX_EXTRA_PHOTOS = 8;
export const MAX_NOTE_LENGTH = 255;
