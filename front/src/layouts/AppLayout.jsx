import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { LogOutIcon, MenuIcon, MoonIcon, SunIcon, XIcon } from "../components/common/icons.jsx";
import { BRAND_NAME } from "../config/brand.js";
import { NAV_ITEMS } from "../constants/navigation.js";
import { ROLE_LABELS } from "../constants/roles.js";
import { useAuth } from "../hooks/useAuth.js";
import { useTheme } from "../hooks/useTheme.js";

export default function AppLayout() {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const navLinkClass = ({ isActive }) => `nav-link${isActive ? " is-active" : ""}`;

  // Close the drawer whenever the route changes (e.g. after tapping a link).
  useEffect(() => {
    setIsDrawerOpen(false);
  }, [location.pathname]);

  // Let Escape close the drawer too.
  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    function handleKeyDown(e) {
      if (e.key === "Escape") setIsDrawerOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  return (
    <div className="app-shell">
      {/* Desktop sidebar — always visible at the desktop breakpoint, hidden on mobile */}
      <aside className="sidebar">
        <span className="brand-mark">{BRAND_NAME}</span>
        <nav className="nav">
          {items.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer muted">بخش‌های بیشتر به‌مرور تکمیل می‌شوند.</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-start">
            <button
              type="button"
              className="icon-btn topbar-menu-btn"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="باز کردن منو"
            >
              <MenuIcon size={20} />
            </button>
            <span className="brand-mark topbar-brand">{BRAND_NAME}</span>
          </div>

          <div className="user-chip">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره"}
              title={theme === "dark" ? "حالت روشن" : "حالت تیره"}
            >
              {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
            <div className="topbar-secondary">
              <span className="user-name">{user?.first_name || user?.username || "…"}</span>
              <span className="badge badge-role">{ROLE_LABELS[role] ?? role}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
                <LogOutIcon size={16} />
                <span className="btn-label">خروج</span>
              </button>
            </div>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer — only rendered while open; hidden entirely on desktop via CSS */}
      {isDrawerOpen && (
        <div className="drawer-backdrop" onClick={() => setIsDrawerOpen(false)}>
          <nav className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="brand-mark">{BRAND_NAME}</span>
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
              {items.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} className={navLinkClass}>
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
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
