// A workbook read by an assay picker (P-06): the rows it takes, with the
// same defaults and the same report as the Import dialog. Rows a filter
// hides are left out and rows hidden by hand kept until the user changes
// it in the report; each change hands the picker its rows again.
import { useState } from "react";
import type { XlsxSheet } from "../../lib/engine";
import type { WorkbookFormat } from "../../lib/engineProtocol";
import { sheetCells, type ReportedSheet } from "./workbookReportText";

type Sheet = ReportedSheet & { rows: XlsxSheet["rows"] };

/**
 * `onRows(sheets, again)` receives the cells of every sheet passed to
 * `read`, hidden rows applied: `again` is false for a newly read file
 * and true when the report's buttons changed which rows are taken (a
 * picker that adds to a table must then replace what it added, not add
 * it twice). Render `<WorkbookReport {...report} />` next to the picker.
 */
export function useWorkbookRows(onRows: (sheets: string[][][], again: boolean) => void) {
  const [book, setBook] = useState<Sheet[] | null>(null);
  const [keepFiltered, setKeepFiltered] = useState(false);
  const [skipHidden, setSkipHidden] = useState(false);
  const emit = (sheets: Sheet[], keep: boolean, skip: boolean, again: boolean) =>
    onRows(sheets.map((s) => sheetCells(s, keep, skip)), again);
  return {
    /** A workbook was read: the sheets the picker uses, from the defaults. */
    read(sheets: XlsxSheet[], format: WorkbookFormat) {
      const next = sheets.map((s) => ({ ...s, format }));
      setBook(next);
      setKeepFiltered(false);
      setSkipHidden(false);
      emit(next, false, false, false);
    },
    /** Something else was read (a text file, a paste): no report. */
    clear() { setBook(null); },
    report: {
      sheets: book ?? [],
      keepFiltered,
      skipHidden,
      onKeepFiltered: (keep: boolean) => {
        setKeepFiltered(keep);
        if (book) emit(book, keep, skipHidden, true);
      },
      onSkipHidden: (skip: boolean) => {
        setSkipHidden(skip);
        if (book) emit(book, keepFiltered, skip, true);
      },
    },
  };
}
