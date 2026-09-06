import { useRef } from "react";
import { useNavigate } from "react-router-dom";

import { PencilIcon } from "../common/icons.jsx";
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
//
// Double-click is a mouse gesture though — a phone has no reliable
// equivalent, so below the desktop breakpoint editable cards also carry an
// explicit edit button (hidden again at >=860px, see index.css).
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
    cancelPendingView();
    navigate(`/moves/${move.id}/edit`);
  }

  function handleEditClick(e) {
    // The whole card is a view target, so keep the tap from falling through
    // to it — and drop the pending "view" timer if one is already running.
    e.stopPropagation();
    cancelPendingView();
    navigate(`/moves/${move.id}/edit`);
  }

  function cancelPendingView() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  }

  return (
    <div
      className={editable ? "move-card move-card-editable" : "move-card"}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={editable ? "برای مشاهده ضربه بزنید — برای ویرایش دوبار ضربه بزنید" : "برای مشاهده ضربه بزنید"}
    >
      {editable && (
        <button
          type="button"
          className="move-card-edit icon-btn icon-btn-sm"
          onClick={handleEditClick}
          aria-label={`ویرایش ${move.name}`}
        >
          <PencilIcon size={15} />
        </button>
      )}

      {move.category && <span className="eyebrow">{CATEGORY_LABELS[move.category] ?? move.category}</span>}
      <h3 className="move-card-title">{move.name}</h3>
      {move.alias && <span className="move-card-alias">{move.alias}</span>}
      {move.difficulty && (
        <span className={`badge badge-${variant}`}>{DIFFICULTY_LABELS[move.difficulty] ?? move.difficulty}</span>
      )}
    </div>
  );
}
