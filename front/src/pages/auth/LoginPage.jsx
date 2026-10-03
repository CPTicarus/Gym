import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import AuthShell from "../../components/auth/AuthShell.jsx";
import PasswordInput from "../../components/common/PasswordInput.jsx";
import { getRoleHome } from "../../constants/navigation.js";
import { useAppConfig } from "../../hooks/useAppConfig.js";
import { useAuth } from "../../hooks/useAuth.js";

export default function LoginPage() {
  const { login, isAuthenticated, role } = useAuth();
  const { isSelfSignup } = useAppConfig();
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
    <AuthShell>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="form-title">ورود</h1>
        {/* Only a staff-managed gym can say who made the account. Where
            people sign themselves up, the desk may still have made some. */}
        <p className="form-subtitle">
          {isSelfSignup
            ? "با نام کاربری و رمز عبورتان وارد شوید."
            : "با حساب کاربری‌ای که باشگاه برایتان ساخته وارد شوید."}
        </p>

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
          <PasswordInput
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

        {isSelfSignup && (
          <p className="auth-switch">
            حساب ندارید؟ <Link to="/signup">ثبت‌نام کنید</Link>
          </p>
        )}
      </form>
    </AuthShell>
  );
}
