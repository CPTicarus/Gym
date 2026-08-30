import { useRef } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

function isoToLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localDateToIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * A Jalali (Shamsi) calendar popover. `value`/`onChange` are plain
 * Gregorian "YYYY-MM-DD" strings (or "") — the same shape `<input
 * type="date">` used — so this drops in wherever that did and every
 * consumer keeps working with Gregorian ISO dates; the library only owns
 * the Persian-calendar display and picking.
 */
export default function JalaliDateInput({ value, onChange, disabled }) {
  const pickerRef = useRef(null);

  return (
    <div className="jalali-date-input">
      <DatePicker
        ref={pickerRef}
        calendar={persian}
        locale={persian_fa}
        value={isoToLocalDate(value)}
        onChange={(dateObject) => {
          onChange(dateObject ? localDateToIso(dateObject.toDate()) : "");
          setTimeout(() => pickerRef.current?.closeCalendar(), 0);
        }}
        placeholder="انتخاب تاریخ"
        disabled={disabled}
        editable={false}
        inputMode="none"
        onOpenPickNewDate={false}
        inputClass="input"
        containerClassName="jalali-date-input-trigger"
        calendarPosition="bottom-right"
      />
      {/* Optional fields (membership dates can be unset) need a way back to
          empty — the picker itself has no such affordance once a date is set. */}
      {value && !disabled && (
        <button type="button" className="jalali-date-clear" aria-label="پاک کردن تاریخ" onClick={() => onChange("")}>
          ×
        </button>
      )}
    </div>
  );
}
