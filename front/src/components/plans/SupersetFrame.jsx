import { toPersianDigits } from "../../utils/jalali.js";
import { formatSupersetDetail } from "../../utils/supersets.js";

/**
 * How a superset is drawn wherever a plan is shown — the builder, the
 * member's plan, the gym session — so it reads the same everywhere: one
 * box, labelled, its sets and rest up top, its moves numbered in the order
 * they're done.
 *
 *   superset            a block from dayBlocks(), with its `exercises`
 *   renderMove(ex)      the inside of one move's row — each screen's own
 *   leading / actions   the head's start (a session checkbox) and end (the
 *                       builder's edit/delete)
 *   editor              shown in place of the head (the builder's form)
 *   footer              below the moves (the builder's "add a move")
 *   isDone              struck through, as a ticked-off session row is
 */
export default function SupersetFrame({ superset, renderMove, leading, actions, editor, footer, isDone = false }) {
  return (
    <li className={`superset-block${isDone ? " is-checked" : ""}`}>
      {editor ?? (
        <div className="superset-head">
          {leading}
          <div className="superset-heading">
            <span className="superset-title">
              <span className="superset-badge">سوپرست</span>
              {superset.name && <span className="superset-name">{superset.name}</span>}
            </span>
            <span className="muted exercise-detail">{formatSupersetDetail(superset)}</span>
          </div>
          {actions}
        </div>
      )}
      <ol className="superset-moves">
        {superset.exercises.map((exercise, index) => (
          <li key={exercise.id} className="superset-move">
            {/* The <ol> already tells a screen reader the order. */}
            <span className="superset-index" aria-hidden="true">
              {toPersianDigits(index + 1)}
            </span>
            {renderMove(exercise)}
          </li>
        ))}
      </ol>
      {superset.notes && !editor && <p className="muted exercise-notes">{superset.notes}</p>}
      {footer}
    </li>
  );
}
