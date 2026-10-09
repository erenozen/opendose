// What a paste or an import did to every cell it wrote: numbers read,
// blanks and error codes kept as missing, text left as text (never read
// as 0), identifiers kept exactly as typed, values marked * excluded.
// The grid shows it as a one-line strip after each paste / import
// ("412 numbers · 3 blanks kept as missing · 2 cells read as text, not 0:
// B7, C12 · nothing was converted to 0"). Pure; unit-tested.
//
// Cells are named like spreadsheet cells: the grid's columns lettered left
// to right (A = the first column of the grid: row titles or X when the
// table has them) and its rows numbered from 1, so a block pasted at the
// top-left of the grid keeps the addresses it had in the spreadsheet.
import {
  datasetLetter, flatColumns, parseCell, pasteBlock, setExcluded,
  setVarType, type CellRef,
} from "./table.ts";
import { dropUnfilledDatasets } from "./importText.ts";
import type { DataTableModel } from "./types.ts";
import { xInvalid } from "./xformat.ts";

/** What a grid column holds: numbers (Y values, numeric X), identifiers
 *  kept as typed (row titles, categorical variables), or dates / times. */
export type CellRole = "number" | "label" | "time";

/** One cell a paste or import wrote: its grid position (row, flat
 *  column), the source text and what the table now stores. */
export interface PlacedCell {
  row: number;
  col: number;
  raw: string;
  stored: string;
  role: CellRole;
  /** Marked excluded by a trailing * in the source. */
  starred?: boolean;
  /** Dates / times: the stored text reads as one. */
  timeOk?: boolean;
}

export interface CellNote {
  addr: string;
  row: number;
  col: number;
  /** The cell's text (what was pasted). */
  text: string;
  /** For converted cells: the number now stored. */
  to?: string;
}

export interface PasteReport {
  cells: number;
  numbers: number;
  blanks: CellNote[];
  /** Spreadsheet errors (#DIV/0!, #N/A, …) and missing-value codes (NA,
   *  n.d., -): kept as missing, their text visible in the cell. */
  missing: CellNote[];
  /** Other text in a numeric column: kept as typed, read as missing. */
  text: CellNote[];
  /** Number-like text with a decimal comma or thousands separators that
   *  the grid does not read (the Import dialog can). */
  localeNumbers: CellNote[];
  /** Decimal commas / thousands separators the Import step converted. */
  converted: CellNote[];
  /** Values followed by * : the number is kept and excluded. */
  excluded: CellNote[];
  /** Dates or times in a date / time X column that do not read as one. */
  timesUnread: CellNote[];
  /** Identifiers (row titles, categorical values, dates) kept exactly as
   *  typed. */
  labels: number;
  /** Cells that read as 0 although their source was not a number. The
   *  grid guarantees this stays empty; the strip says so loudly if not. */
  zeros: CellNote[];
}

// ------------------------------------------------------------ classifying

/** A plain decimal number as the grid reads it (parseCell): sign, digits,
 *  point, exponent. */
export const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

const EXCEL_ERROR = /^#(DIV\/0!|N\/A|VALUE!|REF!|NAME\?|NUM!|NULL!|SPILL!|CALC!|FIELD!|BLOCKED!|CONNECT!|BUSY!|UNKNOWN!|GETTING_DATA)$/i;

const MISSING_CODES = new Set([
  "na", "n/a", "n.a.", "nan", "null", "none", "nd", "n.d.", "-", "--", "—", "–", ".", "?",
  "missing", "undetermined", "undet.", "#n/a",
]);

/** A spreadsheet formula error such as #DIV/0!, #N/A or #VALUE!. */
export function isSpreadsheetError(s: string): boolean {
  return EXCEL_ERROR.test(s.trim());
}

/** A common missing-value code (NA, NaN, n.d., -, …) or spreadsheet error. */
export function isMissingCode(s: string): boolean {
  const t = s.trim();
  return isSpreadsheetError(t) || MISSING_CODES.has(t.toLowerCase());
}

/** Number-like text the grid does not read: a decimal comma (1,5),
 *  thousands separators (1,234.5 / 1.234,5 / 1 234) or a number with a
 *  unit or percent sign is not included (that is text). */
export function looksLikeLocaleNumber(s: string): boolean {
  const t = s.trim();
  if (NUMBER_RE.test(t)) return false;
  return /^[+-]?\d*,\d+([eE][+-]?\d+)?$/.test(t)
    || /^[+-]?\d{1,3}([,.   ]\d{3})+([.,]\d+)?$/.test(t);
}

export type CellClass = "number" | "blank" | "missing" | "text" | "localeNumber";

/** How the grid reads a stored cell of a numeric column. */
export function classifyValue(stored: string): CellClass {
  const s = stored.trim();
  if (s === "") return "blank";
  if (parseCell(s) !== null) return "number";
  if (isMissingCode(s)) return "missing";
  if (looksLikeLocaleNumber(s)) return "localeNumber";
  return "text";
}

