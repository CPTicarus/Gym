import { toEnglishDigits } from "./jalali.js";

export function getSetTargets(exercise) {
  return exercise?.reps_per_set ?? exercise?.seconds_per_set;
}

export function formatExerciseAmount(exercise) {
  return getSetTargets(exercise)?.join("-") ?? String(exercise?.duration_seconds ?? exercise?.reps ?? "");
}

// A single number applies to every set. A list follows workout order.
export function parseExerciseAmount(input, amountType, sets) {
  const fields = { reps: null, reps_per_set: null, duration_seconds: null, seconds_per_set: null };
  const text = toEnglishDigits(input).trim();
  if (!text) return fields;

  const tokens = text.split(/\s*[,،_-]\s*|\s+/);
  const values = tokens.map(Number);
  if (tokens.some((token) => !/^\d+$/.test(token)) || values.some((n) => !Number.isSafeInteger(n))) {
    return { error: "مقدار هر ست را با عدد صحیح وارد کنید و با فاصله، ویرگول فارسی یا انگلیسی، خط تیره (-) یا زیرخط (_) جدا کنید." };
  }
  if (values.length === 1) {
    const field = amountType === "duration" ? "duration_seconds" : "reps";
    return { ...fields, [field]: values[0] };
  }
  if (values.includes(0)) return { error: "مقدار هر ست باید حداقل یک باشد." };
  if (sets != null && values.length !== sets) {
    return { error: "برای هر ست یک مقدار وارد کنید." };
  }
  const field = amountType === "duration" ? "seconds_per_set" : "reps_per_set";
  return { ...fields, [field]: values };
}
