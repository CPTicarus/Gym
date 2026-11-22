import { Link } from "react-router-dom";

import { fullName } from "../../utils/format.js";
import { ROLE_LABELS } from "../../constants/roles.js";

function initials(user) {
  const first = user.first_name?.trim()?.[0];
  const last = user.last_name?.trim()?.[0];
  if (first || last) return `${first ?? ""}${last ?? ""}`.toUpperCase();
  return user.username?.slice(0, 2).toUpperCase() ?? "؟";
}

/**
 * A single row: avatar initials, name + username, role badge, and a slot
 * (children) for whatever trailing info the page needs — a membership
 * badge on the dashboard, a membership badge + expiry date on Accounting.
 *
 * The avatar stays inline with the name/username/badges at every width
 * (via .user-row-body's flex-wrap) instead of stacking as separate
 * full-width blocks, so the row reads as one aligned unit on mobile too.
 *
 * Pass `to` to make the row a link into that user's detail page. It stays
 * optional so a context without a detail view (or without permission to
 * reach one) can still render the same row as plain markup.
 *
 * `actions` are buttons for the row (accounting's "+۳۰ روز"). They sit
 * beside the row rather than in it: a button inside a link is invalid
 * HTML, and a tap on it would open the member's page as well.
 */
export default function UserListItem({ user, to, actions, children }) {
  const name = fullName(user) || "عضو";

  const inner = (
    <>
      <div className="user-avatar">{initials(user)}</div>
      <div className="user-row-body">
        <div className="user-row-main">
          <span className="user-row-name">{name}</span>
          {user.username && <span className="user-row-sub muted ltr">{user.username}</span>}
        </div>
        <div className="user-row-end">
          <span className="badge badge-neutral">{ROLE_LABELS[user.role] ?? user.role}</span>
          {children}
        </div>
      </div>
    </>
  );

  const row = to ? (
    <Link to={to} className="user-row user-row-link">
      {inner}
    </Link>
  ) : (
    <div className="user-row">{inner}</div>
  );

  if (!actions) return row;
  return (
    <div className="user-row-with-actions">
      {row}
      <div className="user-row-actions">{actions}</div>
    </div>
  );
}
