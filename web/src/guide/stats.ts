// Cheap client-side summaries of a table for the guidance: n, mean and SD
// per group (column-like tables) or per cell (grouped tables), missing
// values inside rows, normalised controls. Pure; normality comes from the
// engine (guide/useGroupChecks.ts) and is merged in by name.
import { numericData } from "../project/table.ts";
import type { DataTableModel } from "../project/types.ts";
import type { GroupCheck } from "./recommend.ts";

export interface Summary { n: number; mean: number | null; sd: number | null; min: number | null }

export function summarize(vals: number[]): Summary {
  const n = vals.length;
  if (!n) return { n: 0, mean: null, sd: null, min: null };
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1
    ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : null;
  return { n, mean, sd, min: Math.min(...vals) };
}

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** One group per data set, all its subcolumns pooled (Column, Nested,
 *  the Y columns of XY). Normality is left null here. */
export function groupChecks(table: DataTableModel): GroupCheck[] {
  if (table.subcolumnFormat !== "replicates") return [];
  return numericData(table).datasets.map((d) => {
    const vals = d.ys.flat().filter(finite);
    const s = summarize(vals);
    return { name: d.name, n: s.n, mean: s.mean, sd: s.sd, normalityP: null,
      allPositive: vals.length > 0 && vals.every((v) => v > 0) };
  });
}

/** Grouped tables: one summary per (row, data set) cell holding values. */
export function cellChecks(table: DataTableModel): { row: string; dataset: string; s: Summary }[] {
  if (table.subcolumnFormat !== "replicates") return [];
  const out: { row: string; dataset: string; s: Summary }[] = [];
  numericData(table).datasets.forEach((d) => d.ys.forEach((row, r) => {
    const vals = row.filter(finite);
    if (vals.length) {
      out.push({ row: table.rowTitles[r]?.trim() || `Row ${r + 1}`, dataset: d.name,
        s: summarize(vals) });
    }
  }));
  return out;
}

/** Blank cells inside rows that hold other values (the rows a repeated-
 *  measures analysis would lose). `firstSubOnly`: Column tables, where an
 *  RM analysis reads one value per data set per row. */
export function missingInRows(table: DataTableModel, firstSubOnly = false): {
  cells: number; rows: number;
} {
  const sets = numericData(table).datasets;
  const nRows = table.x.length;
  let cells = 0, rows = 0;
  for (let r = 0; r < nRows; r++) {
    const vals = sets.flatMap((d) => (firstSubOnly ? [d.ys[r]?.[0] ?? null] : d.ys[r] ?? []));
    const have = vals.filter(finite).length;
    if (have > 0 && have < vals.length) { cells += vals.length - have; rows++; }
  }
  return { cells, rows };
}

/** A group whose every value is 1 or 100 (SD 0): a normalised control. */
export function normalisedControl(groups: GroupCheck[]): GroupCheck | null {
  return groups.find((g) => g.n >= 2 && g.sd === 0 && g.mean !== null
    && (Math.abs(g.mean - 1) < 1e-9 || Math.abs(g.mean - 100) < 1e-9)) ?? null;
}

/** Many values per group in few groups: n may count cells, not replicates. */
export function looksLikeCells(groups: GroupCheck[]): boolean {
  const used = groups.filter((g) => g.n > 0);
  return used.length >= 1 && used.length <= 4 && Math.max(...used.map((g) => g.n)) >= 50;
}
