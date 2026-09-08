import { PrinterIcon } from "./icons.jsx";

/**
 * Sends the current page to the printer.
 *
 * Members print their plans because a phone isn't always an option on the
 * gym floor — some prefer not to carry one, and women-only gyms commonly
 * ban them outright. For those members paper isn't a convenience, it's the
 * only way they see their programme, so the printed page is a real output
 * of this app rather than an afterthought (see the @media print block in
 * index.css for what it looks like).
 *
 * `no-print` keeps the button itself off the paper.
 */
export default function PrintButton({ label = "چاپ" }) {
  return (
    <button type="button" className="btn btn-ghost no-print" onClick={() => window.print()}>
      <PrinterIcon size={16} />
      <span>{label}</span>
    </button>
  );
}
