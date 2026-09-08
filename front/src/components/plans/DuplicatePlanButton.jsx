import { useState } from "react";

import { CopyIcon } from "../common/icons.jsx";
import { copyPlanName } from "../../utils/planCopy.js";

/**
 * Copy this plan and open the copy.
 *
 * The point is speed: varying one exercise for a member with a bad knee
 * shouldn't mean rebuilding twelve. So there's no naming dialog in the
 * way — it duplicates, names the copy predictably, and drops the trainer
 * straight into it, where the title is editable anyway.
 *
 * `onDuplicate(name)` performs the copy and returns the new plan; the
 * parent decides where "into it" is.
 */
export default function DuplicatePlanButton({ planName, onDuplicate }) {
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState(null);

  async function handleClick() {
    setError(null);
    setIsCopying(true);
    try {
      await onDuplicate(copyPlanName(planName));
    } catch {
      setError("تکثیر برنامه با مشکل مواجه شد.");
    } finally {
      // `finally`, not just the catch: navigating to the copy changes the
      // route PARAM, not the route, so this component stays mounted. Left
      // set, the button on the new page would sit disabled reading
      // "duplicating…" forever.
      setIsCopying(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={handleClick} disabled={isCopying}>
        <CopyIcon size={16} />
        <span>{isCopying ? "در حال تکثیر…" : "تکثیر"}</span>
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
