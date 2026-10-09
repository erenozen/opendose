import { Fragment } from "react";
import { reportParts, type CellNote, type PasteReport } from "../../project/pasteReport";
import "./dataNotes.css";

const MAX_CELLS = 6;

/**
 * One line above the grid after a paste or an import: how many numbers
 * were read, which cells were kept as missing or read as text (each a
 * button that goes to the cell), and the guarantee that nothing was
 * converted to 0. Dismissable; the next paste replaces it.
 */
export default function PasteReportStrip({ verb, report, onJump, onDismiss, onReimport }: {
  verb: "Pasted" | "Imported";
  report: PasteReport;
  onJump: (row: number, col: number) => void;
  onDismiss: () => void;
  /** Number-like text with commas: read the same block with Import. */
  onReimport?: () => void;
}) {
  const parts = reportParts(report);
  const warn = parts.some((p) => p.tone === "warn");
  const cellButton = (c: CellNote) => (
    <button key={c.addr} type="button" className="linkish cell-ref"
      title={c.text ? `“${c.text}”${c.to ? ` read as ${c.to}` : ""}` : "blank"}
      aria-label={`Go to cell ${c.addr}${c.text ? `, “${c.text}”` : ", blank"}`}
      onClick={() => onJump(c.row, c.col)}>{c.addr}</button>
  );
  return (
    <div className={`paste-report${warn ? " paste-report-warn" : ""}`} role="status"
      aria-label={`${verb} data report`}
      title="Cells are named by column letter (A = the grid's first column) and row number">
      <p className="paste-report-line">
        <strong>{verb}:</strong>{" "}
        {parts.map((p, i) => (
          <Fragment key={p.key}>
            {i > 0 && <span className="paste-report-sep" aria-hidden="true"> · </span>}
            {i > 0 && <span className="sr-only">; </span>}
            <span className={`paste-report-part tone-${p.tone}`} data-part={p.key}>
              {p.label}
              {p.cells.length > 0 && (
                <>
                  {": "}
                  {p.cells.slice(0, MAX_CELLS).map((c, k) => (
                    <Fragment key={c.addr}>{k > 0 && ", "}{cellButton(c)}</Fragment>
                  ))}
                  {p.cells.length > MAX_CELLS && ` and ${p.cells.length - MAX_CELLS} more`}
                </>
              )}
            </span>
          </Fragment>
        ))}
      </p>
      <div className="paste-report-actions">
        {onReimport && report.localeNumbers.length > 0 && (
          <button type="button" onClick={onReimport}
            title="Open the Import dialog with the same block, where the decimal separator can be chosen">
            Read with Import…</button>
        )}
        <button type="button" className="paste-report-close" onClick={onDismiss}
          aria-label="Dismiss the report">✕</button>
      </div>
    </div>
  );
}
