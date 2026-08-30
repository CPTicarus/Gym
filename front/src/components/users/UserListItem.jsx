import { Link } from "react-router-dom";

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
 * Pass `to` to make the row a link into that user's detail page. It stays
 * optional so a context without a detail view (or without permission to
 * reach one) can still render the same row as plain markup.
 */
export default function UserListItem({ user, to, children }) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username;

  const inner = (
    <>
      <div className="user-avatar">{initials(user)}</div>
      <div className="user-row-main">
        <span className="user-row-name">{fullName}</span>
        <span className="user-row-sub muted ltr">{user.username}</span>
      </div>
      <div className="user-row-end">
        <span className="badge badge-neutral">{ROLE_LABELS[user.role] ?? user.role}</span>
        {children}
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="user-row user-row-link">
        {inner}
      </Link>
    );
  }

  return <div className="user-row">{inner}</div>;
}
