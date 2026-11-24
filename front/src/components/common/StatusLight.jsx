export default function StatusLight({ label, tone = "success", className = "" }) {
  const color = tone === "warning" ? "text-danger" : "text-success";

  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} title={label}>
      <span className={`status-led ${color}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
