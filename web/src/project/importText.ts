// Importing delimited text (CSV / TSV / semicolon / space separated, or a
// spreadsheet sheet already read into a matrix) into any data table.
//
// The pipeline mirrors the four steps of the Import dialog:
//   Source    parse text with a delimiter and decimal separator, skip
//             leading lines (notes, units, instrument headers)
//   View      choose what each source column becomes: X, Y, row titles,
//             or nothing
//   Filter    keep a range of rows / columns, every k-th row, drop rows
//             whose X is blank, blank out a missing-value code, read a
//             trailing * as "excluded"
//   Placement replace the table, append below it, or write at a given
//             cell; transpose; take column titles from the first row
// Everything here is pure and unit-tested; the dialog only holds state.
import {
  addDataset, allowsSummaryFormat, defaultDatasetName, flatColumns, hasAnyValue,
  insertRows, normalizeTable, setExcluded, tableShape, type CellRef,
} from "./table.ts";
import type { DataColumn, DataTableModel } from "./types.ts";
import { SUBCOLUMN_FORMAT_TITLES } from "./types.ts";

export type DelimiterChoice = "auto" | "tab" | "comma" | "semicolon" | "space";
export type DelimiterChar = "\t" | "," | ";" | " ";
export type DecimalChoice = "auto" | "." | ",";

const DELIM_CHAR: Record<Exclude<DelimiterChoice, "auto">, DelimiterChar> = {
  tab: "\t", comma: ",", semicolon: ";", space: " ",
};

export const DELIMITER_LABELS: Record<DelimiterChar, string> = {
  "\t": "tab", ",": "comma", ";": "semicolon", " ": "space",
};

/** Split delimited text into rows of fields. Fields may be quoted with
 *  double quotes (which may contain the delimiter, newlines and "" for a
 *  literal quote). With the space delimiter, runs of spaces count as one.
 *  A trailing empty line is dropped. */
export function splitDelimited(text: string, delim: DelimiterChar): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  const endField = () => {
    row.push(field);
    field = "";
    wasQuoted = false;
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === "" && !wasQuoted) {
      quoted = true; wasQuoted = true; field = ""; continue;
    }
    if (ch === "\n") { endField(); rows.push(row); row = []; continue; }
    if (delim === " " ? ch === " " || ch === "\t" : ch === delim) {
      if (delim === " " && field === "" && !wasQuoted) {
        // collapse runs of spaces (and ignore leading ones)
        if (row.length === 0 || src[i - 1] === " " || src[i - 1] === "\t") continue;
      }
      endField();
      continue;
    }
    field += ch;
  }
  if (field !== "" || wasQuoted || row.length) { endField(); rows.push(row); }
  if (delim === " ") {
    for (const r of rows) while (r.length > 1 && r[r.length - 1] === "") r.pop();
  }
  return rows;
}

/** Guess the delimiter from the first lines: the candidate that splits
 *  them into the same number (> 1) of fields most consistently. Ties go
 *  to tab, then semicolon, then comma, then space. */
export function detectDelimiter(text: string): DelimiterChar {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim()).slice(0, 25);
  if (!lines.length) return "\t";
  const sample = lines.join("\n");
  let best: DelimiterChar = "\t";
  let bestScore = 0;
  for (const d of ["\t", ";", ",", " "] as DelimiterChar[]) {
    const counts = splitDelimited(sample, d).map((r) => r.length);
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    let mode = 1;
    let modeN = 0;
    for (const [c, n] of freq) if (n > modeN || (n === modeN && c > mode)) { mode = c; modeN = n; }
    if (mode < 2) continue;
    const score = modeN / counts.length + (d === " " ? -0.2 : 0);
    if (score > bestScore + 1e-9) { best = d; bestScore = score; }
  }
  return best;
}

const COMMA_DECIMAL = /^[+-]?\d*,\d+(?:[eE][+-]?\d+)?$/;
const DOT_DECIMAL = /^[+-]?\d*\.\d+(?:[eE][+-]?\d+)?$/;

