import { useState } from "react";

import { changeMyPassword } from "../../api/auth.js";
import { toPersianDigits } from "../../utils/jalali.js";
import PasswordInput from "../common/PasswordInput.jsx";

/**
 * The server's messages for a refused new password, in Persian. They come
 * from apps/accounts/passwords.py (members) and Django's own validators
 * (staff), so the likely ones are known; anything else is shown as sent
 * rather than swallowed.
 */
function newPasswordMessage(message) {
  const minimum = message.match(/at least (\d+)/)?.[1];
  if (minimum) return `رمز عبور باید دست‌کم ${toPersianDigits(minimum)} کاراکتر باشد.`;
  if (message.includes("same as the current")) return "رمز جدید با رمز فعلی یکی است.";
  if (message.includes("too common")) return "این رمز عبور خیلی رایج است؛ رمز دیگری انتخاب کنید.";
  if (message.includes("entirely numeric")) return "رمز عبور نمی‌تواند فقط عدد باشد.";
  if (message.includes("too similar")) return "رمز عبور خیلی شبیه اطلاعات حساب شماست.";
  return `رمز عبور جدید پذیرفته نشد: ${message}`;
}

function errorMessage(err) {
  if (err?.response?.status === 429) return "تعداد تلاش‌ها زیاد شد؛ کمی بعد دوباره امتحان کنید.";
  const data = err?.response?.data;
  if (data?.current_password) return "رمز عبور فعلی درست نیست.";
  if (data?.password?.[0]) return newPasswordMessage(String(data.password[0]));
  return "تغییر رمز عبور با مشکل مواجه شد.";
}

/**
 * Change your own password. Asks for the current one first (the server
 * checks it), so an unlocked phone left on a bench isn't enough to take
 * the account over. Which rules the new one must meet depend on the role —
 * a member may use a short PIN — so those are left to the server to judge.
 */
export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isDone, setIsDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsDone(false);
    if (!currentPassword || !password) {
      setError("رمز فعلی و رمز جدید را وارد کنید.");
      return;
    }
    if (password !== confirmation) {
      setError("تکرار رمز جدید با خود آن یکی نیست.");
      return;
    }
    setIsSaving(true);
    try {
      await changeMyPassword(currentPassword, password);
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setIsDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="card form-card mt-4" onSubmit={handleSubmit} noValidate>
      <h2 className="plan-section-title">تغییر رمز عبور</h2>
      <p className="muted plan-section-hint">برای امنیت حساب، اول رمز فعلی‌تان را وارد کنید.</p>

      <label className="field">
        <span className="label">رمز عبور فعلی</span>
        <PasswordInput
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="label">رمز عبور جدید</span>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span className="label">تکرار رمز جدید</span>
          <PasswordInput
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {isDone && <p className="success-text">رمز عبور تغییر کرد. دفعه بعد با رمز جدید وارد شوید.</p>}

      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={isSaving}>
          {isSaving ? "در حال تغییر…" : "تغییر رمز عبور"}
        </button>
      </div>
    </form>
  );
}
