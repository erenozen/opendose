// Plate-reader grids: find a microplate block anywhere in a sheet. A port
// of the engine's reader (engine/opendose/plate_io.py, locate_plate), so
// the recipes, the plate wizard and the SRB importer accept the same files
// and read them the same way; this one runs without the Python runtime,
// on text or on a worksheet already read into cells.
//
// Shape rule (as plate_io.py):
// 1. Labelled grid. The first cell in reading order holding "A" with "B"
//    directly below starts a labelled block. R = the run of consecutive
//    row labels below it (A..Z, then AA..AF). C = the run of consecutive
//    integers 1, 2, 3 … in the row above, starting one cell right of the
//    "A", when that header exists; else the column count of the known
//    format with R rows (2→3, 3→4, 4→6, 6→8, 8→12, 16→24, 32→48); else the
//    numeric extent to the right, up to a column that is text in more
//    than half the rows. Without a header a block needs numbers in at
//    least half of R × min(C, extent) cells. The labelled extent always
//    wins: 16 × 24 is never read as its top-left 8 × 12.
// 2. Bare grid (no labels): consecutive numeric rows form a block (see
//    rowKind); a blank line ends a block, a line of separators only is an
//    empty row inside it; a leading or trailing row with fewer than half
//    the block's numbers is dropped; a first row reading exactly 1..k is a
//    column header; the largest block wins (the first of equal ones).
// 3. Formats 6, 12, 24, 48, 96, 384, 1536 wells. A block that is not
//    exactly one is padded to the smallest format that holds it, with a
//    warning; one larger than 1536 is read as it stands, with a warning;
//    unread numbers beside or below it are reported. Nothing is dropped
//    silently.
// 4. A requested format that differs from the one found warns; the grid
//    is padded when the request is larger, never truncated when smaller.

/** Row labels of the formats up to 384 wells (A–P). */
export const ROW_LETTERS = "ABCDEFGHIJKLMNOP";
/** Every row label: A..Z, then AA..AF (1536 wells). */
export const ROW_LABELS: string[] = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "AA", "AB", "AC", "AD", "AE", "AF"];

/** Wells → [rows, columns], smallest first. */
export const PLATE_FORMATS: Record<number, [number, number]> = {
  6: [2, 3], 12: [3, 4], 24: [4, 6], 48: [6, 8], 96: [8, 12], 384: [16, 24], 1536: [32, 48],
};
const FORMATS = Object.keys(PLATE_FORMATS).map(Number).sort((a, b) => a - b);
/** The formats' shapes, largest first (for callers that list them). */
export const PLATE_SHAPES: [number, number][] = [...FORMATS].reverse().map((w) => PLATE_FORMATS[w]);
const COLS_FOR_ROWS = new Map(FORMATS.map((w) => PLATE_FORMATS[w]));

export interface PlateGrid {
  /** Rows and columns of `values` (after padding to a format). */
  rows: number;
  cols: number;
  values: (number | null)[][];
  /** Well format (6 … 1536), or null for a block larger than 1536 wells. */
  format: number | null;
  /** Everything not read exactly as found: padding, unread numbers, a
   *  requested format that differs. Empty for a clean plate. */
  warnings: string[];
  /** First well row (0-based) and the row-label column (-1 for a grid
   *  without labels). */
  top: number;
  left: number;
  /** Rows the block spans in the sheet (before padding). */
  blockRows: number;
  labelledRows: boolean;
  labelledColumns: boolean;
}

