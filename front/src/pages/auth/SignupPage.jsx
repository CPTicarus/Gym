import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { listSignupTrainers, registerRequest } from "../../api/auth.js";
import AuthShell from "../../components/auth/AuthShell.jsx";
import JalaliDateInput from "../../components/common/JalaliDateInput.jsx";
import PasswordInput from "../../components/common/PasswordInput.jsx";
import { getRoleHome } from "../../constants/navigation.js";
import { GENDERS } from "../../constants/userOptions.js";
import { useAppConfig } from "../../hooks/useAppConfig.js";
import { useAuth } from "../../hooks/useAuth.js";
import { trainerName } from "../../utils/format.js";
import { toEnglishDigits } from "../../utils/jalali.js";

// The server names a problem field only by its key; this is what the
// person filling the form calls it.
const FIELD_LABELS = {
  first_name: "نام",
  last_name: "نام خانوادگی",
  national_id: "کد ملی",
  phone_number: "شماره تماس",
  email: "ایمیل",
  gender: "جنسیت",
  date_of_birth: "تاریخ تولد",
  username: "نام کاربری",
  password: "رمز عبور",
  password_confirm: "تکرار رمز عبور",
};

function formatApiError(data) {
  if (typeof data === "string") return data;
  const [field, value] = Object.entries(data)[0];
  const message = Array.isArray(value) ? value[0] : String(value);
  return FIELD_LABELS[field] ? `${FIELD_LABELS[field]}: ${message}` : message;
}

