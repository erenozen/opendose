// The project as one Excel workbook (P-64): a README sheet, then one sheet
// per data table and one per results sheet, each holding exactly what the
// CSV export of that table or results sheet holds, with numbers stored as
// numbers. Pure; the app collects the rendered results (useBundleExport).
import { DEFAULT_EXPORT, tableMatrix } from "../project/exportTable.ts";
import { flatColumns } from "../project/table.ts";
import type { DataTableModel } from "../project/types.ts";
import {
  numericCell, sheetNames, writeXlsx, type SheetName, type XlsxCell, type XlsxSheet,
} from "./xlsx.ts";

export interface WorkbookInput {
  title: string;
  /** "OpenDose 0.5.0 (build abc123, 2026-11-20)" */
  app: string;
  /** ISO date-time the workbook was made. */
  date: string;
  tables: { name: string; table: DataTableModel }[];
  /** Each results sheet as the app shows it (resultsMatrix), the rows
   *  its CSV export writes. `analysis` "" says only "Results". */
  results: { name: string; analysis: string; data: string; matrix: string[][] }[];
  /** Results sheets that could not be drawn in time (named in the README). */
  skipped?: string[];
}

export interface Workbook {
  bytes: Uint8Array;
  /** Sheet names Excel would not take as they are, and what they became. */
  renamed: SheetName[];
  /** Sheets in the workbook, the README included. */
  sheets: number;
}

/** A data table's CSV rows as cells: the title rows and the row-title
 *  column stay text (a title "2019" is a name, not a number); every other
 *  field is a number when it reads as one, at every stored digit.
 *  Excluded values keep their CSV form, text ending in "*", so a sum in
 *  Excel leaves them out as the analyses do. */
export function tableCells(t: DataTableModel): { rows: XlsxCell[][]; titleRows: number } {
  const m = tableMatrix(t, DEFAULT_EXPORT);
  const titleRows = t.datasets.some((d) => d.subTitles?.some((s) => s.trim())) ? 2 : 1;
  const textCol = flatColumns(t).findIndex((c) => c.kind === "rowTitle");
  const rows = m.map((r, i) => r.map((v, j) => (i < titleRows || j === textCol
    ? (v === "" ? null : v) : numericCell(v))));
  return { rows, titleRows };
}

/** A results sheet's CSV rows as cells: numbers where a field reads as
 *  one, at the digits shown (and exported as CSV). */
export function resultCells(matrix: string[][]): { rows: XlsxCell[][]; headings: number[] } {
  const rows = matrix.map((r) => r.map(numericCell));
  // a heading is a row of one text cell (h3 / h4 above a table)
  const headings = rows.flatMap((r, i) => (r.length === 1 && typeof r[0] === "string" ? [i] : []));
  return { rows, headings };
}

const README = "README";

/** The README sheet's rows: where the workbook came from, what each sheet
 *  holds, the names changed for Excel and how values are written. */
function readmeRows(b: WorkbookInput, list: { sheet: string; what: string; from: SheetName }[],
  notes: string[]): { rows: XlsxCell[][]; bold: number[] } {
  const rows: XlsxCell[][] = [
    [`${b.title || "OpenDose project"}: tables and results`],
    [`Made ${b.date.slice(0, 16).replace("T", " ")} UTC with ${b.app}.`],
    [],
    ["Sheet", "What it holds", "Name in OpenDose", "Renamed because"],
  ];
  const bold = [0, 3];
  for (const l of list) {
    rows.push([l.sheet, l.what, l.from.from, l.from.why]);
  }
  rows.push([]);
  bold.push(rows.length);
  rows.push(["How values are written"]);
  for (const n of notes) rows.push([n]);
  return { rows, bold };
}

export const WORKBOOK_NOTES = [
  "Numbers are stored as numbers; text, blank cells and missing values are left as they are.",
  "Data tables hold every stored digit, as the CSV export does. Excluded values end in * and are text, so Excel sums leave them out.",
  "Results sheets hold the results as shown in the app, at its display precision: the same values as each results sheet's CSV export.",
  "Values Excel cannot hold (beyond 1.8e308, or closer to zero than 2.2e-308) stay text.",
];

/** The project's tables and results as one workbook. Throws (with the
 *  sheet and the limit) when a table is larger than an Excel worksheet. */
export function projectWorkbook(b: WorkbookInput): Workbook {
  const names = sheetNames([...b.tables.map((t) => t.name), ...b.results.map((r) => r.name)], [README]);
  const sheets: XlsxSheet[] = [];
  const list: { sheet: string; what: string; from: SheetName }[] = [];
  b.tables.forEach((t, i) => {
    const n = names[i];
    const c = tableCells(t.table);
    sheets.push({ name: n.name, rows: c.rows, bold: Array.from({ length: c.titleRows }, (_, k) => k) });
    list.push({ sheet: n.name, what: "Data table, as laid out in the app", from: n });
  });
  b.results.forEach((r, i) => {
    const n = names[b.tables.length + i];
    const c = resultCells(r.matrix);
    sheets.push({ name: n.name, rows: c.rows, bold: c.headings });
    list.push({ sheet: n.name, from: n,
      what: r.analysis ? `${r.analysis} of “${r.data}”` : "Results, as shown in the app" });
  });
  const notes = [...WORKBOOK_NOTES];
  if (b.skipped?.length) {
    notes.push(`Not included (not drawn in time; export them from the app): ${b.skipped.join(", ")}.`);
  }
  const readme = readmeRows(b, list, notes);
  const bytes = writeXlsx([{ name: README, rows: readme.rows, bold: readme.bold }, ...sheets],
    { title: b.title, created: b.date.replace(/\.\d+Z$/, "Z") });
  return { bytes, renamed: names.filter((n) => n.why), sheets: sheets.length + 1 };
}

/** "2 sheet names were changed for Excel (see the README sheet)" or "". */
export function renamedPhrase(renamed: SheetName[]): string {
  if (!renamed.length) return "";
  const one = renamed.length === 1;
  return `${renamed.length} sheet name${one ? " was" : "s were"} changed for Excel (see the README sheet)`;
}
