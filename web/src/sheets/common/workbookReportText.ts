// The words of the workbook report (P-06): what a sheet of an .xlsx, .xls
// or .ods file holds that its saved values do not show. Pure; the banner
// is WorkbookReport.tsx. Unit-tested in __tests__/workbookReportText.test.ts.
//
// The defaults follow what copying the range does in the two spreadsheet
// apps that write these files, which agree: rows a filter hides are left
// out, rows hidden by hand are copied (Microsoft, "Copy visible cells
// only"; LibreOffice Help, "Only Copy Visible Cells"). The report says
// "in the workbook", not "in Excel": an .ods or a LibreOffice .xls was
// never in Excel.
import type { WorkbookFormat } from "../../lib/engineProtocol.ts";
import { visibleRows, type SheetFlags } from "../../lib/xlsxFlags.ts";

/** A sheet as the report names it: its name (or where it came from, in
 *  a list of several files), its flags and its file's format. */
export interface ReportedSheet {
  name: string;
  flags?: SheetFlags | null;
  format: WorkbookFormat;
}

export interface ReportPart {
  key: "unchecked" | "filterHidden" | "manualHidden" | "blankFormulas";
  text: string;
  warn?: boolean;
}

const MAX = 6;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (items: string[]) => (items.length > MAX
  ? `${items.slice(0, MAX).join(", ")} and ${items.length - MAX} more` : items.join(", "));
/** Sheet rows as the spreadsheet numbers them, from indices into the rows read. */
const rowNumbers = (ix: number[]) => list(ix.map((i) => String(i + 1)));
const APPS = "Excel or LibreOffice Calc";

/** How to get a value saved into a formula cell, in the app that writes
 *  the format. */
function recalcStep(format: WorkbookFormat): string {
  return format === "ods"
    ? "Open the workbook in LibreOffice Calc, recalculate it (Data › Calculate › Recalculate Hard), "
      + "save it, then import it again"
    : "Open the workbook in Excel, save it, then import it again";
}

/** The report's parts for one sheet: none when there is nothing to say.
 *  `flags` null: the XML could not be checked; undefined: not a workbook
 *  sheet the reader flags. */
export function reportParts(flags: SheetFlags | null | undefined, format: WorkbookFormat,
  keepFiltered: boolean, skipHidden: boolean): ReportPart[] {
  const parts: ReportPart[] = [];
  if (flags === null) {
    parts.push({ key: "unchecked", warn: true,
      text: "hidden rows and formulas without saved values could not be checked in this workbook" });
    return parts;
  }
  if (!flags) return parts;
  if (flags.filterHidden.length) {
    const n = flags.filterHidden.length;
    parts.push({ key: "filterHidden", warn: !keepFiltered,
      text: `${plural(n, "row is", "rows are")} hidden by a filter in the workbook (${n === 1 ? "row" : "rows"} `
        + `${rowNumbers(flags.filterHidden)}): ${keepFiltered ? "imported"
          : `left out, as copying the filtered range in ${APPS} leaves ${n === 1 ? "it" : "them"} out`}` });
  }
  if (flags.manualHidden.length) {
    const n = flags.manualHidden.length;
    parts.push({ key: "manualHidden",
      text: `${plural(n, "row is", "rows are")} hidden in the workbook (${n === 1 ? "row" : "rows"} `
        + `${rowNumbers(flags.manualHidden)}): ${skipHidden ? "left out"
          : `imported, as copying the range in ${APPS} copies ${n === 1 ? "it" : "them"}`}` });
  }
  if (flags.blankFormulas.length) {
    const n = flags.blankFormulas.length;
    parts.push({ key: "blankFormulas", warn: true,
      text: `${plural(n, "formula cell has", "formula cells have")} no saved value and `
        + `${n === 1 ? "reads" : "read"} as blank: ${list(flags.blankFormulas)}. ${recalcStep(format)}` });
  }
  return parts;
}

/** A sheet's cells as text, without the hidden rows the import leaves
 *  out (visibleRows): by default the rows a filter hides, none of the
 *  rows hidden by hand. What every reader of a workbook takes. */
export function sheetCells(sheet: { rows: readonly (readonly unknown[])[]; flags?: SheetFlags | null },
  keepFiltered: boolean, skipHidden: boolean): string[][] {
  const rows = sheet.rows.map((r) => r.map((c) => (c == null ? "" : String(c))));
  return visibleRows({ rows, flags: sheet.flags }, keepFiltered, skipHidden);
}

