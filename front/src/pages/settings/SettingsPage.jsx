import { useState } from "react";

import { ROLE_LABELS } from "../../constants/roles.js";
import { useAuth } from "../../hooks/useAuth.js";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first);
}

export default function SettingsPage() {
  const { user, role, updateProfile } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedMessage, setSavedMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSavedMessage(null);
    setIsSaving(true);
    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        email,
        phone_number: phoneNumber,
      });
      setSavedMessage("تغییرات ذخیره شد.");
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ذخیره تغییرات با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="form-page">
      <h1 className="page-title">تنظیمات حساب</h1>
      <p className="page-subtitle">اطلاعات شخصی خود را مشاهده و ویرایش کنید.</p>

      <form className="card form-card" onSubmit={handleSubmit} noValidate>
        <div className="field-row">
          <label className="field">
            <span className="label">نام کاربری</span>
            <input className="input" dir="ltr" value={user?.username ?? ""} disabled />
          </label>
          <label className="field">
            <span className="label">نقش</span>
            <input className="input" value={ROLE_LABELS[role] ?? role ?? ""} disabled />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">نام</span>
            <input className="input" dir="auto" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">نام خانوادگی</span>
            <input className="input" dir="auto" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span className="label">ایمیل</span>
          <input className="input" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label className="field">
          <span className="label">شماره تماس</span>
          <input className="input" dir="ltr" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
        </label>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {savedMessage && <p className="success-text">{savedMessage}</p>}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "در حال ذخیره…" : "ذخیره تغییرات"}
          </button>
        </div>
      </form>
    </div>
  );
}
