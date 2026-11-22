// Exclude (or include again) every value of the rows whose ID is in a
// pasted list: subject or animal IDs from a log, outliers flagged
// elsewhere. The ID is the row title, or on a multiple-variables table
// the value of a chosen ID column. Matching ignores case and surrounding
// spaces; IDs that match no row are reported. Excluded values keep their
// place in the table and are left out of analyses and graphs, as with
// Ctrl+E (project/exclusions.ts). Pure.
import { setReasons } from "./exclusions.ts";
import { setExcluded, type CellRef } from "./table.ts";
import type { DataTableModel } from "./types.ts";

/** Where a row's ID is read: its title, or a column's value. */
export type IdSource = { kind: "rowTitle" } | { kind: "column"; dataset: number };

const key = (s: string) => s.trim().toLocaleLowerCase();

/** The ID sources a table offers (row titles first when there are any). */
export function idSources(t: DataTableModel): { label: string; source: IdSource }[] {
  const out: { label: string; source: IdSource }[] = [];
  if (t.rowTitles.some((r) => r.trim())) out.push({ label: "Row titles", source: { kind: "rowTitle" } });
  if (t.type === "multivariable") {
    t.datasets.forEach((d, i) => out.push({ label: `Column “${d.name || `#${i + 1}`}”`, source: { kind: "column", dataset: i } }));
  }
  return out;
}

/** IDs from pasted text: one per line, or separated by commas, semicolons
 *  or tabs. */
export function parseIds(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n\r,;\t]+/)) {
    const v = raw.trim();
    if (v && !seen.has(key(v))) { seen.add(key(v)); out.push(v); }
  }
  return out;
}

function idOf(t: DataTableModel, source: IdSource, r: number): string {
  return source.kind === "rowTitle" ? t.rowTitles[r] ?? "" : t.datasets[source.dataset]?.rows[r]?.[0] ?? "";
}

/** The rows whose ID is listed, and the listed IDs found in no row. */
export function matchRows(t: DataTableModel, source: IdSource, ids: string[]):
  { rows: number[]; unmatched: string[] } {
  const want = new Map(ids.map((v) => [key(v), v]));
  const found = new Set<string>();
  const rows: number[] = [];
  for (let r = 0; r < t.x.length; r++) {
    const k = key(idOf(t, source, r));
    if (k && want.has(k)) { rows.push(r); found.add(k); }
  }
  return { rows, unmatched: ids.filter((v) => !found.has(key(v))) };
}

/** The value cells of these rows (blank cells and the ID column itself
 *  are left alone). */
export function rowRefs(t: DataTableModel, rows: number[], source: IdSource): CellRef[] {
  const refs: CellRef[] = [];
  t.datasets.forEach((d, di) => {
    if (source.kind === "column" && source.dataset === di) return;
    for (const r of rows) {
      (d.rows[r] ?? []).forEach((v, s) => {
        if (v.trim() !== "") refs.push({ kind: "y", dataset: di, row: r, sub: s });
      });
    }
  });
  return refs;
}

/** Exclude (on) or include again (off) the listed rows' values; on
 *  exclusion the reason (if any) is recorded on each value. */
export function excludeRowsById(t: DataTableModel, source: IdSource, ids: string[],
  { on = true, reason = "" }: { on?: boolean; reason?: string } = {}):
  { table: DataTableModel; rows: number[]; values: number; unmatched: string[] } {
  const { rows, unmatched } = matchRows(t, source, ids);
  const refs = rowRefs(t, rows, source);
  let table = setExcluded(t, refs, on);
  if (on && reason.trim()) table = setReasons(table, refs, reason);
  return { table, rows, values: refs.length, unmatched };
}
