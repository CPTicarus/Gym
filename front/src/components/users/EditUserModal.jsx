import { useState } from "react";

import { setUserPassword, updateUser } from "../../api/users.js";
import { ROLE_LABELS } from "../../constants/roles.js";
import { GENDERS } from "../../constants/userOptions.js";
import { toEnglishDigits } from "../../utils/jalali.js";
import JalaliDateInput from "../common/JalaliDateInput.jsx";
import Modal from "../common/Modal.jsx";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const [field, value] = Object.entries(data)[0];
  const message = Array.isArray(value) ? value[0] : String(value);
  return field === "username" ? `نام کاربری: ${message}` : message;
}

// The same default the intake form uses, so "reset it for them" produces
// the password the member was given on day one rather than a third thing
// to remember. See AddUserModal.
const PASSWORD_PHONE_DIGITS = 4;

function phoneDefault(phoneNumber) {
  const digits = toEnglishDigits(phoneNumber).replace(/\D/g, "");
  return digits.length >= PASSWORD_PHONE_DIGITS ? digits.slice(-PASSWORD_PHONE_DIGITS) : "";
}

const EDITABLE_ROLES = ["member", "trainer", "admin", "accounting"];

/**
 * Staff editing someone else's account.
 *
 * The password half is a SET, never a reveal. What's stored is a one-way
 * hash, so no screen anywhere can show the current password — not to
 * accounting, not to an admin. What this can do is set a new one and keep
 * it on screen afterwards, which is what the front desk actually needs:
 * something to read out to the member standing there.
 */
export default function EditUserModal({ user, canEditRole, onClose, onSaved }) {
  const [form, setForm] = useState({
    national_id: user.national_id ?? "",
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    email: user.email ?? "",
    phone_number: user.phone_number ?? "",
    gender: user.gender ?? "",
    date_of_birth: user.date_of_birth ?? "",
    role: user.role,
    is_active: user.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const [password, setPassword] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  // The value most recently set, kept on screen so it can be read out.
  const [passwordSet, setPasswordSet] = useState(null);

  const suggestion = phoneDefault(form.phone_number);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!form.national_id.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      setError("کد ملی، نام و نام خانوادگی الزامی است.");
      return;
    }
    if (!form.phone_number.trim()) {
      setError("شماره تماس الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      // role / is_active go out only for an admin; the backend drops them
      // for accounting either way, but there's no reason to send them.
      const payload = { ...form, date_of_birth: form.date_of_birth || null };
      if (!canEditRole) {
        delete payload.role;
        delete payload.is_active;
      }
      const updated = await updateUser(user.id, payload);
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ذخیره تغییرات با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSet(null);
    if (!password) {
      setPasswordError("رمز عبور جدید را وارد کنید.");
      return;
    }
    setIsSettingPassword(true);
    try {
      await setUserPassword(user.id, password);
      setPasswordSet(password);
      setPassword("");
    } catch (err) {
      setPasswordError(
        err?.response?.data ? formatApiError(err.response.data) : "تغییر رمز عبور با مشکل مواجه شد."
      );
    } finally {
      setIsSettingPassword(false);
    }
  }

  return (
    <Modal title={`ویرایش ${ROLE_LABELS[user.role] ?? "کاربر"}`} onClose={onClose}>
      <form onSubmit={handleSaveProfile} noValidate>
        <label className="field">
          <span className="label">نام کاربری</span>
          <input className="input" dir="ltr" value={user.username} disabled />
        </label>

        <label className="field">
          <span className="label">کد ملی*</span>
          <input
            className="input"
            dir="ltr"
            inputMode="numeric"
            value={form.national_id}
            onChange={(e) => set("national_id", e.target.value)}
            required
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="label">نام*</span>
            <input
              className="input"
              dir="auto"
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
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
              required
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">ایمیل (اختیاری)</span>
            <input
              className="input"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">شماره تماس*</span>
            <input
              className="input"
              dir="ltr"
              inputMode="tel"
              value={form.phone_number}
              onChange={(e) => set("phone_number", e.target.value)}
              required
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">جنسیت (اختیاری)</span>
            <select className="select" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">—</option>
              {GENDERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">تاریخ تولد (اختیاری)</span>
            <JalaliDateInput
              value={form.date_of_birth}
              onChange={(value) => set("date_of_birth", value)}
            />
          </label>
        </div>

        {canEditRole && (
          <>
            <label className="field">
              <span className="label">نقش</span>
              <select className="select" value={form.role} onChange={(e) => set("role", e.target.value)}>
                {EDITABLE_ROLES.map((value) => (
                  <option key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </option>
                ))}
              </select>
              {form.role !== user.role && form.role !== "member" && (
                <span className="text-xs text-muted">
                  حساب کارکنان به داده اعضا دسترسی دارد — بعد از تغییر نقش، رمز عبور قوی برایش تعیین کنید.
                </span>
              )}
            </label>

            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <span>حساب فعال است</span>
            </label>
          </>
        )}

        {saved && <p className="success-text">تغییرات ذخیره شد.</p>}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "در حال ذخیره…" : "ذخیره تغییرات"}
          </button>
        </div>
      </form>

      <h3 className="section-heading">رمز عبور</h3>
      <p className="page-subtitle mb-3">
        رمز فعلی برای هیچ‌کس قابل مشاهده نیست — فقط به‌صورت رمزنگاری‌شده ذخیره می‌شود و بازگرداندنی
        نیست. در عوض می‌توانید رمز تازه‌ای تعیین کنید و همان را به کاربر بگویید.
      </p>

      <form onSubmit={handleSetPassword} noValidate>
        <label className="field">
          <span className="label">رمز عبور جدید</span>
          {/* Deliberately not type="password": whoever sets it has to be
              able to read it back to the person at the desk. */}
          <input
            className="input"
            type="text"
            dir="ltr"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {suggestion && user.role === "member" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2 self-start"
              onClick={() => setPassword(suggestion)}
            >
              چهار رقم آخر شماره تماس ({suggestion})
            </button>
          )}
        </label>

        {passwordSet && (
          <p className="success-text">
            رمز عبور جدید تعیین شد: <span className="ltr font-bold">{passwordSet}</span> — همین حالا به
            کاربر اطلاع دهید؛ بعد از بستن این پنجره دیگر نمایش داده نمی‌شود.
          </p>
        )}
        {passwordError && (
          <p className="error-text" role="alert">
            {passwordError}
          </p>
        )}

        <div className="form-actions">
          <button className="btn btn-secondary" type="submit" disabled={isSettingPassword}>
            {isSettingPassword ? "در حال تغییر…" : "تعیین رمز عبور"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
