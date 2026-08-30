import { useNavigate } from "react-router-dom";

import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "../../constants/moveOptions.js";

const DIFFICULTY_VARIANT = {
  beginner: "success",
  intermediate: "accent",
  advanced: "danger",
};

export default function MoveCard({ move, editable }) {
  const navigate = useNavigate();
  const variant = DIFFICULTY_VARIANT[move.difficulty] ?? "neutral";

  return (
    <div
      className={`move-card${editable ? " move-card-editable" : ""}`}
      onDoubleClick={editable ? () => navigate(`/moves/${move.id}/edit`) : undefined}
      title={editable ? "برای ویرایش دوبار ضربه بزنید" : undefined}
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
