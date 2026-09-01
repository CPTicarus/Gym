// WHO adult BMI categories — used to label a computed BMI value consistently
// wherever it's shown (profile, staff user detail, plan assignment).
export function getBmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { label: "کم‌وزن", variant: "accent" };
  if (bmi < 25) return { label: "طبیعی", variant: "success" };
  if (bmi < 30) return { label: "اضافه‌وزن", variant: "accent" };
  return { label: "چاق", variant: "danger" };
}

/** Turns the `bmi_warning` object from POST /workout-plans/{id}/assign/
 * (see WorkoutPlanViewSet._bmi_warning) into a Farsi sentence, or null if
 * there's nothing to say (plan has no BMI range, or the member is in it). */
export function formatBmiWarning(warning) {
  if (!warning) return null;
  if (warning.reason === "missing_data") {
    return "این عضو قد یا وزنی ثبت نکرده، بنابراین امکان بررسی BMI با محدوده ایمن این برنامه نبود.";
  }
  if (warning.reason === "below_range") {
    return `توجه: BMI این عضو (${warning.bmi}) کمتر از محدوده ایمن این برنامه (حداقل ${warning.min_bmi}) است.`;
  }
  if (warning.reason === "above_range") {
    return `توجه: BMI این عضو (${warning.bmi}) بیشتر از محدوده ایمن این برنامه (حداکثر ${warning.max_bmi}) است.`;
  }
  return null;
}