/** Guess the decimal separator: comma when comma-decimal numbers (1,5)
 *  outnumber dot-decimal ones (1.5). */
export function detectDecimal(rows: string[][]): "." | "," {
  let comma = 0;
  let dot = 0;
  for (const r of rows.slice(0, 200)) {
    for (const c of r) {
      const s = c.trim();
      if (COMMA_DECIMAL.test(s)) comma++;
      else if (DOT_DECIMAL.test(s)) dot++;
    }
  }
  return comma > dot ? "," : ".";
}

/** One cell's text with the decimal separator made a point, so 1,5 reads
 *  1.5 (and 1.234,5 reads 1234.5) with decimal ","; and 1,234.5 reads
 *  1234.5 with decimal ".". Non-numbers come back trimmed, unchanged. */
export function normalizeNumber(cell: string, decimal: "." | ","): string {
  const s = cell.trim();
  if (decimal === ",") {
    // 1,5  -1,5e-3  ,5 -> point decimal
    if (/^[+-]?\d*,\d+([eE][+-]?\d+)?$/.test(s)) return s.replace(",", ".");
    // 1.234,5 or 1.234 -> thousands points dropped (never with an
    // exponent: 3.162e-9 is already a point-decimal number)
    if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return s.replace(/\./g, "").replace(",", ".");
    return s;
  }
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return s.replace(/,/g, "");
  return s;
}

export function transpose(m: string[][]): string[][] {
  const w = Math.max(0, ...m.map((r) => r.length));
  return Array.from({ length: w }, (_, c) => m.map((r) => r[c] ?? ""));
}

export interface SourceOptions {
  delimiter: DelimiterChoice;
  decimal: DecimalChoice;
  skipLines: number;         // lines before the data (or the titles row)
  transpose: boolean;        // rows of the source become columns
  titlesRow: boolean;        // first row (after skipping) holds titles
}

export interface FilterOptions {
  rowFrom: number;           // 1-based data row, inclusive (0 or 1 = first)
  rowTo: number | null;      // inclusive; null = last
  everyK: number;            // keep one row, skip k - 1 (1 = keep all)
  colFrom: number;           // 1-based source column, inclusive
  colTo: number | null;
  missingCode: string;       // e.g. "99" or "NA": read as blank
  skipBlankX: boolean;       // drop rows whose X is blank
  asteriskExcluded: boolean; // 12.5* -> value 12.5, excluded
  /** Indexed ("stacked") data: values in one source column, group ids in
   *  another; each group becomes a column (1-based source columns). */
  unstack: { dataCol: number; groupCol: number } | null;
}

export const DEFAULT_SOURCE: SourceOptions = {
  delimiter: "auto", decimal: "auto", skipLines: 0, transpose: false, titlesRow: false,
};

export const DEFAULT_FILTER: FilterOptions = {
  rowFrom: 1, rowTo: null, everyK: 1, colFrom: 1, colTo: null,
  missingCode: "", skipBlankX: false, asteriskExcluded: true, unstack: null,
};

/** What the source holds after the Source and Filter steps. */
export interface ImportPreview {
  delimiter: DelimiterChar | null;   // null for a spreadsheet matrix
  decimal: "." | ",";
  titles: string[] | null;           // per kept column
  columns: number[];                 // 1-based source column of each kept column
  rows: string[][];                  // kept rows x kept columns
  /** The same cells as typed in the source (trimmed; no missing code,
   *  decimal or * treatment): identifiers are written from these, and
   *  the paste report compares them with what was stored. */
  raw?: string[][];
  totalRows: number;                 // data rows before filtering
  totalColumns: number;
}

/** Source + Filter steps. `source` is raw text, or a matrix already read
 *  from a spreadsheet (then delimiter and decimal choices do not apply,
 *  except that text cells still get the decimal treatment). */
