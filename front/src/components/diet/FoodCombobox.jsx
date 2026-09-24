import { useEffect, useMemo, useRef, useState } from "react";

import { formatNumber, formatServing } from "../../utils/nutrition.js";
import { normalizeSearch } from "../../utils/search.js";

// Same cap as MoveCombobox: the whole library is filtered in the browser,
// but the dropdown shouldn't render hundreds of rows at once.
const MAX_RESULTS = 50;

// One shared empty list, so the default doesn't hand useMemo a new array
// (and a cache miss) on every render.
const NO_IDS = [];

export function foodDisplayName(food) {
  return food.alias ? `${food.name} (${food.alias})` : food.name;
}

function servingLine(food) {
  const parts = [formatServing(food)];
  if (food.calories != null) parts.push(`${formatNumber(food.calories, 0)} کالری`);
  return parts.join(" · ");
}

/**
 * Search-as-you-type food picker — MoveCombobox's counterpart, with two
 * things a food library needs on top:
 *
 *  - every option says what the food is per serving ("هر ۱۰۰ گرم · ۱۶۵
 *    کالری"), which is also how two foods with one name tell apart;
 *  - `onCreate(name)`, when passed, offers "+ add «X»" for a search that
 *    matches no food by that exact name — so a food missing from the
 *    library doesn't mean abandoning the plan to go and add it.
 *
 * `value` is a food id string or "", as with MoveCombobox; `onChange` also
 * hands over the food itself. Unlike MoveCombobox the input starts out
 * showing the selected food, so an edit form reads as what it is. The
 * parent still resets it by changing its `key` — see MoveCombobox for why
 * that beats syncing the query from `value`.
 */
export default function FoodCombobox({
  foods,
  value,
  onChange,
  onCreate,
  excludeIds = NO_IDS,
  placeholder = "جستجوی خوراکی…",
}) {
  const [query, setQuery] = useState(() => {
    const selected = foods.find((food) => String(food.id) === value);
    return selected ? foodDisplayName(selected) : "";
  });
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);

  const normalizedQuery = normalizeSearch(query);
  const matches = useMemo(() => {
    const pool = foods.filter((food) => !excludeIds.includes(food.id));
    if (!normalizedQuery) return pool;
    return pool.filter(
      (food) =>
        normalizeSearch(food.name).includes(normalizedQuery) ||
        normalizeSearch(food.alias).includes(normalizedQuery)
    );
  }, [foods, normalizedQuery, excludeIds]);
  const filtered = matches.slice(0, MAX_RESULTS);
  const isTruncated = matches.length > filtered.length;
  // Not while a food is picked: the input then holds that food's display
  // name, which would otherwise offer to create what's already chosen.
  const canCreate = Boolean(
    onCreate &&
      !value &&
      normalizedQuery &&
      !foods.some((food) => normalizeSearch(food.name) === normalizedQuery)
  );
  const optionCount = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function selectFood(food) {
    onChange(String(food.id), food);
    setQuery(foodDisplayName(food));
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function create() {
    setIsOpen(false);
    setActiveIndex(-1);
    onCreate(query.trim());
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    setIsOpen(true);
    setActiveIndex(-1);
    if (value) onChange("", null); // typing again invalidates the previous pick
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((i) => Math.min(i + 1, optionCount - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (isOpen && activeIndex >= 0 && activeIndex < optionCount) {
        e.preventDefault();
        if (activeIndex < filtered.length) selectFood(filtered[activeIndex]);
        else create();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  let emptyText = null;
  if (filtered.length === 0 && !canCreate) {
    emptyText =
      foods.length === 0 && onCreate
        ? "هنوز خوراکی‌ای ثبت نشده — نامش را بنویسید تا اضافه شود."
        : "خوراکی‌ای پیدا نشد.";
  }

  return (
    <div className="move-combobox food-combobox" ref={containerRef}>
      <input
        className="input"
        type="text"
        dir="auto"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-label="جستجوی خوراکی"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && (
        <ul className="move-combobox-list" role="listbox">
          {emptyText && <li className="move-combobox-empty">{emptyText}</li>}
          {filtered.map((food, i) => (
            <li
              key={food.id}
              role="option"
              aria-selected={String(food.id) === value}
              className={`move-combobox-option${i === activeIndex ? " is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectFood(food)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {foodDisplayName(food)}
              <span className="combobox-option-sub">{servingLine(food)}</span>
            </li>
          ))}
          {isTruncated && <li className="move-combobox-empty">برای نتایج دقیق‌تر ادامه دهید…</li>}
          {canCreate && (
            <li
              role="option"
              aria-selected={false}
              className={`move-combobox-option combobox-create${
                activeIndex === filtered.length ? " is-active" : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={create}
              onMouseEnter={() => setActiveIndex(filtered.length)}
            >
              + افزودن «{query.trim()}» به خوراکی‌ها
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
