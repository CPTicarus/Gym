import { useState } from "react";

import { createUser } from "../../api/users.js";
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

function isoFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// New members are overwhelmingly month-long memberships starting today —
// prefilling that saves the front desk two taps on the common case, and
// both fields stay editable for the exceptions.
const MEMBERSHIP_LENGTH_DAYS = 30;

// Only an admin ever sees this picker; accounting creates members and
// nothing else, so for them the modal stays exactly as it was.
const STAFF_CREATABLE_ROLES = ["member", "trainer", "admin", "accounting"];

// Nobody at a front desk wants to invent a username and a password for
// every walk-in, so both are derived from details they're already typing:
// the national ID becomes the username, and the last four digits of the
// phone become the password. Both stay ordinary editable inputs — this
// only fills them, and stops the moment the operator types in one
// themselves (see `touched` below).
const PASSWORD_PHONE_DIGITS = 4;

function derivedUsername(nationalId) {
  return toEnglishDigits(nationalId).replace(/\D/g, "");
}

function derivedPassword(phoneNumber) {
  const digits = toEnglishDigits(phoneNumber).replace(/\D/g, "");
  return digits.length >= PASSWORD_PHONE_DIGITS ? digits.slice(-PASSWORD_PHONE_DIGITS) : "";
}

function defaultMembershipDates() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + MEMBERSHIP_LENGTH_DAYS);
  return { membership_start_date: isoFromDate(start), membership_end_date: isoFromDate(end) };
}

export default function AddUserModal({ canCreateStaff, onClose, onCreated }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "member",
    national_id: "",
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    gender: "",
    date_of_birth: "",
    ...defaultMembershipDates(),
  });
  // Which of the two derived fields the operator has taken over. Once a
  // field is touched it's theirs, and later edits to the national ID or
  // phone stop overwriting it.
  const [touched, setTouched] = useState({ username: false, password: false });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const isMember = form.role === "member";

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setNationalId(value) {
    setForm((prev) => ({
      ...prev,
      national_id: value,
      username: touched.username ? prev.username : derivedUsername(value),
    }));
  }

  function setPhoneNumber(value) {
    setForm((prev) => ({
      ...prev,
      phone_number: value,
      // Staff passwords must clear the full validators, which four digits
      // never will — so this shortcut is for members only, and picking a
      // staff role below clears whatever it had already filled in.
      password: touched.password || prev.role !== "member" ? prev.password : derivedPassword(value),
    }));
  }

  function setRole(value) {
    setForm((prev) => {
      // A password the operator typed is theirs; leave it alone.
      if (touched.password) return { ...prev, role: value };
      // Otherwise refill it for a member, and clear it for a staff role —
      // four digits would only be bounced by the staff validators, and an
      // auto-filled value that can't be submitted is worse than an empty one.
      return {
        ...prev,
        role: value,
        password: value === "member" ? derivedPassword(prev.phone_number) : "",
      };
    });
  }

  function setDerived(field, value) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    set(field, value);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.national_id.trim() || !form.first_name.trim() || !form.last_name.trim()) {
      setError("کد ملی، نام و نام خانوادگی الزامی است.");
      return;
    }
    if (!form.phone_number.trim()) {
      setError("شماره تماس الزامی است.");
      return;
    }
    if (!form.username.trim() || !form.password) {
      setError("نام کاربری و رمز عبور الزامی است.");
      return;
    }
    setIsSaving(true);
    try {
      // Blank dates must be omitted, not sent as "" — DRF rejects empty
      // strings for nullable date fields.
      const payload = { ...form };
      if (!payload.membership_start_date) delete payload.membership_start_date;
      if (!payload.membership_end_date) delete payload.membership_end_date;
      if (!payload.date_of_birth) delete payload.date_of_birth;
      // A membership window means nothing for a trainer or an admin; the
      // backend drops them anyway, but there's no reason to send them.
      if (!isMember) {
        delete payload.membership_start_date;
        delete payload.membership_end_date;
      }
      const created = await createUser(payload);
      onCreated(created);
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ساخت حساب با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title={isMember ? "افزودن عضو جدید" : `افزودن ${ROLE_LABELS[form.role]} جدید`} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {canCreateStaff && (
          <label className="field">
            <span className="label">نقش</span>
            <select className="select" value={form.role} onChange={(e) => setRole(e.target.value)}>
              {STAFF_CREATABLE_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span className="label">کد ملی*</span>
          <input
            className="input"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={form.national_id}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder="۱۰ رقم"
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
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">نام کاربری</span>
            <input
              className="input"
              dir="ltr"
              autoComplete="off"
              value={form.username}
              onChange={(e) => setDerived("username", e.target.value)}
              required
            />
            <span className="text-xs text-muted">
              {touched.username ? "به‌صورت دستی وارد شده." : "از کد ملی پر می‌شود — قابل تغییر است."}
            </span>
          </label>
          <label className="field">
            <span className="label">رمز عبور</span>
            <input
              className="input"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setDerived("password", e.target.value)}
              required
            />
            <span className="text-xs text-muted">
              {!isMember
                ? "حداقل ۸ کاراکتر؛ نباید فقط عدد باشد."
                : touched.password
                  ? "به‌صورت دستی وارد شده."
                  : "چهار رقم آخر شماره تماس — قابل تغییر است."}
            </span>
          </label>
        </div>

        {/* Optional, but worth capturing at intake while the person is
            standing there — chasing it later never happens. */}
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

        {/* A membership window is a member concept — staff don't have one. */}
        {isMember && (
          <div className="field-row">
            <label className="field">
              <span className="label">شروع عضویت</span>
              <JalaliDateInput
                value={form.membership_start_date}
                onChange={(value) => set("membership_start_date", value)}
              />
            </label>
            <label className="field">
              <span className="label">معتبر تا</span>
              <JalaliDateInput
                value={form.membership_end_date}
                onChange={(value) => set("membership_end_date", value)}
              />
            </label>
          </div>
        )}

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "در حال ساخت…" : isMember ? "افزودن عضو" : `افزودن ${ROLE_LABELS[form.role]}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
