// One table file (CSV, TSV, text or a workbook) dropped on the page or
// chosen with Open: the Import dialog opens on it and makes a new table
// (sheets/common/TableFileImport.tsx answers the event). The report of
// what the import read is handed to the new table's grid, which shows it
// above the table as it does after an import from the grid's toolbar.
import type { PasteReport } from "../project/pasteReport";

export const TABLE_FILE_EVENT = "opendose-table-file";

/** Files Open and a page drop read as one table. */
export const TABLE_OPEN = /\.(csv|tsv|txt|tab|dat|prn|xlsx|xls|ods)$/i;
export const TABLE_OPEN_ACCEPT = ".csv,.tsv,.txt,.tab,.dat,.prn,.xlsx,.xls,.ods";

export function openTableFile(file: File): void {
  window.dispatchEvent(new CustomEvent<File>(TABLE_FILE_EVENT, { detail: file }));
}

export function onTableFile(fn: (file: File) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<File>).detail);
  window.addEventListener(TABLE_FILE_EVENT, h);
  return () => window.removeEventListener(TABLE_FILE_EVENT, h);
}

const reports = new Map<string, PasteReport>();

/** The import report of a table just made, for its grid to show. */
export function handOverReport(dataId: string, report: PasteReport): void {
  reports.set(dataId, report);
}

/** The report handed over for this table, once. */
export function takeReport(dataId: string): PasteReport | undefined {
  const r = reports.get(dataId);
  reports.delete(dataId);
  return r;
}
