// Fill down (Ctrl/Cmd+D in the data grid, More › Fill down), as in Excel:
// on a block of two or more rows, the top row's cells are copied into
// every row below them inside the block; on one row, the row above is
// copied into it. Pure.
//
// What is copied is the cell's stored text, exactly (a value shown with
// fewer decimals is copied in full). Exclusions are not copied: every
// cell keeps its own (an excluded cell stays excluded with its reason, an
// included one stays included). A calculated column is written by its
// formula, so its cells are skipped and counted. A number cell still
// holding a typed "=2*3" (it becomes its value when the cell is left)
// is filled with that value.
import { calcCell, evalCellExpression } from "./calculated.ts";
import { flatColumns, normRect, type CellRect } from "./table.ts";
import type { DataTableModel } from "./types.ts";

export interface FillDownResult {
  table: DataTableModel;
  /** Cells whose text changed. */
  changed: number;
  /** Cells left alone because their column is calculated. */
  skipped: number;
  /** The row copied from, or -1 when there is none (one row, at the top). */
  from: number;
  /** The rows written, first and last. */
  rows: [number, number];
}

export function fillDown(t: DataTableModel, rect: CellRect): FillDownResult {
  const n = normRect(rect);
  const last = Math.min(n.r1, t.x.length - 1);
  const from = n.r0 === last ? n.r0 - 1 : n.r0;
  const first = n.r0 === last ? n.r0 : n.r0 + 1;
  if (from < 0 || first > last) return { table: t, changed: 0, skipped: 0, from: -1, rows: [first, last] };
  const cols = flatColumns(t);
  let x = t.x;
  let rowTitles = t.rowTitles;
  const datasets = [...t.datasets];
  const copied = new Set<number>();
  let changed = 0;
  let skipped = 0;
  // the text a number cell holds once left: "=2*3" becomes "6"
  const settled = (v: string, numeric: boolean) => {
    if (!numeric || !v.trim().startsWith("=")) return v;
    const e = evalCellExpression(v);
    return e === null ? v : calcCell(e);
  };
  for (let c = n.c0; c <= Math.min(n.c1, cols.length - 1); c++) {
    const col = cols[c];
    if (col.kind === "rowTitle") {
      const src = rowTitles[from] ?? "";
      rowTitles = [...rowTitles];
      for (let r = first; r <= last; r++) {
        if ((rowTitles[r] ?? "") !== src) { rowTitles[r] = src; changed++; }
      }
    } else if (col.kind === "x") {
      const src = settled(x[from] ?? "", t.xFormat === "numbers");
      x = [...x];
      if (x[from] !== src) x[from] = src;
      for (let r = first; r <= last; r++) {
        if (x[r] !== src) { x[r] = src; changed++; }
      }
    } else {
      const d = datasets[col.dataset];
      if (d.formula) { skipped += last - first + 1; continue; }
      if (!copied.has(col.dataset)) {
        datasets[col.dataset] = { ...d, rows: d.rows.map((row) => [...row]) };
        copied.add(col.dataset);
      }
      const rows = datasets[col.dataset].rows;
      const numeric = !(t.type === "multivariable" && d.varType === "categorical");
      const src = settled(rows[from]?.[col.sub] ?? "", numeric);
      if (rows[from]) rows[from][col.sub] = src;
      for (let r = first; r <= last; r++) {
        if (rows[r] && rows[r][col.sub] !== src) { rows[r][col.sub] = src; changed++; }
      }
    }
  }
  return { table: { ...t, x, rowTitles, datasets }, changed, skipped, from, rows: [first, last] };
}

/** What a fill did, in one sentence (spoken: the grid shows the rest). */
export function fillDownSummary(r: FillDownResult): string {
  if (r.from < 0) return "Nothing above row 1 to fill down from.";
  const [a, b] = r.rows;
  const where = a === b ? `row ${a + 1}` : `rows ${a + 1} to ${b + 1}`;
  const cells = `${r.changed} ${r.changed === 1 ? "cell" : "cells"}`;
  return `Filled ${where} from row ${r.from + 1}: ${cells} changed.`
    + (r.skipped ? ` ${r.skipped} in calculated columns left to their formula.` : "");
}
