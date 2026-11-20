import { MoonIcon, SunIcon } from "../common/icons.jsx";
import Marquee from "../common/Marquee.jsx";
import { useAppConfig } from "../../hooks/useAppConfig.js";
import { useTheme } from "../../hooks/useTheme.js";

/**
 * The screen every signed-out page sits on: the gym's brand on one side
 * (on top, on a phone) and the page's form on the other. Shared by login
 * and sign-up so the two can't drift into looking like different apps.
 */
export default function AuthShell({ children }) {
  const { theme, toggleTheme } = useTheme();
  const { branding } = useAppConfig();

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-header">
            <span className="brand-mark brand-mark-lg">{branding.name}</span>
            <button
              type="button"
              className="icon-btn icon-btn-inverse"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "فعال‌سازی حالت روشن" : "فعال‌سازی حالت تیره"}
              title={theme === "dark" ? "حالت روشن" : "حالت تیره"}
            >
              {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
          </div>
          {branding.tagline && <p className="auth-tagline">{branding.tagline}</p>}
          <div className="auth-rule" />
          {branding.note && <p className="auth-note">{branding.note}</p>}
        </div>

        <Marquee items={branding.ticker} duration="10s" className="auth-marquee" />
      </div>

      <div className="auth-form-panel">{children}</div>
    </div>
  );
}