export function prepareImport(source: string | string[][], s: SourceOptions,
  f: FilterOptions): ImportPreview {
  let delimiter: DelimiterChar | null = null;
  let m: string[][];
  if (typeof source === "string") {
    const body = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n")
      .split("\n").slice(Math.max(0, s.skipLines)).join("\n");
    delimiter = s.delimiter === "auto" ? detectDelimiter(body) : DELIM_CHAR[s.delimiter];
    m = splitDelimited(body, delimiter);
  } else {
    m = source.slice(Math.max(0, s.skipLines)).map((r) => r.map((c) => c ?? ""));
  }
  // drop trailing blank rows
  while (m.length && m[m.length - 1].every((c) => c.trim() === "")) m.pop();
  if (s.transpose) m = transpose(m);
  let titles: string[] | null = null;
  if (s.titlesRow && m.length) { titles = m[0].map((c) => c.trim()); m = m.slice(1); }
  const width = Math.max(0, ...m.map((r) => r.length), titles?.length ?? 0);
  const decimal = s.decimal === "auto"
    ? (delimiter === "," ? "." : detectDecimal(m)) : s.decimal;

  const c0 = Math.max(1, f.colFrom || 1);
  const c1 = Math.min(width, f.colTo ?? width);
  const columns: number[] = [];
  for (let c = c0; c <= c1; c++) columns.push(c);
  const r0 = Math.max(1, f.rowFrom || 1);
  const r1 = Math.min(m.length, f.rowTo ?? m.length);
  const k = Math.max(1, Math.floor(f.everyK || 1));
  const code = f.missingCode.trim();
  const cellAt = (src: string[], c: number) => {
    const raw = (src[c - 1] ?? "").trim();
    if (code && raw === code) return "";
    const star = raw.endsWith("*");
    const body = star ? raw.slice(0, -1) : raw;
    const v = normalizeNumber(body, decimal);
    return star ? `${v}*` : v;
  };
  const rawAt = (src: string[], c: number) => (src[c - 1] ?? "").trim();
  const rows: string[][] = [];
  const raw: string[][] = [];
  const keptRows: string[][] = [];
  for (let r = r0; r <= r1; r++) {
    if ((r - r0) % k !== 0) continue;
    const src = m[r - 1];
    keptRows.push(src);
    rows.push(columns.map((c) => cellAt(src, c)));
    raw.push(columns.map((c) => rawAt(src, c)));
  }
  if (f.unstack && f.unstack.dataCol >= 1 && f.unstack.groupCol >= 1) {
    // one column per group id: numeric ids in ascending order, text ids
    // in order of appearance; values keep their order within a group
    const by = new Map<string, string[]>();
    const byRaw = new Map<string, string[]>();
    for (const src of keptRows) {
      const id = cellAt(src, f.unstack.groupCol).replace(/\*$/, "");
      if (!id) continue;
      if (!by.has(id)) { by.set(id, []); byRaw.set(id, []); }
      by.get(id)!.push(cellAt(src, f.unstack.dataCol));
      byRaw.get(id)!.push(rawAt(src, f.unstack.dataCol));
    }
    const ids = [...by.keys()];
    if (ids.every((id) => Number.isFinite(Number(id)))) ids.sort((a, b) => Number(a) - Number(b));
    const height = Math.max(0, ...ids.map((id) => by.get(id)!.length));
    return {
      delimiter, decimal,
      titles: ids,
      // synthetic column numbers past the source's own, so role choices
      // made for the unstacked view do not collide with source columns
      columns: ids.map((_, i) => width + 1 + i),
      rows: Array.from({ length: height }, (_, r) => ids.map((id) => by.get(id)![r] ?? "")),
      raw: Array.from({ length: height }, (_, r) => ids.map((id) => byRaw.get(id)![r] ?? "")),
      totalRows: m.length, totalColumns: width,
    };
  }
  return {
    delimiter, decimal,
    titles: titles ? columns.map((c) => titles![c - 1] ?? "") : null,
    columns, rows, raw, totalRows: m.length, totalColumns: width,
  };
}

