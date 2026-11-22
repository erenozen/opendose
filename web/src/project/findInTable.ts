// Find in a data table (Ctrl+F in the grid): every cell value, X value,
// row title and column name containing the text, ignoring case, in
// reading order (row by row, left to right; column names first, as the
// header row). Positions are (row, flat column) as the grid numbers them
// (project/table.ts flatColumns); a column name is reported at its first
// cell. Pure.
import { flatColumns } from "./table.ts";
import type { DataTableModel } from "./types.ts";

export interface FindHit { r: number; c: number; where: "value" | "x" | "rowTitle" | "column" }

export function findInTable(t: DataTableModel, query: string): FindHit[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const has = (v: string | undefined) => !!v && v.toLocaleLowerCase().includes(q);
  const cols = flatColumns(t);
  const hits: FindHit[] = [];
  t.datasets.forEach((d, di) => {
    if (!has(d.name)) return;
    const c = cols.findIndex((k) => k.kind === "y" && k.dataset === di);
    if (c >= 0) hits.push({ r: 0, c, where: "column" });
  });
  for (let r = 0; r < t.x.length; r++) {
    cols.forEach((k, c) => {
      if (k.kind === "rowTitle" && has(t.rowTitles[r])) hits.push({ r, c, where: "rowTitle" });
      else if (k.kind === "x" && has(t.x[r])) hits.push({ r, c, where: "x" });
      else if (k.kind === "y" && has(t.datasets[k.dataset]?.rows[r]?.[k.sub])) hits.push({ r, c, where: "value" });
    });
  }
  return hits;
}
