// Body-composition ratio bands.
//
// Only ONE of the three below is sex-specific, which is worth stating
// because the asymmetry looks like an oversight otherwise:
//
//   BMI   NOT sex-specific. WHO uses 18.5 / 25 / 30 for adult men and
//         women alike. (Body-fat percentage genuinely differs between
//         them at the same BMI — the CUT-OFFS still don't.)
//   WHR   IS sex-specific. WHO 2008 expert consultation puts increased
//         risk at 0.90 for men and 0.85 for women.
//   WHtR  NOT sex-specific. NICE NG246 applies 0.4-0.49 / 0.5-0.59 / 0.6+
//         to both sexes and all ethnicities — avoiding sex- and
//         ethnicity-specific boundaries is the point of the measure.
//
// Practical consequence: WHtR is the only one of the three that still
// says something for a member who hasn't recorded a gender.

// WHO adult BMI categories — used to label a computed BMI value consistently
// wherever it's shown (profile, staff user detail, plan assignment).
export function getBmiCategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return { label: "کم‌وزن", variant: "accent" };
  if (bmi < 25) return { label: "طبیعی", variant: "success" };
  if (bmi < 30) return { label: "اضافه‌وزن", variant: "accent" };
  return { label: "چاق", variant: "danger" };
}

/**
 * WHO waist-to-hip ratio risk bands (2008 expert consultation). These
 * DO differ by sex, so without a recorded gender the ratio is shown
 * without a verdict rather than judged against the wrong scale.
 */
export function getWhrCategory(whr, gender) {
  if (whr == null || !gender) return null;
  const thresholds = gender === "female" ? [0.8, 0.85] : [0.9, 1.0];
  if (whr < thresholds[0]) return { label: "کم‌خطر", variant: "success" };
  if (whr < thresholds[1]) return { label: "خطر متوسط", variant: "accent" };
  return { label: "پرخطر", variant: "danger" };
}

/**
 * NICE NG246 waist-to-height bands. Deliberately takes no gender: the
 * same boundaries apply to both sexes and all ethnicities, which is what
 * makes this the usable ratio when gender is unknown.
 *
 * Below 0.4 sits outside NICE's table — reported as its own band rather
 * than being called healthy, since the guideline doesn't say it is.
 */
export function getWhtrCategory(whtr) {
  if (whtr == null) return null;
  if (whtr < 0.4) return { label: "کمتر از حد معمول", variant: "accent" };
  if (whtr < 0.5) return { label: "سالم", variant: "success" };
  if (whtr < 0.6) return { label: "افزایش‌یافته", variant: "accent" };
  return { label: "بالا", variant: "danger" };
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
