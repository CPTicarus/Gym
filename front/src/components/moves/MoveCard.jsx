import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "../../constants/moveOptions.js";

const DIFFICULTY_VARIANT = {
  beginner: "success",
  intermediate: "accent",
  advanced: "danger",
};

export default function MoveCard({ move }) {
  const variant = DIFFICULTY_VARIANT[move.difficulty] ?? "neutral";

  return (
    <div className="move-card">
      {move.category && <span className="eyebrow">{CATEGORY_LABELS[move.category] ?? move.category}</span>}
      <h3 className="move-card-title">{move.name}</h3>
      {move.difficulty && (
        <span className={`badge badge-${variant}`}>{DIFFICULTY_LABELS[move.difficulty] ?? move.difficulty}</span>
      )}
    </div>
  );
}
