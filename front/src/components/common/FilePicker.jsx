import { useEffect, useRef } from "react";

import { XIcon } from "./icons.jsx";

/**
 * A file input that behaves like the rest of the UI.
 *
 * The native control renders its own "Choose File / No file chosen" chrome:
 * it's in English inside an RTL Persian form, it can't be styled, and —
 * the actual bug — it keeps showing the old filename after the parent
 * resets its `file` state, because the DOM input holds a separate copy of
 * the selection. So the real input is hidden and driven through this
 * wrapper, with what's on screen mirrored from the `file` prop: clear the
 * prop, and the input clears with it.
 */
export default function FilePicker({ file, onChange, accept, buttonLabel = "انتخاب فایل" }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface p-1.5">
      <button
        type="button"
        className="btn btn-ghost btn-sm flex-none"
        onClick={() => inputRef.current?.click()}
      >
        {buttonLabel}
      </button>

      {file ? (
        <>
          {/* Filenames are usually Latin — isolate so they don't reorder in RTL. */}
          <span className="ltr min-w-0 flex-1 truncate text-[13px]">{file.name}</span>
          <button
            type="button"
            className="icon-btn icon-btn-sm flex-none"
            onClick={() => onChange(null)}
            aria-label="حذف فایل انتخاب‌شده"
          >
            <XIcon size={14} />
          </button>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">فایلی انتخاب نشده</span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
