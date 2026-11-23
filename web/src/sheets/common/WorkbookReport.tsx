import { Fragment } from "react";
import { announce, Banner, Button } from "../../components/ui";
import { reportParts, type ReportedSheet } from "./workbookReportText";
import "./dataNotes.css";

/**
 * What the sheets of an .xlsx, .xls or .ods file hold that their saved
 * values do not show (P-06; the words are in workbookReportText.ts): rows
 * hidden by a filter (left out by default, as copying the filtered range
 * does), rows hidden by hand (kept by default, as a copy of the range
 * keeps them), and formula cells saved without a value (they read as
 * blank). One line per sheet that has something to say, in one banner
 * styled as the paste report; one click keeps or leaves out each kind of
 * hidden row in every sheet. Every place that reads a workbook shows it
 * (the Import dialog, the assay pickers, the recipe dialog, Apply to new
 * data), with the rows it takes from useWorkbookRows / visibleRows.
 */
export default function WorkbookReport({ sheets, keepFiltered, skipHidden, onKeepFiltered, onSkipHidden }: {
  /** The sheets read (the one shown, or every one the import takes). */
  sheets: readonly ReportedSheet[];
  keepFiltered: boolean;
  skipHidden: boolean;
  onKeepFiltered: (keep: boolean) => void;
  onSkipHidden: (skip: boolean) => void;
}) {
  const lines = sheets.map((s) => ({ name: s.name, parts: reportParts(s.flags, s.format, keepFiltered, skipHidden) }))
    .filter((l) => l.parts.length > 0);
  const open = lines.length > 0;
  const filtered = sheets.some((s) => !!s.flags?.filterHidden.length);
  const hidden = sheets.some((s) => !!s.flags?.manualHidden.length);
  return (
    <Banner open={open} tone={lines.some((l) => l.parts.some((p) => p.warn)) ? "warn" : "info"}
      className="paste-report workbook-report" aria-label="Workbook report">
      {open && (
        <>
          {lines.map((l, k) => (
            <p key={`${k}-${l.name}`} className="paste-report-line">
              <strong>“{l.name}”:</strong>{" "}
              {l.parts.map((p, i) => (
                <Fragment key={p.key}>
                  {i > 0 && <span className="paste-report-sep" aria-hidden="true"> · </span>}
                  {i > 0 && <span className="sr-only">; </span>}
                  <span className={`paste-report-part tone-${p.warn ? "warn" : "info"}`} data-part={p.key}>{p.text}</span>
                </Fragment>
              ))}
            </p>
          ))}
          {(filtered || hidden) && (
            <Banner.Actions>
              {filtered && (
                <Button size="sm" onClick={() => {
                  // the button's own label changes under focus: say what happened
                  announce(keepFiltered ? "The filtered rows are left out." : "The filtered rows are imported.", "polite");
                  onKeepFiltered(!keepFiltered);
                }}>
                  {keepFiltered ? "Leave out the filtered rows" : "Keep the filtered rows"}</Button>
              )}
              {hidden && (
                <Button size="sm" onClick={() => {
                  announce(skipHidden ? "The hidden rows are imported." : "The hidden rows are left out.", "polite");
                  onSkipHidden(!skipHidden);
                }}>
                  {skipHidden ? "Keep the hidden rows" : "Leave out the hidden rows"}</Button>
              )}
            </Banner.Actions>
          )}
        </>
      )}
    </Banner>
  );
}
