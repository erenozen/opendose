import { Fragment, useEffect } from "react";
import { announce, Banner, Button } from "../../components/ui";
import {
  reportLine, reportParts, type CellNote, type PasteReport,
} from "../../project/pasteReport";
import "./dataNotes.css";

const MAX_CELLS = 6;

/**
 * The grid note after a paste or an import (a Banner above the grid):
 * how many numbers were read, which cells were kept as missing or read
 * as text (each a button that goes to the cell), and the guarantee that
 * nothing was converted to 0. Dismissable; the next paste replaces it.
 * Keep it mounted and pass `open` so it leaves with the Banner's exit.
 */
export default function PasteReportStrip({ open, verb, report, onJump, onDismiss, onReimport }: {
  open: boolean;
  verb: "Pasted" | "Imported";
  report: PasteReport | null;
  onJump: (row: number, col: number) => void;
  onDismiss: () => void;
  /** Number-like text with commas: read the same block with Import. */
  onReimport?: () => void;
}) {
  // The note appears with its words, so a live region would often stay
  // silent: speak the line once per report instead.
  useEffect(() => {
    if (open && report) announce(`${verb}: ${reportLine(report)}`, "polite");
  }, [open, verb, report]);
  const parts = report ? reportParts(report) : [];
  const warn = parts.some((p) => p.tone === "warn");
  const cellButton = (c: CellNote) => (
    <button key={c.addr} type="button" data-still className="linkish cell-ref"
      title={c.text ? `“${c.text}”${c.to ? ` read as ${c.to}` : ""}` : "blank"}
      aria-label={`Go to cell ${c.addr}${c.text ? `, “${c.text}”` : ", blank"}`}
      onClick={() => onJump(c.row, c.col)}>{c.addr}</button>
  );
  return (
    <Banner open={open && !!report} tone={warn ? "warn" : "neutral"} className="paste-report"
      aria-label={`${verb} data report`} onDismiss={onDismiss} dismissLabel="Dismiss the report">
      {report && (
        <>
          <p className="paste-report-line"
            title="Cells are named by column letter (A = the grid's first column) and row number">
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
          {onReimport && report.localeNumbers.length > 0 && (
            <Banner.Actions>
              <Button size="sm" onClick={onReimport}
                title="Open the Import dialog with the same block, where the decimal separator can be chosen">
                Read with Import…</Button>
            </Banner.Actions>
          )}
        </>
      )}
    </Banner>
  );
}