// The username starts out as the national ID, which is what a front-desk
// account gets too (see AddUserModal), so every member signs in the same
// way. It stays an ordinary field: once the person types in it, it's theirs.
function derivedUsername(nationalId) {
  return toEnglishDigits(nationalId).replace(/\D/g, "");
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Self sign-up, in a gym set up for it (MEMBER_SIGNUP=self). Anywhere else
 * this page sends people to the login screen, and the server refuses the
 * request in any case.
 *
 * A new account lands on "my body", since measurements are what the
 * trainer writes the plan from.
 */
export default function SignupPage() {
  const { login, isAuthenticated, role } = useAuth();
  const { isSelfSignup, isLoaded } = useAppConfig();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    national_id: "",
    phone_number: "",
    email: "",
    gender: "",
    date_of_birth: "",
    username: "",
    password: "",
    password_confirm: "",
    trainer_id: "",
  });
  const [isUsernameTouched, setIsUsernameTouched] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trainers, setTrainers] = useState(null);
  const [trainerListError, setTrainerListError] = useState(false);
  const [trainerLoadAttempt, setTrainerLoadAttempt] = useState(0);

  useEffect(() => {
    if (!isLoaded || !isSelfSignup || isAuthenticated) return;
    const controller = new AbortController();
    listSignupTrainers(controller.signal).then(setTrainers).catch(() => {
      if (!controller.signal.aborted) {
        setTrainers([]);
        setTrainerListError(true);
      }
    });
    return () => controller.abort();
  }, [isLoaded, isSelfSignup, isAuthenticated, trainerLoadAttempt]);

  function reloadTrainers() {
    setTrainers(null);
    setTrainerListError(false);
    setTrainerLoadAttempt((attempt) => attempt + 1);
  }

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setNationalId(value) {
    setForm((prev) => ({
      ...prev,
      national_id: value,
      username: isUsernameTouched ? prev.username : derivedUsername(value),
    }));
  }

  function setUsername(value) {
    setIsUsernameTouched(true);
    set("username", value);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (trainers === null) return;
    setError(null);
    if (!form.first_name.trim() || !form.last_name.trim() || !form.national_id.trim()) {
      setError("نام، نام خانوادگی و کد ملی الزامی است.");
      return;
    }
    if (!form.phone_number.trim()) {
      setError("شماره تماس الزامی است.");
      return;
    }
    if (!form.gender || !form.date_of_birth) {
      setError("جنسیت و تاریخ تولد الزامی است — مربی برنامه را بر اساس سن و جنسیت شما می‌نویسد.");
      return;
    }
    // The calendar opens on today, so this is the likeliest slip.
    if (form.date_of_birth >= todayIso()) {
      setError("تاریخ تولد را درست انتخاب کنید — امروز یا بعد از آن نمی‌شود.");
      return;
    }
    if (!form.username.trim() || !form.password) {
      setError("نام کاربری و رمز عبور الزامی است.");
      return;
    }
    if (form.password !== form.password_confirm) {
      setError("رمز عبور و تکرار آن یکی نیستند.");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      ...form,
      username: form.username.trim(),
      trainer_id: form.trainer_id ? Number(form.trainer_id) : null,
    };
    try {
      await registerRequest(payload);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        setError("ثبت‌نام‌های زیادی از این شبکه انجام شده — کمی بعد دوباره امتحان کنید.");
      } else if (status === 403) {
        setError("ثبت‌نام در این باشگاه بسته است. برای ساخت حساب با باشگاه تماس بگیرید.");
      } else if (err?.response?.data?.trainer_id) {
        set("trainer_id", "");
        reloadTrainers();
        setError("مربی انتخاب‌شده دیگر در دسترس نیست. مربی دیگری انتخاب کنید یا انتخاب را به باشگاه بسپارید.");
      } else if (err?.response?.data) {
        setError(formatApiError(err.response.data));
      } else {
        setError("مشکلی در ثبت‌نام پیش آمد — اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.");
      }
      setIsSubmitting(false);
      return;
    }

    // The account exists from here on, so a failure now must not read as
    // a failed sign-up: sending the form again would only be told the
    // username is taken.
    try {
      await login(payload.username, payload.password);
    } catch {
      setError("حساب شما ساخته شد، اما ورود خودکار انجام نشد. از صفحه ورود وارد شوید.");
      setIsSubmitting(false);
      return;
    }
    // The button that got us here is at the bottom of a long form, and a
    // route change keeps the scroll position, which would leave the
    // welcome note at the top of the next page out of sight.
    window.scrollTo(0, 0);
    navigate("/my-body", { replace: true });
  }

  // Not while submitting: signing up ends in a sign-in, and that moment
  // belongs to handleSubmit's own navigation, not a bounce to the role's
  // home page.
  if (isAuthenticated && !isSubmitting) {
    return <Navigate to={getRoleHome(role)} replace />;
  }
  if (!isLoaded) {
    return <div className="page-loading">در حال بارگذاری…</div>;
  }
  if (!isSelfSignup) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h1 className="form-title">ثبت‌نام</h1>
        <p className="form-subtitle">
          حساب بسازید و اندازه‌های بدنتان را ثبت کنید تا مربی برنامه‌تان را بنویسد. برنامه بعد از پرداخت
          باز می‌شود.
        </p>

        <label className="field">
          <span className="label">انتخاب مربی</span>
          <select
            className="select"
            value={form.trainer_id}
            onChange={(e) => set("trainer_id", e.target.value)}
            disabled={trainers === null || isSubmitting}
          >
            <option value="">انتخاب مربی را به باشگاه می‌سپارم</option>
            {trainers?.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>{trainerName(trainer)}</option>
            ))}
          </select>
          {trainers === null && <span className="text-xs text-muted">در حال بارگذاری مربیان…</span>}
          {!trainerListError && trainers?.length === 0 && (
            <span className="text-xs text-muted">در حال حاضر مربی فعالی برای انتخاب وجود ندارد.</span>
          )}
          {!form.trainer_id && (
            <span className="text-xs text-muted">اگر انتخاب را به باشگاه بسپارید، مربیان نام شما را برای پذیرش می‌بینند.</span>
          )}
        </label>
        {trainerListError && (
          <div>
            <p className="error-text" role="alert">فهرست مربیان بارگذاری نشد.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={reloadTrainers}>تلاش دوباره</button>
          </div>
        )}

        <div className="field-row">
          <label className="field">
            <span className="label">نام*</span>
            <input
              className="input"
              dir="auto"
              autoComplete="given-name"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="label">نام خانوادگی*</span>
            <input
              className="input"
              dir="auto"
              autoComplete="family-name"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              required
            />
          </label>
        </div>

        <label className="field">
          <span className="label">کد ملی*</span>
          <input
            className="input"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder="012346789"
            value={form.national_id}
            onChange={(e) => setNationalId(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="label">شماره تماس*</span>
          <input
            className="input"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            value={form.phone_number}
            onChange={(e) => set("phone_number", e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="label">ایمیل (اختیاری)</span>
          <input
            className="input"
            type="email"
            dir="ltr"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </label>

        {/* Required here, unlike at the front desk: the trainer writes the
            plan around age and sex, and nobody else will ask for them. */}
        <div className="field-row">
          <label className="field">
            <span className="label">جنسیت*</span>
            <select
              className="select"
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              required
            >
              <option value="">— انتخاب کنید —</option>
              {GENDERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">تاریخ تولد*</span>
            <JalaliDateInput value={form.date_of_birth} onChange={(value) => set("date_of_birth", value)} />
          </label>
        </div>

        <label className="field">
          <span className="label">نام کاربری*</span>
          <input
            className="input"
            dir="ltr"
            autoComplete="username"
            value={form.username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="label">رمز عبور*</span>
          <PasswordInput
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="label">تکرار رمز عبور*</span>
          <PasswordInput
            autoComplete="new-password"
            value={form.password_confirm}
            onChange={(e) => set("password_confirm", e.target.value)}
            required
          />
        </label>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={isSubmitting || trainers === null}>
          {isSubmitting ? "در حال ثبت‌نام…" : "ثبت‌نام"}
        </button>

        <p className="auth-switch">
          حساب دارید؟ <Link to="/login">وارد شوید</Link>
        </p>
      </form>
    </AuthShell>
  );
}