// ------------------------------------------------------------ placement

export type ColumnRole = "x" | "y" | "rowTitle" | "ignore";

const isNumeric = (v: string) => {
  const s = v.trim().replace(/\*$/, "");
  return s !== "" && Number.isFinite(Number(s));
};

/** Starting roles: X first on XY tables; a mostly-text first column
 *  becomes row titles on tables that have them; the rest are Y. */
export function defaultRoles(t: DataTableModel, p: ImportPreview): ColumnRole[] {
  const shape = tableShape(t.type);
  const roles: ColumnRole[] = p.columns.map(() => "y");
  if (!roles.length) return roles;
  const first = p.rows.map((r) => r[0] ?? "").filter((v) => v.trim());
  const textFirst = first.length > 0
    && first.filter((v) => !isNumeric(v)).length > first.length / 2;
  if (shape.hasX && t.xFormat !== "numbers") roles[0] = "x";
  else if (shape.hasX) {
    roles[0] = textFirst && shape.hasRowTitles ? "rowTitle" : "x";
  } else if (shape.hasRowTitles && textFirst) roles[0] = "rowTitle";
  return roles;
}

export interface PlacementOptions {
  mode: "replace" | "append" | "insert";
  row: number;               // insert: top row (0-based)
  col: number;               // insert: flat grid column of the first Y value
  perDataset: number;        // Y columns per new dataset (replicates)
  useTitles: boolean;        // name datasets / X from the titles row
}

/** Subcolumns a new dataset gets when imported values create it. */
export function importWidth(t: DataTableModel, perDataset: number): number {
  if (t.type === "survival") return 2;
  const fmt = SUBCOLUMN_FORMAT_TITLES[t.subcolumnFormat] ?? [];
  if (allowsSummaryFormat(t.type) && fmt.length) return fmt.length;
  if (!tableShape(t.type).hasSubcolumns) return 1;
  return Math.max(1, Math.min(24, Math.floor(perDataset) || 1));
}

function lastUsedRow(t: DataTableModel): number {
  for (let r = t.x.length - 1; r >= 0; r--) {
    if ((t.x[r] ?? "").trim() || (t.rowTitles[r] ?? "").trim()) return r;
    if (t.datasets.some((d) => d.rows[r]?.some((v) => v.trim()))) return r;
  }
  return -1;
}

/** A cell an import wrote: grid row, flat grid column (in the returned
 *  table), the source text and whether a trailing * excluded it. */
export interface WrittenCell { row: number; col: number; raw: string; starred?: boolean }

/** Apply an import to table t and return the new table. Y source columns
 *  fill the table's Y subcolumns left to right (a new dataset begins
 *  every `perDataset` columns when the table must grow). */
export function applyImport(t: DataTableModel, p: ImportPreview, roles: ColumnRole[],
  pl: PlacementOptions, f: Pick<FilterOptions, "skipBlankX" | "asteriskExcluded">):
  DataTableModel {
  return applyImportWithCells(t, p, roles, pl, f).table;
}

/** A column of identifiers rather than numbers: any value with a leading
 *  zero (0001234, 007) is a code, never the number it spells. */
export function looksLikeIdentifiers(values: string[]): boolean {
  return values.some((v) => /^[+-]?0\d+$/.test(v.trim()));
}

/** applyImport, also listing every cell it wrote (for the paste report).
 *  Identifiers are written exactly as typed: row titles, X dates and
 *  times, and text (categorical) variables of a multiple-variables table
 *  take the source text without decimal or * treatment. */
