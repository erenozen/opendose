// Exporting a data table (or any matrix of text, such as a results table
// read off the page) as CSV or tab-separated text. Pure.
import { flatColumns, isExcluded, parseCell } from "./table.ts";
import type { DataTableModel } from "./types.ts";

export type ExcludedExport = "asis" | "asterisk" | "blank";

export interface ExportOptions {
  excluded: ExcludedExport;  // how excluded values appear
  decimal: "." | ",";        // decimal separator of exported numbers
  titles: boolean;           // first row(s): column titles
}

export const DEFAULT_EXPORT: ExportOptions = { excluded: "asterisk", decimal: ".", titles: true };

/** The table as rows of text in grid order (row titles, X, then every
 *  dataset's subcolumns). With titles: one row of column titles (the
 *  dataset name over each of its subcolumns), plus a row of subcolumn
 *  titles when any dataset has them (summary formats, survival). All
 *  stored digits are exported, whatever the display setting. */
export function tableMatrix(t: DataTableModel, o: ExportOptions): string[][] {
  const cols = flatColumns(t);
  const out: string[][] = [];
  if (o.titles) {
    out.push(cols.map((c) => (c.kind === "rowTitle" ? "Row title"
      : c.kind === "x" ? t.xTitle || "X" : t.datasets[c.dataset].name)));
    if (t.datasets.some((d) => d.subTitles?.some((s) => s.trim()))) {
      out.push(cols.map((c) => (c.kind === "y"
        ? t.datasets[c.dataset].subTitles?.[c.sub] || `Y${c.sub + 1}` : "")));
    }
  }
  let last = t.x.length - 1;
  const rowEmpty = (r: number) => cols.every((c) => (c.kind === "x" ? t.x[r]
    : c.kind === "rowTitle" ? t.rowTitles[r]
      : t.datasets[c.dataset].rows[r]?.[c.sub] ?? "").trim() === "");
  while (last > 0 && rowEmpty(last)) last--;
  for (let r = 0; r <= last; r++) {
    out.push(cols.map((c) => {
      if (c.kind === "rowTitle") return t.rowTitles[r] ?? "";
      const raw = (c.kind === "x" ? t.x[r] : t.datasets[c.dataset].rows[r]?.[c.sub]) ?? "";
      const ex = raw.trim() !== "" && isExcluded(t, c.kind === "x"
        ? { kind: "x", row: r } : { kind: "y", dataset: c.dataset, row: r, sub: c.sub });
      if (!ex || o.excluded === "asis") return raw;
      return o.excluded === "blank" ? "" : `${raw}*`;
    }));
  }
  return o.decimal === "," ? out.map((row, i) =>
    (o.titles && i === 0 ? row : row.map(commaDecimal))) : out;
}

/** "1.5" -> "1,5" for numbers (text cells unchanged). */
function commaDecimal(v: string): string {
  const star = v.endsWith("*");
  const body = star ? v.slice(0, -1) : v;
  if (parseCell(body) === null) return v;
  return body.replace(".", ",") + (star ? "*" : "");
}

/** Rows of text -> CSV (comma-separated, or semicolon-separated when the
 *  decimal separator is a comma) or TSV. CSV fields holding the
 *  separator, quotes or line breaks are quoted; TSV fields have tabs and
 *  line breaks replaced by spaces. Lines end with CRLF in CSV (RFC 4180)
 *  and LF in TSV. */
export function toDelimited(m: string[][], kind: "csv" | "tsv",
  decimal: "." | "," = "."): string {
  if (kind === "tsv") {
    return m.map((r) => r.map((v) => v.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n") + "\n";
  }
  const sep = decimal === "," ? ";" : ",";
  const quote = (v: string) => (v.includes(sep) || /["\r\n]/.test(v) || /^\s|\s$/.test(v)
    ? `"${v.replace(/"/g, '""')}"` : v);
  return m.map((r) => r.map(quote).join(sep)).join("\r\n") + "\r\n";
}

/** A file name slug: "Dose response (2)" -> "dose-response-2". */
export function fileSlug(name: string, fallback = "table"): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}
