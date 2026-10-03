import { MoonIcon, SunIcon } from "../common/icons.jsx";
import Marquee from "../common/Marquee.jsx";
import { BRAND_NAME, BRAND_NOTE, BRAND_TAGLINE, BRAND_TICKER } from "../../config/brand.js";
import { useTheme } from "../../hooks/useTheme.js";

/**
 * The screen every signed-out page sits on: the gym's brand on one side
 * (on top, on a phone) and the page's form on the other. Shared by login
 * and sign-up so the two can't drift into looking like different apps.
 */
export default function AuthShell({ children }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-header">
            <span className="brand-mark brand-mark-lg">{BRAND_NAME}</span>
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
          <p className="auth-tagline">{BRAND_TAGLINE}</p>
          <div className="auth-rule" />
          <p className="auth-note">{BRAND_NOTE}</p>
        </div>

        <Marquee items={BRAND_TICKER} duration="10s" className="auth-marquee" />
      </div>

      <div className="auth-form-panel">{children}</div>
    </div>
  );
}