export function applyImportWithCells(t: DataTableModel, p: ImportPreview, roles: ColumnRole[],
  pl: PlacementOptions, f: Pick<FilterOptions, "skipBlankX" | "asteriskExcluded">):
  { table: DataTableModel; written: WrittenCell[] } {
  const shape = tableShape(t.type);
  const xi = shape.hasX ? roles.indexOf("x") : -1;
  const ti = shape.hasRowTitles ? roles.indexOf("rowTitle") : -1;
  const yi = roles.map((r, i) => (r === "y" ? i : -1)).filter((i) => i >= 0);
  const srcRaw = p.raw ?? p.rows;
  let keep = p.rows.map((_, i) => i);
  if (f.skipBlankX && xi >= 0) keep = keep.filter((i) => (p.rows[i][xi] ?? "").trim() !== "");
  const rows = keep.map((i) => p.rows[i]);
  const rawRows = keep.map((i) => srcRaw[i] ?? p.rows[i]);
  const excludedCells: { row: number; src: number }[] = [];
  const val = (r: number, c: number): string => {
    const raw = (rows[r]?.[c] ?? "").trim();
    if (raw.endsWith("*")) {
      if (f.asteriskExcluded) excludedCells.push({ row: r, src: c });
      return raw.slice(0, -1).trim();
    }
    return raw;
  };
  // identifiers: as typed (dates and times lose only an exclusion *)
  const asTyped = (r: number, c: number): string => (rawRows[r]?.[c] ?? "").trim();
  const timeX = xi >= 0 && t.xFormat !== "numbers";
  const xVal = (r: number): string => {
    if (!timeX) return val(r, xi);
    const raw = asTyped(r, xi);
    if (raw.endsWith("*") && raw.length > 1) {
      if (f.asteriskExcluded) excludedCells.push({ row: r, src: xi });
      return raw.slice(0, -1).trim();
    }
    return raw;
  };
  const width = importWidth(t, pl.perDataset);
  const title = (c: number) => (pl.useTitles ? p.titles?.[c]?.trim() ?? "" : "");

  let next: DataTableModel;
  let startRow: number;
  let yStart: number; // index into the table's Y flat columns
  if (pl.mode === "replace") {
    const nDs = Math.max(1, Math.ceil(yi.length / width));
    const fmtTitles = SUBCOLUMN_FORMAT_TITLES[t.subcolumnFormat] ?? [];
    const datasets: DataColumn[] = Array.from({ length: nDs }, (_, d) => {
      const col: DataColumn = {
        name: datasetTitle(yi.slice(d * width, d * width + width).map(title))
          || t.datasets[d]?.name || defaultDatasetName(t.type, d),
        rows: Array.from({ length: Math.max(1, rows.length) },
          () => Array<string>(width).fill("")),
      };
      if (t.type === "survival") col.subTitles = ["Time", "Event"];
      else if (allowsSummaryFormat(t.type) && fmtTitles.length) col.subTitles = [...fmtTitles];
      if (t.type === "multivariable") {
        const vals = rows.map((r) => (r[yi[d] ?? -1] ?? "").replace(/\*$/, "").trim())
          .filter(Boolean);
        col.varType = vals.some((v) => !isNumeric(v)) || looksLikeIdentifiers(vals)
          ? "categorical" : "continuous";
      }
      return col;
    });
    next = normalizeTable({
      ...t,
      x: Array(Math.max(1, rows.length)).fill(""),
      rowTitles: Array(Math.max(1, rows.length)).fill(""),
      datasets,
    }, t.type);
    delete next.xExcluded;
    if (xi >= 0 && title(xi)) next.xTitle = title(xi);
    startRow = 0;
    yStart = 0;
  } else {
    next = t;
    const firstY = flatColumns(t).findIndex((c) => c.kind === "y");
    startRow = pl.mode === "append" ? lastUsedRow(t) + 1 : Math.max(0, pl.row);
    yStart = pl.mode === "append" ? 0 : Math.max(0, pl.col - firstY);
    const needRows = startRow + rows.length;
    if (needRows > next.x.length) next = insertRows(next, next.x.length, needRows - next.x.length);
    const yCount = () => flatColumns(next).filter((c) => c.kind === "y").length;
    while (yCount() < yStart + yi.length) {
      const before = next.datasets.length;
      next = addDataset(next);
      // a new dataset takes the import's replicate count, not the template's
      const d = next.datasets[before];
      if (tableShape(t.type).hasSubcolumns && t.subcolumnFormat === "replicates"
        && t.type !== "survival" && d.rows[0]?.length !== width) {
        next = {
          ...next,
          datasets: next.datasets.map((x, i) => (i === before
            ? { ...x, rows: x.rows.map(() => Array<string>(width).fill("")) } : x)),
        };
      }
    }
  }

  const yFlat = flatColumns(next).filter(
    (c): c is { kind: "y"; dataset: number; sub: number } => c.kind === "y");
  const x = [...next.x];
  const rowTitles = [...next.rowTitles];
  const datasets = next.datasets.map((d) => ({ ...d, rows: d.rows.map((r) => [...r]) }));
  const categorical = (ds: number) => t.type === "multivariable"
    && datasets[ds]?.varType === "categorical";
  const refs: CellRef[] = [];
  const excludedSet = () => new Set(excludedCells.map((e) => `${e.row}:${e.src}`));
  for (let r = 0; r < rows.length; r++) {
    const tr = startRow + r;
    if (xi >= 0) x[tr] = xVal(r);
    if (ti >= 0) rowTitles[tr] = asTyped(r, ti);
    yi.forEach((src, j) => {
      const target = yFlat[yStart + j];
      if (target) {
        datasets[target.dataset].rows[tr][target.sub] = categorical(target.dataset)
          ? asTyped(r, src) : val(r, src);
      }
    });
  }
  const ex = excludedSet();
  for (let r = 0; r < rows.length; r++) {
    const tr = startRow + r;
    if (xi >= 0 && ex.has(`${r}:${xi}`)) refs.push({ kind: "x", row: tr });
    yi.forEach((src, j) => {
      const target = yFlat[yStart + j];
      if (target && ex.has(`${r}:${src}`)) {
        refs.push({ kind: "y", dataset: target.dataset, row: tr, sub: target.sub });
      }
    });
  }
  if (pl.mode !== "replace" && pl.useTitles && p.titles) {
    // each data set the import reaches is named from the titles of the
    // source columns that land in it (their stem, for replicates)
    const byDataset = new Map<number, string[]>();
    yi.forEach((src, j) => {
      const target = yFlat[yStart + j];
      if (!target) return;
      if (!byDataset.has(target.dataset)) byDataset.set(target.dataset, []);
      byDataset.get(target.dataset)!.push(title(src));
    });
    for (const [d, titles] of byDataset) {
      const name = datasetTitle(titles);
      if (name) datasets[d].name = name;
    }
    if (xi >= 0 && title(xi)) next = { ...next, xTitle: title(xi) };
  }
  next = { ...next, x, rowTitles, datasets };
  // the header above the row titles names the row factor (two-way ANOVA)
  if (ti >= 0 && title(ti) && (t.type === "grouped" || t.type === "column")) {
    next = { ...next, factorNames: { ...next.factorNames, rows: title(ti) } };
  }
  if (pl.mode !== "replace") next = dropUnfilledDatasets(t, next);
  const table = refs.length ? setExcluded(next, refs, true) : next;

  // where each source cell landed (flat columns of the final table)
  const flat = flatColumns(table);
  const xCol = flat.findIndex((c) => c.kind === "x");
  const tCol = flat.findIndex((c) => c.kind === "rowTitle");
  const yCol = (dataset: number, sub: number) =>
    flat.findIndex((c) => c.kind === "y" && c.dataset === dataset && c.sub === sub);
  const written: WrittenCell[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = startRow + r;
    const push = (col: number, src: number) => {
      if (col < 0) return;
      const cell: WrittenCell = { row, col, raw: rawRows[r]?.[src] ?? "" };
      if (ex.has(`${r}:${src}`)) cell.starred = true;
      written.push(cell);
    };
    if (xi >= 0) push(xCol, xi);
    if (ti >= 0) push(tCol, ti);
    yi.forEach((src, j) => {
      const target = yFlat[yStart + j];
      if (target) push(yCol(target.dataset, target.sub), src);
    });
  }
  return { table, written };
}

