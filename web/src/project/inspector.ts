// Data Inspector: descriptive numbers for the cells currently selected
// in the grid. Pure; computed on every selection change (cheap).
import { flatColumns, isExcluded, normRect, parseCell, type CellRect } from "./table.ts";
import type { DataTableModel } from "./types.ts";
import { xNumbers } from "./xformat.ts";

export interface InspectorStats {
  cells: number;      // X / Y cells in the selection
  n: number;          // numeric values used (not excluded)
  missing: number;    // blank cells
  excluded: number;   // excluded values
  text: number;       // non-blank cells that are not numbers
  mean: number | null;
  sd: number | null;  // sample SD (n - 1)
  sem: number | null;
  min: number | null;
  max: number | null;
  sum: number | null;
}

/** Statistics of the X / Y cells inside rect (row titles are ignored).
 *  Dates and elapsed times count in the table's analysis units. */
export function selectionStats(t: DataTableModel, rect: CellRect): InspectorStats {
  const { r0, r1, c0, c1 } = normRect(rect);
  const cols = flatColumns(t);
  const xs = cols.some((c, i) => c.kind === "x" && i >= c0 && i <= c1) ? xNumbers(t) : [];
  const vals: number[] = [];
  let cells = 0;
  let missing = 0;
  let excluded = 0;
  let text = 0;
  for (let r = r0; r <= Math.min(r1, t.x.length - 1); r++) {
    for (let c = c0; c <= c1; c++) {
      const col = cols[c];
      if (!col || col.kind === "rowTitle") continue;
      cells++;
      const raw = col.kind === "x" ? t.x[r] ?? ""
        : t.datasets[col.dataset]?.rows[r]?.[col.sub] ?? "";
      if (!raw.trim()) { missing++; continue; }
      const v = col.kind === "x" ? xs[r] : parseCell(raw);
      if (v === null || v === undefined) { text++; continue; }
      const ex = isExcluded(t, col.kind === "x" ? { kind: "x", row: r }
        : { kind: "y", dataset: col.dataset, row: r, sub: col.sub });
      if (ex) { excluded++; continue; }
      vals.push(v);
    }
  }
  const n = vals.length;
  const sum = n ? vals.reduce((a, b) => a + b, 0) : null;
  const mean = n && sum !== null ? sum / n : null;
  const sd = n > 1 && mean !== null
    ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return {
    cells, n, missing, excluded, text, mean, sd,
    sem: sd !== null ? sd / Math.sqrt(n) : null,
    min: n ? vals.reduce((a, b) => (b < a ? b : a)) : null,
    max: n ? vals.reduce((a, b) => (b > a ? b : a)) : null,
    sum,
  };
}