/** Spreadsheet address of a grid cell: column letters, row number. */
export function cellAddress(row: number, col: number): string {
  return `${datasetLetter(col)}${row + 1}`;
}

/** What each flat grid column holds. */
export function columnRoles(t: DataTableModel): CellRole[] {
  return flatColumns(t).map((c) => {
    if (c.kind === "rowTitle") return "label";
    if (c.kind === "x") return t.xFormat === "numbers" ? "number" : "time";
    return t.type === "multivariable" && t.datasets[c.dataset]?.varType === "categorical"
      ? "label" : "number";
  });
}

function storedAt(t: DataTableModel, row: number, col: number): string | null {
  const c = flatColumns(t)[col];
  if (!c || row < 0 || row >= t.x.length) return null;
  if (c.kind === "x") return t.x[row] ?? "";
  if (c.kind === "rowTitle") return t.rowTitles[row] ?? "";
  return t.datasets[c.dataset]?.rows[row]?.[c.sub] ?? "";
}

/** The cells written, read back from the table they were written into. */
export function placedCells(after: DataTableModel,
  cells: { row: number; col: number; raw: string; starred?: boolean }[]): PlacedCell[] {
  const roles = columnRoles(after);
  const out: PlacedCell[] = [];
  for (const c of cells) {
    const stored = storedAt(after, c.row, c.col);
    if (stored === null) continue;
    const role = roles[c.col];
    const p: PlacedCell = { row: c.row, col: c.col, raw: c.raw, stored, role };
    if (c.starred) p.starred = true;
    if (role === "time") p.timeOk = stored.trim() === "" || !xInvalid(after, stored);
    out.push(p);
  }
  return out;
}

const sansStar = (s: string) => s.trim().replace(/\*$/, "").trim();

/** Count and name what happened to every written cell. */
export function pasteReport(cells: PlacedCell[]): PasteReport {
  const r: PasteReport = {
    cells: cells.length, numbers: 0, blanks: [], missing: [], text: [], localeNumbers: [],
    converted: [], excluded: [], timesUnread: [], labels: 0, zeros: [],
  };
  for (const c of cells) {
    const note = (extra: Partial<CellNote> = {}): CellNote => ({
      addr: cellAddress(c.row, c.col), row: c.row, col: c.col, text: c.raw.trim(), ...extra,
    });
    const raw = sansStar(c.raw);
    if (c.role === "label") {
      if (c.stored.trim() !== "") r.labels++;
      continue;
    }
    if (c.role === "time") {
      if (c.stored.trim() === "") { if (raw === "") r.blanks.push(note()); else r.missing.push(note()); }
      else if (c.timeOk) r.labels++;
      else r.timesUnread.push(note());
      continue;
    }
    const kind = classifyValue(c.stored);
    if (kind === "number") {
      r.numbers++;
      const value = parseCell(c.stored);
      // a value of 0 must come from a 0 in the source
      if (value === 0 && !NUMBER_RE.test(raw) && !looksLikeLocaleNumber(raw)) r.zeros.push(note());
      else if (raw !== sansStar(c.stored) && looksLikeLocaleNumber(raw)) {
        r.converted.push(note({ to: sansStar(c.stored) }));
      }
      if (c.starred) r.excluded.push(note());
    } else if (kind === "blank") {
      // a blank written for a missing-value code (Import's filter)
      if (raw !== "") r.missing.push(note()); else r.blanks.push(note());
    } else if (kind === "missing") r.missing.push(note());
    else if (kind === "localeNumber") r.localeNumbers.push(note());
    else r.text.push(note());
  }
  return r;
}

// ------------------------------------------------------------ wording