/** Does the first row (after the skipped lines) hold column titles? Yes
 *  when, in at least one column whose values below are numbers, the first
 *  cell is text, and no such column starts with a number. Columns of text
 *  (group labels) say nothing either way. */
export function detectTitlesRow(source: string | string[][], s: SourceOptions): boolean {
  const p = prepareImport(source, { ...s, titlesRow: false }, DEFAULT_FILTER);
  if (p.rows.length < 2) return false;
  const body = p.rows.slice(1, 201);
  let textOverNumbers = 0;
  for (let c = 0; c < p.columns.length; c++) {
    const vals = body.map((r) => (r[c] ?? "").trim()).filter((v) => v !== "");
    if (!vals.length) continue;
    const numeric = vals.filter(isNumeric).length / vals.length >= 0.8;
    if (!numeric) continue;
    const head = (p.rows[0][c] ?? "").trim();
    if (head === "") continue;
    if (isNumeric(head)) return false;
    textOverNumbers++;
  }
  return textOverNumbers > 0;
}

/** Name of a data set from the titles of its source columns: the title
 *  itself, or for replicates the shared stem ("treated_1", "treated_2"
 *  -> "treated"; "A1", "A2" -> "A"). */
export function datasetTitle(titles: string[]): string {
  const ts = titles.map((t) => t.trim()).filter(Boolean);
  if (ts.length <= 1) return ts[0] ?? "";
  let pre = ts[0];
  for (const t of ts.slice(1)) {
    let i = 0;
    while (i < pre.length && i < t.length && pre[i] === t[i]) i++;
    pre = pre.slice(0, i);
  }
  // a stem ends before the replicate number and its separator
  const stem = pre.replace(/[\s_\-.:#(]*\d*$/, "").replace(/[\s_\-.:#(]+$/, "");
  return stem || ts[0];
}

/** After pasting or importing into a table that held no values: drop the
 *  trailing data sets the new values did not reach and that still have
 *  their default names (a three-group column table pasted with two
 *  columns keeps two groups). A paste that fills one data set keeps the
 *  others, which are likely to be filled next. */
export function dropUnfilledDatasets(before: DataTableModel, after: DataTableModel):
  DataTableModel {
  if (hasAnyValue(before) || after.type === "contingency") return after;
  const filled = (d: DataColumn) => d.rows.some((r) => r.some((v) => v.trim() !== ""));
  let keep = after.datasets.length;
  while (keep > 1) {
    const i = keep - 1;
    const d = after.datasets[i];
    if (filled(d) || d.name !== defaultDatasetName(after.type, i)) break;
    keep--;
  }
  // a single pasted column is often the first of several: keep the rest
  if (keep === after.datasets.length
    || after.datasets.slice(0, keep).filter(filled).length < 2) return after;
  return { ...after, datasets: after.datasets.slice(0, keep) };
}

/** Heuristic for the grid: a paste big or odd enough that the Import
 *  dialog (delimiter, decimal comma, skipping rows) is worth offering. */
export function pasteNeedsImport(text: string): boolean {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  if (lines.length >= 60) return true;
  const hasTab = lines.some((l) => l.includes("\t"));
  // a spreadsheet block with a titles row: the dialog reads the titles as
  // data set names instead of pasting them as values
  if (hasTab) return detectTitlesRow(text, DEFAULT_SOURCE);
  // several lines but no tabs: comma / semicolon separated text
  return lines.filter((l) => /[;,]/.test(l)).length >= Math.ceil(lines.length / 2);
}
