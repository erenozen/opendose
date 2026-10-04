// Plate-reader grids: find a microplate block (rows labelled A, B, C …,
// mostly numeric cells to their right) anywhere in a sheet. A line-for-
// line port of the SRB importer's parser (engine/opendose/plate_io.py,
// find_plate_grid and parse_text), so both importers accept the same
// files; this one runs without the Python runtime, on text or on a
// worksheet already read into cells.
export const ROW_LETTERS = "ABCDEFGHIJKLMNOP";

/** 96, 384, 48 and 24 wells, tried in this order (as plate_io.py). */
export const PLATE_SHAPES: [number, number][] = [[8, 12], [16, 24], [6, 8], [4, 6]];

export interface PlateGrid {
  rows: number;
  cols: number;
  values: (number | null)[][];
  /** Where the row-letter column was found (0-based). */
  top: number;
  left: number;
}

/** plate_io._maybe_num: a lone comma with no point is a decimal comma. */
export function plateNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const tok = v.trim();
  if (!tok) return null;
  const t = (tok.match(/,/g)?.length ?? 0) === 1 && !tok.includes(".") ? tok.replace(",", ".") : tok;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function isPlateAt(m: string[][], top: number, left: number, nRows: number, nCols: number): boolean {
  if (top + nRows > m.length) return false;
  let numeric = 0;
  for (let r = 0; r < nRows; r++) {
    const row = m[top + r];
    if (left + 1 + nCols > row.length) return false;
    const label = row[left];
    if (!(typeof label === "string" && label.trim().toUpperCase() === ROW_LETTERS[r])) return false;
    for (let c = 0; c < nCols; c++) if (plateNumber(row[left + 1 + c]) !== null) numeric++;
  }
  return numeric >= nRows * nCols * 0.6; // tolerate some empty wells
}

/** The first plate-shaped block, or null. */
export function findPlateGrid(m: string[][]): PlateGrid | null {
  for (const [nRows, nCols] of PLATE_SHAPES) {
    for (let top = 0; top < m.length; top++) {
      for (let left = 0; left < (m[top]?.length ?? 0); left++) {
        if (isPlateAt(m, top, left, nRows, nCols)) {
          return {
            rows: nRows, cols: nCols, top, left,
            values: Array.from({ length: nRows }, (_, r) =>
              Array.from({ length: nCols }, (_, c) => plateNumber(m[top + r][left + 1 + c]))),
          };
        }
      }
    }
  }
  // parse_text: a block without labels that is exactly plate-shaped and
  // all numeric is taken as it stands.
  const rows = m.filter((r) => r.some((c) => c.trim() !== ""));
  const width = Math.max(0, ...rows.map((r) => r.length));
  const shape = PLATE_SHAPES.find(([a, b]) => a === rows.length && b === width);
  if (shape && rows.every((r) => r.every((c) => c.trim() === "" || plateNumber(c) !== null))) {
    return {
      rows: shape[0], cols: shape[1], top: 0, left: -1,
      values: rows.map((r) => Array.from({ length: shape[1] }, (_, c) => plateNumber(r[c]))),
    };
  }
  return null;
}
