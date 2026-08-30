import { useState } from "react";

import { createMember } from "../../api/users.js";
import Modal from "../common/Modal.jsx";

function formatApiError(data) {
  if (typeof data === "string") return data;
  const [field, value] = Object.entries(data)[0];
  const message = Array.isArray(value) ? value[0] : String(value);
  return field === "username" ? `نام کاربری: ${message}` : message;
}

export default function AddMemberModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    membership_start_date: "",
    membership_end_date: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
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
      const created = await createMember(payload);
      onCreated(created);
    } catch (err) {
      setError(err?.response?.data ? formatApiError(err.response.data) : "ساخت حساب با مشکل مواجه شد.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal title="افزودن عضو جدید" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field-row">
          <label className="field">
            <span className="label">نام</span>
            <input
              className="input"
              dir="auto"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">نام خانوادگی</span>
            <input
              className="input"
              dir="auto"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
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
              onChange={(e) => set("username", e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="label">رمز عبور</span>
            <input
              className="input"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">ایمیل</span>
            <input
              className="input"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">شماره تماس</span>
            <input
              className="input"
              dir="ltr"
              value={form.phone_number}
              onChange={(e) => set("phone_number", e.target.value)}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span className="label">شروع عضویت</span>
            <input
              className="input"
              type="date"
              dir="ltr"
              value={form.membership_start_date}
              onChange={(e) => set("membership_start_date", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="label">معتبر تا</span>
            <input
              className="input"
              type="date"
              dir="ltr"
              value={form.membership_end_date}
              onChange={(e) => set("membership_end_date", e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "در حال ساخت…" : "افزودن عضو"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
