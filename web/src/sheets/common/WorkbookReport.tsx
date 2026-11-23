import { Fragment } from "react";
import { announce, Banner, Button } from "../../components/ui";
import type { XlsxSheet } from "../../lib/engine";
import "./dataNotes.css";

const MAX = 6;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length > MAX
  ? `${items.slice(0, MAX).join(", ")} and ${items.length - MAX} more` : items.join(", "));
/** Sheet rows as Excel numbers them, from indices into the rows read. */
const rowNumbers = (ix: number[]) => list(ix.map((i) => String(i + 1)));

/**
 * What an .xlsx sheet holds that its cached values do not show (P-06):
 * rows hidden by a filter (left out by default, as copying the filtered
 * range in Excel does), rows hidden by hand (kept by default, as a copy
 * of the range keeps them), and formula cells saved without a value
 * (they read as blank). Styled as the paste report; one click keeps or
 * leaves out each kind of hidden row.
 */
export default function WorkbookReport({ sheet, keepFiltered, skipHidden, onKeepFiltered, onSkipHidden }: {
  sheet: XlsxSheet | null;
  keepFiltered: boolean;
  skipHidden: boolean;
  onKeepFiltered: (keep: boolean) => void;
  onSkipHidden: (skip: boolean) => void;
}) {
  const f = sheet?.flags;
  const parts: { key: string; text: string; warn?: boolean }[] = [];
  if (sheet && f === null) {
    parts.push({ key: "unchecked", warn: true, text: "hidden rows and formulas without saved values could not be checked in this workbook" });
  }
  if (f?.filterHidden.length) {
    const n = f.filterHidden.length;
    parts.push({ key: "filterHidden", warn: !keepFiltered,
      text: `${plural(n, "row is", "rows are")} hidden by a filter in Excel (${n === 1 ? "row" : "rows"} `
        + `${rowNumbers(f.filterHidden)}): ${keepFiltered ? "imported"
          : `left out, as copying the filtered range in Excel leaves ${n === 1 ? "it" : "them"} out`}` });
  }
  if (f?.manualHidden.length) {
    const n = f.manualHidden.length;
    parts.push({ key: "manualHidden",
      text: `${plural(n, "row is", "rows are")} hidden in Excel (${n === 1 ? "row" : "rows"} `
        + `${rowNumbers(f.manualHidden)}): ${skipHidden ? "left out"
          : `imported, as copying the range in Excel copies ${n === 1 ? "it" : "them"}`}` });
  }
  if (f?.blankFormulas.length) {
    const n = f.blankFormulas.length;
    parts.push({ key: "blankFormulas", warn: true,
      text: `${plural(n, "formula cell has", "formula cells have")} no saved value and `
        + `${n === 1 ? "reads" : "read"} as blank: ${list(f.blankFormulas)}. Open the workbook in Excel, `
        + "save it, then import it again" });
  }
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
