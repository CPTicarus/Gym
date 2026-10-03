import { toPersianDigits } from "./jalali.js";

// How many plan names a "can't delete" message lists before summarising.
const MAX_PLANS_NAMED = 5;

/**
 * Why a library item can't be deleted: the plans still using it, named so
 * the trainer knows where to take it out first. Shared by the food and the
 * move libraries, whose APIs both refuse with a 409 listing `plans`.
 *
 * `subject` is the item as the sentence starts: "این خوراکی", "این حرکت".
 */
export function inUseMessage(subject, plans) {
  const named = plans.slice(0, MAX_PLANS_NAMED).map((name) => `«${name}»`).join("، ");
  const rest = plans.length - MAX_PLANS_NAMED;
  const list = rest > 0 ? `${named} و ${toPersianDigits(rest)} برنامه دیگر` : named;
  const [noun, these] = plans.length === 1 ? ["برنامه", "این برنامه"] : ["برنامه‌های", "این برنامه‌ها"];
  return `${subject} در ${noun} ${list} استفاده شده و قابل حذف نیست. اول آن را از ${these} بردارید.`;
}
