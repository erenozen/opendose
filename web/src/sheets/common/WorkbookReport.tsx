import { Fragment } from "react";
import { announce, Banner, Button } from "../../components/ui";
import type { XlsxSheet } from "../../lib/engine";
import type { WorkbookFormat } from "../../lib/engineProtocol";
import { reportParts } from "./workbookReport";
import "./dataNotes.css";

/**
 * What a sheet of an .xlsx, .xls or .ods file holds that its saved values
 * do not show (P-06; the words are in workbookReport.ts): rows hidden by
 * a filter (left out by default, as copying the filtered range does),
 * rows hidden by hand (kept by default, as a copy of the range keeps
 * them), and formula cells saved without a value (they read as blank).
 * Styled as the paste report; one click keeps or leaves out each kind of
 * hidden row.
 */
export default function WorkbookReport({ sheet, format, keepFiltered, skipHidden, onKeepFiltered, onSkipHidden }: {
  sheet: XlsxSheet | null;
  format: WorkbookFormat;
  keepFiltered: boolean;
  skipHidden: boolean;
  onKeepFiltered: (keep: boolean) => void;
  onSkipHidden: (skip: boolean) => void;
}) {
  const f = sheet?.flags;
  const parts = sheet ? reportParts(f, format, keepFiltered, skipHidden) : [];
  const open = parts.length > 0;
  return (
    <Banner open={open} tone={parts.some((p) => p.warn) ? "warn" : "info"}
      className="paste-report workbook-report" aria-label="Workbook report">
      {open && sheet && (
        <>
          <p className="paste-report-line">
            <strong>“{sheet.name}”:</strong>{" "}
            {parts.map((p, i) => (
              <Fragment key={p.key}>
                {i > 0 && <span className="paste-report-sep" aria-hidden="true"> · </span>}
                {i > 0 && <span className="sr-only">; </span>}
                <span className={`paste-report-part tone-${p.warn ? "warn" : "info"}`} data-part={p.key}>{p.text}</span>
              </Fragment>
            ))}
          </p>
          {(!!f?.filterHidden.length || !!f?.manualHidden.length) && (
            <Banner.Actions>
              {!!f?.filterHidden.length && (
                <Button size="sm" onClick={() => {
                  // the button's own label changes under focus: say what happened
                  announce(keepFiltered ? "The filtered rows are left out." : "The filtered rows are imported.", "polite");
                  onKeepFiltered(!keepFiltered);
                }}>
                  {keepFiltered ? "Leave out the filtered rows" : "Keep the filtered rows"}</Button>
              )}
              {!!f?.manualHidden.length && (
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
