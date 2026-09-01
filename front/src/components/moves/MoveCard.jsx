import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "../../constants/moveOptions.js";

const DIFFICULTY_VARIANT = {
  beginner: "success",
  intermediate: "accent",
  advanced: "danger",
};

// A single click views the move (everyone); editable cards also respond to
// a double-click (edit). Since a double-click always fires two single
// clicks first, a single click on an editable card waits this long to see
// whether a second one follows before treating it as "view", so editing
// doesn't flash the detail modal open first.
const CLICK_DELAY_MS = 250;

export default function MoveCard({ move, editable, onView }) {
  const navigate = useNavigate();
  const variant = DIFFICULTY_VARIANT[move.difficulty] ?? "neutral";
  const clickTimer = useRef(null);

  function handleClick() {
    if (!editable) {
      onView(move.id);
      return;
    }
    clickTimer.current = setTimeout(() => {
      onView(move.id);
      clickTimer.current = null;
    }, CLICK_DELAY_MS);
  }

  function handleDoubleClick() {
    if (!editable) return;
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    navigate(`/moves/${move.id}/edit`);
  }

  return (
    <div
      className="move-card"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={editable ? "برای مشاهده ضربه بزنید — برای ویرایش دوبار ضربه بزنید" : "برای مشاهده ضربه بزنید"}
    >
      {move.category && <span className="eyebrow">{CATEGORY_LABELS[move.category] ?? move.category}</span>}
      <h3 className="move-card-title">{move.name}</h3>
      {move.alias && <span className="move-card-alias">{move.alias}</span>}
      {move.difficulty && (
        <span className={`badge badge-${variant}`}>{DIFFICULTY_LABELS[move.difficulty] ?? move.difficulty}</span>
      )}
    </div>
  );
}
