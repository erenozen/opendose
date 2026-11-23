// Find and replace in a data table (Ctrl+F / Ctrl+H in the grid): every
// cell value, X value, row title and column name containing the text,
// ignoring case, in reading order (row by row, left to right; column
// names first, as the header row). Positions are (row, flat column) as
// the grid numbers them (project/table.ts flatColumns); a column name is
// reported at its first cell. With `whole`, only cells whose whole text
// is the query (surrounding spaces ignored) match. Pure.
import { flatColumns, renameDataset, setCell, setRowTitle, setX } from "./table.ts";
import type { DataTableModel } from "./types.ts";

export interface FindHit { r: number; c: number; where: "value" | "x" | "rowTitle" | "column" }

export interface FindOptions {
  /** Match the whole cell, not a part of it. */
  whole?: boolean;
}

function matcher(query: string, opts: FindOptions): ((v: string | undefined) => boolean) | null {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return null;
  return opts.whole
    ? (v) => v !== undefined && v.trim().toLocaleLowerCase() === q
    : (v) => !!v && v.toLocaleLowerCase().includes(q);
}

export function findInTable(t: DataTableModel, query: string, opts: FindOptions = {}): FindHit[] {
  const has = matcher(query, opts);
  if (!has) return [];
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

/** The text a match becomes: the replacement for the whole cell, or for
 *  every occurrence of the query inside it (ignoring case). */
export function replacedText(text: string, query: string, replacement: string, opts: FindOptions = {}): string {
  const q = query.trim();
  if (opts.whole) return replacement;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "gi"), () => replacement);
}

/** Replace the given matches (all of findInTable's, or one) in one edit.
 *  A calculated column's values and formula columns are written by their
 *  formula, so they are skipped and counted; excluded cells keep their
 *  exclusion and its reason (only the text changes). */
export function replaceInTable(t: DataTableModel, hits: FindHit[], query: string, replacement: string,
  opts: FindOptions = {}): { table: DataTableModel; changed: number; skipped: number } {
  const cols = flatColumns(t);
  let next = t;
  let changed = 0;
  let skipped = 0;
  for (const h of hits) {
    const k = cols[h.c];
    if (!k) continue;
    const swap = (v: string) => replacedText(v, query, replacement, opts);
    if (h.where === "column" && k.kind === "y") {
      const d = next.datasets[k.dataset];
      const v = swap(d.name);
      if (v !== d.name) { next = renameDataset(next, k.dataset, v); changed++; }
    } else if (h.where === "rowTitle") {
      const old = next.rowTitles[h.r] ?? "";
      const v = swap(old);
      if (v !== old) { next = setRowTitle(next, h.r, v); changed++; }
    } else if (h.where === "x") {
      const old = next.x[h.r] ?? "";
      const v = swap(old);
      if (v !== old) { next = setX(next, h.r, v); changed++; }
    } else if (h.where === "value" && k.kind === "y") {
      const d = next.datasets[k.dataset];
      if (d.formula) { skipped++; continue; }
      const old = d.rows[h.r]?.[k.sub] ?? "";
      const v = swap(old);
      if (v !== old) { next = setCell(next, k.dataset, h.r, k.sub, v); changed++; }
    }
  }
  return { table: next, changed, skipped };
}
