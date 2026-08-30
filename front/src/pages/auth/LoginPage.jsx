import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { MoonIcon, SunIcon } from "../../components/common/icons.jsx";
import { BRAND_NAME, BRAND_NOTE, BRAND_TAGLINE } from "../../config/brand.js";
import { getRoleHome } from "../../constants/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useTheme } from "../../hooks/useTheme.js";

export default function LoginPage() {
  const { login, isAuthenticated, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in (e.g. came back to /login with a live session) — move on.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(location.state?.from?.pathname ?? getRoleHome(role), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const profile = await login(username, password);
      navigate(location.state?.from?.pathname ?? getRoleHome(profile.role), { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 401
          ? "نام کاربری یا رمز عبور اشتباه است."
          : "مشکلی در ورود پیش آمد — اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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
      </div>

      <div className="auth-form-panel">
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <h1 className="form-title">ورود</h1>
          <p className="form-subtitle">با حساب کاربری‌ای که باشگاه برایتان ساخته وارد شوید.</p>

          <label className="field">
            <span className="label">نام کاربری</span>
            <input
              className="input"
              type="text"
              dir="ltr"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="label">رمز عبور</span>
            <input
              className="input"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "در حال ورود…" : "ورود"}
          </button>
        </form>
      </div>
    </div>
  );
}
