import { useState } from "react";

import { extendMembership } from "../../api/users.js";
import { formatDate, fullName } from "../../utils/format.js";
import { toPersianDigits } from "../../utils/jalali.js";

export const EXTEND_DAYS = 30;

/**
 * "+۳۰ روز": a month more on a member's membership, for when they've paid.
 *
 * It asks first, because this is money, and the question says where the
 * days will count from — after the current end date while the membership
 * is running, from today once it has lapsed. That rule is the server's
 * (User.extend_membership); the question only reads is_membership_active,
 * and the new end date reported afterwards is the one the server saved,
 * not a prediction. Disabled while the request is out, so a double-click
 * can't add two months.
 *
 * `onExtended(updatedUser)` on success; `onError(message)` on failure.
 */
export default function ExtendMembershipButton({ member, onExtended, onError }) {
  const [isBusy, setIsBusy] = useState(false);
  const days = toPersianDigits(EXTEND_DAYS);

  async function handleClick() {
    const name = fullName(member);
    const question = member.is_membership_active
      ? `${days} روز به عضویت «${name}» اضافه شود؟\nاز پایان فعلی (${formatDate(member.membership_end_date)}) حساب می‌شود.`
      : `عضویت «${name}» فعال نیست؛ ${days} روز از امروز حساب می‌شود.\nادامه می‌دهید؟`;
    if (!window.confirm(question)) return;

    setIsBusy(true);
    try {
      onExtended(await extendMembership(member.id, EXTEND_DAYS));
    } catch {
      onError("تمدید عضویت با مشکل مواجه شد.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={handleClick}
      disabled={isBusy}
      aria-label={`افزودن ${days} روز به عضویت ${fullName(member)}`}
    >
      {isBusy ? "در حال تمدید…" : `+ ${days} روز`}
    </button>
  );
}

/** The line to show once it's done: how long, and until when. */
export function extendedMessage(updated) {
  return `${toPersianDigits(EXTEND_DAYS)} روز اضافه شد — عضویت «${fullName(updated)}» تا ${formatDate(
    updated.membership_end_date
  )} معتبر است.`;
}