export interface ReportPart {
  key: "numbers" | "blanks" | "missing" | "text" | "localeNumbers" | "converted" | "excluded"
    | "timesUnread" | "labels" | "zeros";
  /** Words before the cell list, e.g. "2 cells read as text, not 0". */
  label: string;
  cells: CellNote[];
  tone: "ok" | "info" | "warn";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The report as the strip's parts, in reading order. */
export function reportParts(r: PasteReport): ReportPart[] {
  const parts: ReportPart[] = [];
  parts.push({ key: "numbers", label: plural(r.numbers, "number", "numbers"), cells: [], tone: "ok" });
  if (r.blanks.length) {
    parts.push({ key: "blanks", label: `${plural(r.blanks.length, "blank", "blanks")} kept as missing`,
      cells: r.blanks, tone: "info" });
  }
  if (r.missing.length) {
    const errors = r.missing.every((c) => isSpreadsheetError(c.text));
    parts.push({ key: "missing", label: `${plural(r.missing.length,
      errors ? "spreadsheet error" : "missing-value code",
      errors ? "spreadsheet errors" : "error or missing-value codes")} kept as missing`,
    cells: r.missing, tone: "info" });
  }
  if (r.text.length) {
    parts.push({ key: "text", label: `${plural(r.text.length, "cell", "cells")} read as text, not 0`,
      cells: r.text, tone: "warn" });
  }
  if (r.localeNumbers.length) {
    parts.push({ key: "localeNumbers", label: `${plural(r.localeNumbers.length, "number", "numbers")}`
      + " with a comma or thousands separator kept as text (not read)",
    cells: r.localeNumbers, tone: "warn" });
  }
  if (r.converted.length) {
    parts.push({ key: "converted", label: `${plural(r.converted.length, "decimal comma or separator",
      "decimal commas or separators")} read as numbers`, cells: r.converted, tone: "info" });
  }
  if (r.excluded.length) {
    parts.push({ key: "excluded", label: `${plural(r.excluded.length, "value", "values")} marked * kept and excluded`,
      cells: r.excluded, tone: "info" });
  }
  if (r.timesUnread.length) {
    parts.push({ key: "timesUnread", label: `${plural(r.timesUnread.length, "date or time", "dates or times")}`
      + " not read (treated as blank)", cells: r.timesUnread, tone: "warn" });
  }
  if (r.labels) {
    parts.push({ key: "labels", label: `${plural(r.labels, "label", "labels")} kept exactly as typed`,
      cells: [], tone: "ok" });
  }
  parts.push(r.zeros.length
    ? { key: "zeros", label: `${plural(r.zeros.length, "cell", "cells")} read as 0 from text`,
      cells: r.zeros, tone: "warn" }
    : { key: "zeros", label: "nothing was converted to 0", cells: [], tone: "ok" });
  return parts;
}

/** Addresses of a part, the first `max` of them ("B7, C12 and 3 more"). */
export function cellList(cells: CellNote[], max = 6): string {
  const shown = cells.slice(0, max).map((c) => c.addr).join(", ");
  return cells.length > max ? `${shown} and ${cells.length - max} more` : shown;
}

/** The whole report on one line. */
export function reportLine(r: PasteReport, max = 6): string {
  return reportParts(r).map((p) => (p.cells.length
    ? `${p.label}: ${cellList(p.cells, max)}` : p.label)).join(" · ");
}

// ------------------------------------------------------------ pasting

/** A block pasted into the grid at (row, flat column), with what every
 *  cell became. Text is stored as typed (an identifier such as 0001234
 *  or 1E5 in a row title is never converted); a number followed by * in
 *  a numeric column is stored without the * and excluded; a column of a
 *  multiple-variables table that was empty and receives only text
 *  becomes categorical (text columns stay text). */
export function pasteWithReport(t: DataTableModel, startRow: number, startFlat: number,
  block: string[][]): { table: DataTableModel; report: PasteReport } {
  const rolesBefore = columnRoles(t);
  const starred: { row: number; col: number }[] = [];
  const cleaned = block.map((line, dr) => line.map((raw, dc) => {
    const v = raw.trim();
    const col = startFlat + dc;
    if (rolesBefore[col] === "number" && /\*$/.test(v) && NUMBER_RE.test(sansStar(v))) {
      starred.push({ row: startRow + dr, col });
      return sansStar(v);
    }
    return v;
  }));
  let next = pasteBlock(t, startRow, startFlat, cleaned);
  const cols = flatColumns(next);
  const refs: CellRef[] = [];
  for (const s of starred) {
    const c = cols[s.col];
    if (c?.kind === "x") refs.push({ kind: "x", row: s.row });
    else if (c?.kind === "y") refs.push({ kind: "y", dataset: c.dataset, row: s.row, sub: c.sub });
  }
  if (refs.length) next = setExcluded(next, refs, true);
  if (t.type === "multivariable") next = textColumnsCategorical(t, next, startFlat, cleaned);
  next = dropUnfilledDatasets(t, next);
  const starKeys = new Set(starred.map((s) => `${s.row}:${s.col}`));
  const written: { row: number; col: number; raw: string; starred?: boolean }[] = [];
  const width = cols.length;
  block.forEach((line, dr) => line.forEach((raw, dc) => {
    const col = startFlat + dc;
    if (col >= width) return;
    const row = startRow + dr;
    written.push({ row, col, raw, ...(starKeys.has(`${row}:${col}`) ? { starred: true } : {}) });
  }));
  return { table: next, report: pasteReport(placedCells(next, written)) };
}

/** Multiple-variables paste: a variable that held nothing and now holds
 *  only text (no numbers) is a categorical variable. */
function textColumnsCategorical(before: DataTableModel, after: DataTableModel, startFlat: number,
  block: string[][]): DataTableModel {
  const cols = flatColumns(after);
  const width = Math.max(0, ...block.map((l) => l.length));
  let next = after;
  for (let dc = 0; dc < width; dc++) {
    const c = cols[startFlat + dc];
    if (c?.kind !== "y") continue;
    const d = before.datasets[c.dataset];
    if (!d || d.varType === "categorical") continue;
    if (d.rows.some((r) => r.some((v) => v.trim() !== ""))) continue;
    const vals = next.datasets[c.dataset].rows.map((r) => (r[0] ?? "").trim()).filter(Boolean);
    if (vals.length && vals.every((v) => parseCell(v) === null && !isMissingCode(v))) {
      next = setVarType(next, c.dataset, "categorical");
    }
  }
  return next;
}
