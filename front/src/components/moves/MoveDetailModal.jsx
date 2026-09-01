import { useEffect, useState } from "react";

import { getMove } from "../../api/moves.js";
import Modal from "../common/Modal.jsx";
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "../../constants/moveOptions.js";

const DIFFICULTY_VARIANT = {
  beginner: "success",
  intermediate: "accent",
  advanced: "danger",
};

function MediaItem({ item }) {
  if (item.media_type === "image" && item.file) {
    return (
      <li className="move-media-item">
        <img className="move-media-image" src={item.file} alt={item.caption || "تصویر حرکت"} />
        {item.caption && <span className="muted move-media-caption">{item.caption}</span>}
      </li>
    );
  }
  if (item.media_type === "video" && item.file) {
    return (
      <li className="move-media-item">
        <video className="move-media-video" src={item.file} controls />
        {item.caption && <span className="muted move-media-caption">{item.caption}</span>}
      </li>
    );
  }
  if (item.external_url) {
    return (
      <li className="move-media-item">
        <a className="btn btn-ghost btn-sm ltr" href={item.external_url} target="_blank" rel="noreferrer">
          {item.media_type === "video" ? "مشاهده ویدیو ↗" : "مشاهده لینک ↗"}
        </a>
        {item.caption && <span className="muted move-media-caption">{item.caption}</span>}
      </li>
    );
  }
  return null;
}

/** Fetches and shows a move's full detail (description + images/clips) —
 * members need this to actually know how to perform what's in their plan. */
export default function MoveDetailModal({ moveId, onClose }) {
  const [move, setMove] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getMove(moveId);
        if (!cancelled) setMove(data);
      } catch {
        if (!cancelled) setError("بارگذاری حرکت با مشکل مواجه شد.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [moveId]);

  const variant = move ? DIFFICULTY_VARIANT[move.difficulty] ?? "neutral" : "neutral";

  return (
    <Modal title={move?.name ?? "حرکت"} onClose={onClose}>
      {isLoading && <p className="muted">در حال بارگذاری…</p>}
      {error && <p className="error-text">{error}</p>}

      {move && (
        <>
          {move.alias && <p className="muted move-detail-alias">{move.alias}</p>}

          <div className="move-detail-badges">
            {move.category && <span className="badge badge-neutral">{CATEGORY_LABELS[move.category] ?? move.category}</span>}
            {move.difficulty && (
              <span className={`badge badge-${variant}`}>{DIFFICULTY_LABELS[move.difficulty] ?? move.difficulty}</span>
            )}
          </div>

          {move.description && <p className="move-detail-description">{move.description}</p>}

          {move.media?.length > 0 ? (
            <ul className="move-media-list">
              {move.media.map((item) => (
                <MediaItem key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="muted">هنوز عکس یا ویدیویی برای این حرکت ثبت نشده.</p>
          )}
        </>
      )}
    </Modal>
  );
}
