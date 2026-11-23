// Where the data grid's spreadsheet keys go (DataGrid.tsx), as in Excel.
// Positions are (row, flat column) as the grid numbers them. Pure.

/** Is the cell at (row, column) holding a value? */
export type Filled = (r: number, c: number) => boolean;

/**
 * Ctrl/Cmd+Arrow: from inside a run of filled cells, the last filled cell
 * of the run; otherwise the next filled cell in that direction; with
 * none, the table's edge. At the edge already: where it is.
 */
export function edgeJump(filled: Filled, r: number, c: number, dr: number, dc: number,
  nRows: number, nCols: number): [number, number] {
  const inside = (rr: number, cc: number) => rr >= 0 && rr < nRows && cc >= 0 && cc < nCols;
  let nr = r + dr;
  let nc = c + dc;
  if (!inside(nr, nc)) return [r, c];
  if (filled(r, c) && filled(nr, nc)) {
    while (inside(nr + dr, nc + dc) && filled(nr + dr, nc + dc)) { nr += dr; nc += dc; }
    return [nr, nc];
  }
  while (!filled(nr, nc) && inside(nr + dr, nc + dc)) { nr += dr; nc += dc; }
  return [nr, nc];
}

/** Ctrl/Cmd+End: the last row and the last column that hold a value
 *  (the first cell when the table is empty). */
export function lastUsedCell(filled: Filled, nRows: number, nCols: number): [number, number] {
  let lr = 0;
  let lc = 0;
  for (let r = 0; r < nRows; r++) {
    for (let c = 0; c < nCols; c++) {
      if (filled(r, c)) { if (r > lr) lr = r; if (c > lc) lc = c; }
    }
  }
  return [lr, lc];
}

/** A cell input's caret, as the keys need it. */
export interface Caret { start: number; end: number; length: number; readOnly: boolean }

/** Not being edited: the whole text selected (how a cell reached by the
 *  keyboard starts), or empty, or read-only. Ctrl/Cmd+A then selects the
 *  whole table; while editing it selects the cell's text. */
export function cellReady({ start, end, length, readOnly }: Caret): boolean {
  return readOnly || length === 0 || (start === 0 && end === length);
}

/**
 * Does a key that also moves the caret (Home, End, Ctrl+Left / Right)
 * move between cells instead? Yes when the cell is not being edited, as
 * in Excel's Ready mode: its whole text is selected (how a cell reached
 * by the keyboard starts), it is empty or read-only, or the caret is
 * already at that end of the text. Otherwise the caret moves.
 */
export function movesCell(caret: Caret, towards: "start" | "end"): boolean {
  const { start, end, length } = caret;
  if (cellReady(caret)) return true;
  return towards === "start" ? start === 0 && end === 0 : start === length && end === length;
}
