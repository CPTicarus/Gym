import { useEffect } from "react";
import { Link } from "react-router-dom";

import { LockIcon } from "../../components/common/icons.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { formatDate } from "../../utils/format.js";
import { planLockStage } from "../../utils/planAccess.js";

// Until there's online payment, paying means the gym recording it, and
// recording it is also what opens the plans (User.extend_membership).
const HOW_TO_PAY = "برای پرداخت با باشگاه هماهنگ کنید. به محض ثبت پرداخت، برنامه‌ها همین‌جا باز می‌شوند.";

function stageContent(stage, user) {
  switch (stage) {
    case "lapsed":
      return {
        title: "عضویت شما تمام شده است",
        text: `عضویت شما در ${formatDate(user.membership_end_date)} به پایان رسید. برنامه‌هایتان سر جایشان هستند و با تمدید عضویت دوباره باز می‌شوند.`,
        hint: HOW_TO_PAY,
      };
    case "measurements":
      return {
        title: "اول اندازه‌هایتان را ثبت کنید",
        text: "مربی برنامه شما را بر اساس قد، وزن و اندازه‌های بدنتان می‌نویسد. تا این‌ها ثبت نشده، نمی‌تواند شروع کند.",
        action: { to: "/my-body", label: "ثبت اندازه‌ها", className: "btn btn-primary" },
      };
    case "preparing":
      return {
        title: "مربی در حال آماده کردن برنامه شماست",
        text: "اندازه‌های شما به دست مربی رسیده است. برنامه که آماده شد همین‌جا می‌بینید، و بعد از پرداخت باز می‌شود.",
        action: { to: "/my-body", label: "دیدن یا تکمیل اندازه‌ها", className: "btn btn-ghost btn-sm" },
      };
    case "ready":
      return {
        title: "برنامه شما آماده است",
        text: "مربی برنامه‌تان را نوشته و فقط پرداخت مانده است.",
        hint: HOW_TO_PAY,
      };
    default:
      return null;
  }
}

/**
 * What a member of a self sign-up gym sees in place of their workout,
 * diet and supplement pages until they've paid (see PlansGate). It names
 * the stage they're at and what comes next, never anything of the plan.
 */
export default function PlansLockedPage() {
  const { user, refreshProfile } = useAuth();

  // The profile can be older than the payment. If the gym has recorded one
  // since, this re-read is what opens the page, without signing out.
  useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const content = stageContent(planLockStage(user), user);
  if (!content) return null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">برنامه‌های من</h1>
        </div>
      </div>

      <section className="card plan-lock">
        <span className="plan-lock-icon">
          <LockIcon size={26} />
        </span>
        <h2 className="plan-section-title">{content.title}</h2>
        <p className="plan-lock-text">{content.text}</p>
        {content.hint && <p className="muted plan-lock-text">{content.hint}</p>}
        {content.action && (
          <Link to={content.action.to} className={content.action.className}>
            {content.action.label}
          </Link>
        )}
      </section>
    </div>
  );
}
