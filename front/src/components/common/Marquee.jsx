/**
 * A scrolling signage strip.
 *
 * The items are rendered twice: the CSS loop travels exactly one copy's
 * width, so the second copy lands where the first started and the cycle
 * repeats with no seam (see @keyframes marquee-scroll).
 *
 * Accessibility: moving text is hostile to screen readers and to anyone
 * reading at their own pace, so the animated copy is hidden from assistive
 * tech and the same content is exposed once, statically, alongside it.
 * Motion itself is switched off by the global prefers-reduced-motion rule
 * in index.css, which leaves the first copy sitting there legibly.
 */
export default function Marquee({ items, duration, className = "" }) {
  if (!items?.length) return null;

  return (
    <div className={`marquee ${className}`.trim()}>
      <span className="sr-only">{items.join(" — ")}</span>
      <div
        className="marquee-track"
        aria-hidden="true"
        style={duration ? { "--marquee-duration": duration } : undefined}
      >
        {[...items, ...items].map((text, index) => (
          <span className="marquee-item" key={index}>
            <span className="status-led" />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