/** plate_io._maybe_num: a lone comma with no point is a decimal comma. */
export function plateNumber(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const tok = String(v).trim();
  if (!tok) return null;
  const t = (tok.match(/,/g)?.length ?? 0) === 1 && !tok.includes(".") ? tok.replace(",", ".") : tok;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type Matrix = (string[] | undefined)[];

const cellAt = (m: Matrix, r: number, c: number): string | undefined =>
  (r < 0 || r >= m.length ? undefined : m[r]?.[c]);
const isEmpty = (v: string | undefined) => v === undefined || v === null || !String(v).trim();
const labelOf = (v: string | undefined) => (typeof v === "string" ? v.trim().toUpperCase() : null);

/** Length of the run 1, 2, 3 … in row r starting at column c0. */
function headerRun(m: Matrix, r: number, c0: number): number {
  let k = 0;
  while (plateNumber(cellAt(m, r, c0 + k)) === k + 1) k++;
  return k;
}

function formatOf(rows: number, cols: number): number | null {
  return FORMATS.find((w) => PLATE_FORMATS[w][0] === rows && PLATE_FORMATS[w][1] === cols) ?? null;
}

function containingFormat(rows: number, cols: number): number | null {
  return FORMATS.find((w) => rows <= PLATE_FORMATS[w][0] && cols <= PLATE_FORMATS[w][1]) ?? null;
}

/** Columns from c0 to the right-most number in the block's rows, stopping
 *  at a column that is text in more than half of them. */
function numericExtent(m: Matrix, top: number, nRows: number, c0: number): number {
  let width = 0;
  for (let r = 0; r < nRows; r++) width = Math.max(width, m[top + r]?.length ?? 0);
  let extent = 0;
  for (let c = c0; c < width; c++) {
    let text = 0;
    let num = 0;
    for (let r = 0; r < nRows; r++) {
      const v = cellAt(m, top + r, c);
      if (plateNumber(v) !== null) num++;
      else if (!isEmpty(v)) text++;
    }
    if (text * 2 > nRows) break;
    if (num) extent = c - c0 + 1;
  }
  return extent;
}

function countNumbers(m: Matrix, r0: number, r1: number, c0: number, c1: number): number {
  let n = 0;
  for (let r = Math.max(r0, 0); r < Math.min(r1, m.length); r++) {
    for (let c = Math.max(c0, 0); c < c1; c++) if (plateNumber(cellAt(m, r, c)) !== null) n++;
  }
  return n;
}

interface Block {
  top: number; left: number; rows: number; cols: number; extent: number;
  labelledRows: boolean; labelledColumns: boolean;
}

function labelledBlock(m: Matrix): Block | null {
  for (let top = 0; top < m.length - 1; top++) {
    const row = m[top] ?? [];
    for (let left = 0; left < row.length; left++) {
      if (labelOf(row[left]) !== "A" || labelOf(cellAt(m, top + 1, left)) !== "B") continue;
      let nRows = 2;
      while (nRows < ROW_LABELS.length && labelOf(cellAt(m, top + nRows, left)) === ROW_LABELS[nRows]) nRows++;
      const header = headerRun(m, top - 1, left + 1);
      const extent = numericExtent(m, top, nRows, left + 1);
      const nCols = header || COLS_FOR_ROWS.get(nRows) || extent;
      if (!nCols) continue;
      const found = countNumbers(m, top, top + nRows, left + 1, left + 1 + nCols);
      // a header vouches for the grid; without one, ask for numbers in at
      // least half of the wells up to the last numeric column
      const needed = header ? 1 : Math.max(1, 0.5 * nRows * Math.min(nCols, Math.max(extent, 1)));
      if (found < needed) continue;
      return { top, left: left + 1, rows: nRows, cols: nCols, extent,
        labelledRows: true, labelledColumns: header > 0 };
    }
  }
  return null;
}

type RowKind = "break" | "empty" | "numeric" | "text";

/** A blank line ends a block; a line of separators only is an empty row
 *  inside one; a row of numbers (a stray "OVRFLW" among them allowed) is
 *  a plate row. */
function rowKind(row: string[] | undefined): RowKind {
  if (!row || (row.length <= 1 && isEmpty(row[0]))) return "break";
  const cells = row.filter((v) => !isEmpty(v));
  if (!cells.length) return "empty";
  const nNum = cells.filter((v) => plateNumber(v) !== null).length;
  if (nNum === cells.length) return "numeric";
  if (nNum >= 2 && plateNumber(cells[0]) !== null && 4 * (cells.length - nNum) <= cells.length) {
    return "numeric";
  }
  return "text";
}

function bareBlocks(m: Matrix): Block[] {
  const kinds = m.map(rowKind);
  const spans: [number, number][] = [];
  for (let i = 0; i < m.length;) {
    if (kinds[i] !== "numeric") { i++; continue; }
    let j = i;
    while (j + 1 < m.length && (kinds[j + 1] === "numeric" || kinds[j + 1] === "empty")) j++;
    while (kinds[j] === "empty") j--;
    spans.push([i, j + 1]);
    i = j + 1;
  }
  const out: Block[] = [];
  for (let [r0, r1] of spans) {
    let counts = Array.from({ length: r1 - r0 }, (_, k) =>
      (m[r0 + k] ?? []).filter((v) => plateNumber(v) !== null).length);
    const topN = Math.max(...counts);
    while (r0 < r1 && counts[0] < 0.5 * topN) { r0++; counts = counts.slice(1); }
    while (r1 > r0 && counts[counts.length - 1] < 0.5 * topN) { r1--; counts = counts.slice(0, -1); }
    if (r1 - r0 < 1) continue;
    const firsts = Array.from({ length: r1 - r0 }, (_, k) => {
      const i = (m[r0 + k] ?? []).findIndex((v) => !isEmpty(v));
      return i < 0 ? null : i;
    });
    const known = firsts.filter((f): f is number => f !== null);
    let left = known.length ? Math.min(...known) : 0;
    const headerAt = firsts[0] ?? left;
    let header = headerRun(m, r0, headerAt);
    let nCols: number;
    if (header >= 2 && header === counts[0] && r1 - r0 >= 2) {
      r0++;
      left = headerAt;
      nCols = header;
    } else {
      header = 0;
      let last = 0;
      for (let r = r0; r < r1; r++) {
        const row = m[r] ?? [];
        let c = row.length - 1;
        while (c >= 0 && plateNumber(row[c]) === null) c--;
        last = Math.max(last, c + 1);
      }
      nCols = last - left;
    }
    const nRows = r1 - r0;
    if (nRows >= 2 && nCols >= 2) {
      out.push({ top: r0, left, rows: nRows, cols: nCols, extent: nCols,
        labelledRows: false, labelledColumns: header > 0 });
    }
  }
  return out;
}

/** The plate in a sheet (labelled block first, then the largest bare
 *  numeric block), or null. `requested`: the plate format the user chose
 *  (wells); see rule 4 above. */
export function findPlateGrid(matrix: string[][], requested?: number | null): PlateGrid | null {
  const m = matrix as Matrix;
  let block = labelledBlock(m);
  if (!block) {
    const bare = bareBlocks(m);
    if (!bare.length) return null;
    block = bare.reduce((best, b) => (b.rows * b.cols > best.rows * best.cols ? b : best));
  }
  const warnings: string[] = [];
  const { rows: nRows, cols: nCols, top, left } = block;
  const where = block.labelledRows ? "labelled" : "unlabelled";
  if (block.extent > nCols) {
    warnings.push(`Numbers in ${block.extent - nCols} column(s) to the right of column ${nCols} `
      + `of the ${where} ${nRows} x ${nCols} grid were not read as wells.`);
  }
  let fmt = formatOf(nRows, nCols);
  let outRows = nRows;
  let outCols = nCols;
  if (fmt === null) {
    fmt = containingFormat(nRows, nCols);
    const hint = formatOf(nCols, nRows) !== null ? " (it would match if rows and columns were swapped)" : "";
    if (fmt === null) {
      warnings.push(`The ${where} grid is ${nRows} x ${nCols}, larger than any known plate format${hint}; `
        + "it was read as it stands.");
    } else {
      [outRows, outCols] = PLATE_FORMATS[fmt];
      warnings.push(`The ${where} grid is ${nRows} x ${nCols}, not a known plate format${hint}; it was `
        + `read as the top-left corner of a ${fmt}-well plate (${outRows} x ${outCols}) and the other `
        + "wells are empty.");
    }
  }
  if (requested !== undefined && requested !== null && requested !== fmt) {
    const shape = PLATE_FORMATS[requested];
    if (!shape) throw new Error(`unknown plate format: ${requested}`);
    warnings.push(`The grid found is ${fmt ? `a ${fmt}-well plate` : "not a known format"} `
      + `(${nRows} x ${nCols}) but the plate format is ${requested} wells.`);
    const [rr, rc] = shape;
    if (rr >= outRows && rc >= outCols) {
      outRows = rr;
      outCols = rc;
      fmt = requested;
    } else {
      warnings.push("The grid was kept at its full size; no wells were dropped.");
    }
  }
  const below = block.labelledRows ? countNumbers(m, top + nRows, top + nRows + 1, left, left + nCols) : 0;
  if (below && !labelOf(cellAt(m, top + nRows, left - 1))) {
    warnings.push(`Numbers in the row below row ${ROW_LABELS[nRows - 1]} have no row label and were `
      + "not read as wells.");
  }
  const values = Array.from({ length: outRows }, (_, r) => Array.from({ length: outCols }, (_, c) =>
    (r < nRows && c < nCols ? plateNumber(cellAt(m, top + r, left + c)) : null)));
  return {
    rows: outRows, cols: outCols, values, format: fmt, warnings,
    top, left: block.labelledRows ? left - 1 : -1, blockRows: nRows,
    labelledRows: block.labelledRows, labelledColumns: block.labelledColumns,
  };
}
