import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { getChatUnread } from "../api/chat.js";
import { LogOutIcon, MenuIcon, MoonIcon, SunIcon, XIcon } from "../components/common/icons.jsx";
import UnreadChatIndicator, { UNREAD_CHAT_LABEL } from "../components/common/UnreadChatIndicator.jsx";
import { NAV_ITEMS } from "../constants/navigation.js";
import { ROLE_LABELS } from "../constants/roles.js";
import { ChatUnreadContext } from "../context/ChatUnreadContext.js";
import { useAppConfig } from "../hooks/useAppConfig.js";
import { useAuth } from "../hooks/useAuth.js";
import { useChatPolling } from "../hooks/useChatPolling.js";
import { useTheme } from "../hooks/useTheme.js";

// One size for every icon in the top bar — the mismatch between 20, 18
// and 16 was most of why it looked uneven.
const ICON_SIZE = 18;

export default function AppLayout() {
  const { role, user, greeting, logout } = useAuth();
  const { branding } = useAppConfig();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [unreadStatus, setUnreadStatus] = useState(null);

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const canChat = items.some((item) => item.to === "/chat");
  const userId = user?.id;
  const hasUnread = canChat && unreadStatus?.userId === userId && unreadStatus?.unread === true;
  const loadChatUnread = useCallback(async (signal) => {
    try {
      const unread = await getChatUnread(signal);
      if (!signal.aborted) setUnreadStatus({ userId, unread });
    } catch {
      // Keep the last known status until polling succeeds again.
    }
  }, [userId]);
  const refreshChatUnread = useChatPolling(loadChatUnread, canChat && userId != null);
  const chatUnreadContext = useMemo(() => ({ refreshChatUnread, isDrawerOpen }), [refreshChatUnread, isDrawerOpen]);
  const navLinkClass = ({ isActive }) => `nav-link${isActive ? " is-active" : ""}`;
  const navLinks = items.map(({ to, label, Icon }) => (
    <NavLink key={to} to={to} className={navLinkClass} onClick={() => setIsDrawerOpen(false)}>
      <Icon size={18} />
      <span>{label}</span>
      {to === "/chat" && hasUnread && <UnreadChatIndicator className="ms-auto" />}
    </NavLink>
  ));

  // Close the drawer whenever the route changes (e.g. after tapping a link).
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Close the drawer on Escape or when the desktop sidebar takes over.
  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    const desktop = window.matchMedia("(min-width: 860px)");
    function handleKeyDown(e) {
      if (e.key === "Escape") setIsDrawerOpen(false);
    }
    function closeOnDesktop(event) {
      if (event.matches) setIsDrawerOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop(desktop);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [isDrawerOpen]);

  return (
    <div className="app-shell">
      {/* Desktop sidebar — always visible at the desktop breakpoint, hidden on mobile */}
      <aside className="sidebar">
        <span className="brand-mark">{branding.name}</span>
        <nav className="nav">
          {navLinks}
        </nav>
        <div className="sidebar-footer muted">بخش‌های بیشتر به‌مرور تکمیل می‌شوند.</div>
      </aside>

      <div className="main">
        {/* Every control here is the same 36px square and every icon the
            same 18px, so the bar reads as one row rather than four
            differently-sized things. The only text is the greeting. */}
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="icon-btn topbar-menu-btn relative"
              onClick={() => setIsDrawerOpen(true)}
              aria-label={hasUnread ? `باز کردن منو، ${UNREAD_CHAT_LABEL}` : "باز کردن منو"}
              aria-expanded={isDrawerOpen}
            >
              <MenuIcon size={ICON_SIZE} />
              {hasUnread && <UnreadChatIndicator className="absolute end-0.5 top-0.5" />}
            </button>
            <span className="brand-mark topbar-brand">{branding.name}</span>
          </div>

          <div className="user-chip">
            <span className="user-name">{greeting}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره"}
              title={theme === "dark" ? "حالت روشن" : "حالت تیره"}
            >
              {theme === "dark" ? <SunIcon size={ICON_SIZE} /> : <MoonIcon size={ICON_SIZE} />}
            </button>
            <button type="button" className="icon-btn" onClick={logout} aria-label="خروج" title="خروج">
              <LogOutIcon size={ICON_SIZE} />
            </button>
          </div>
        </header>

        <main className="content">
          <ChatUnreadContext.Provider value={chatUnreadContext}>
            <Outlet />
          </ChatUnreadContext.Provider>
        </main>
      </div>

      {/* Mobile drawer — only rendered while open; hidden entirely on desktop via CSS */}
      {isDrawerOpen && (
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <nav className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="brand-mark">{branding.name}</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="بستن منو"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="nav">
              {navLinks}
            </div>

            <div className="drawer-footer">
              <span className="badge badge-role">{ROLE_LABELS[role] ?? role}</span>
              <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={logout}>
                <LogOutIcon size={16} />
                <span>خروج</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
