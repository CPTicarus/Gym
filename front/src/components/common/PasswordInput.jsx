import { useState } from "react";

import { EyeIcon, EyeOffIcon } from "./icons.jsx";

/**
 * A password field with a reveal toggle.
 *
 * Typing blind is bad enough on a keyboard; on a phone, with a Persian
 * layout and an LTR password, it's the main reason a login fails twice
 * before it works. The toggle stays keyboard-reachable (no negative
 * tabindex) so it isn't mouse-only, and it's `type="button"` so pressing
 * Enter on it toggles rather than submitting the form.
 *
 * Visibility resets to hidden on every mount — a revealed password should
 * never survive leaving the screen and coming back.
 */
export default function PasswordInput({ value, onChange, className = "", ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    // dir="ltr" on the wrapper, not just the input. The page is RTL, so
    // without it the button's `end-1.5` (inset-inline-end) would resolve
    // against RTL and sit on the LEFT, while the input's `pe-10` resolves
    // against its own dir="ltr" and reserves space on the RIGHT — the eye
    // over the text, and a gap where nothing is. Making the whole field
    // LTR, which is what it actually contains, keeps the two in agreement.
    <div className="relative" dir="ltr">
      <input
        // pe-10 reserves the toggle's footprint so a long password doesn't
        // run underneath it.
        className={`input w-full pe-10 ${className}`.trim()}
        type={isVisible ? "text" : "password"}
        dir="ltr"
        value={value}
        onChange={onChange}
        {...inputProps}
      />
      <button
        type="button"
        className="absolute end-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-muted hover:text-ink"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
        aria-pressed={isVisible}
      >
        {isVisible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
}
