import { useEffect, useMemo, useRef, useState } from "react";

// Client-side filtering — the plan builder already loads every move up
// front (fetchAllMoves), so this is instant with no extra request per
// keystroke. Capped so the dropdown doesn't render hundreds of rows at once.
const MAX_RESULTS = 50;

function displayName(move) {
  return move.alias ? `${move.name} (${move.alias})` : move.name;
}

/**
 * A search-as-you-type replacement for the plain move <select> — with
 * 200+ moves, scrolling a native dropdown to find one is unworkable.
 * `value`/`onChange` behave like the select did: a move id string, or "".
 *
 * No effect syncs `query` back from `value` — typing invalidates a stale
 * pick by calling onChange("") too, which is indistinguishable from the
 * parent resetting after a successful add, so an effect watching `value`
 * would wipe out whatever the user just typed. Instead, the parent forces
 * a reset by changing this component's `key` (remounting it), e.g.
 * `key={resetToken}` bumped after each successful add.
 */
export default function MoveCombobox({ moves, value, onChange, placeholder = "جستجوی حرکت…" }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? moves.filter((m) => m.name.toLowerCase().includes(q) || (m.alias ?? "").toLowerCase().includes(q))
      : moves;
  }, [moves, query]);
  const filtered = matches.slice(0, MAX_RESULTS);
  const isTruncated = matches.length > filtered.length;

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function selectMove(move) {
    onChange(String(move.id));
    setQuery(displayName(move));
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    setIsOpen(true);
    setActiveIndex(-1);
    if (value) onChange(""); // typing again invalidates the previous pick
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (isOpen && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        selectMove(filtered[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="move-combobox" ref={containerRef}>
      <input
        className="input"
        type="text"
        dir="auto"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-label="جستجوی حرکت"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul className="move-combobox-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="move-combobox-empty">حرکتی پیدا نشد.</li>
          ) : (
            <>
              {filtered.map((m, i) => (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={String(m.id) === value}
                  className={`move-combobox-option${i === activeIndex ? " is-active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectMove(m)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {displayName(m)}
                </li>
              ))}
              {isTruncated && <li className="move-combobox-empty">برای نتایج دقیق‌تر ادامه دهید…</li>}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
