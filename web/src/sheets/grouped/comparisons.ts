// Pairwise comparisons of grouped-table results, for the brackets on
// grouped graphs (pure; unit-tested in __tests__/grouped.test.ts).
//
// - Two-way ANOVA / mixed model: comparisons within each row (family =
//   row title, groups = data sets), within each data set (family = data
//   set, groups = rows), or between main-effect means.
// - Multiple t tests: one comparison per row between the two data sets
//   (family = row title), with the adjusted P (or q value with FDR).
// - Three-way ANOVA: comparisons between cells "row:B:C" (no family); the
//   plot finds each cell's bar from the result's `means[].cell`.
import { extractComparisons, type ComparisonSet } from "../../graph/results.ts";
import { splitPair, type Comparison } from "../../graph/significance.ts";
import type { DataTableModel } from "../../project/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export const groupedRowLabels = (t: DataTableModel) =>
  t.rowTitles.map((r, i) => r.trim() || `Row ${i + 1}`);
export const groupedDatasetLabels = (t: DataTableModel) =>
  t.datasets.map((d, i) => d.name.trim() || `Dataset ${i + 1}`);

const METHOD: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", bonferroni: "Bonferroni", sidak: "Šídák",
  holm_sidak: "Holm-Šídák", holm: "Holm", none: "Uncorrected",
  bh: "Benjamini-Hochberg", by: "Benjamini-Yekutieli", bky: "Two-stage step-up",
};

/** Three-way cells by label: "row:B:C" -> [row, B level, C level]. */
export function threeWayCells(result: unknown): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  const means = (result as R)?.multiple_comparisons?.means;
  if (!Array.isArray(means)) return out;
  for (const m of means) {
    if (typeof m?.label === "string" && Array.isArray(m.cell) && m.cell.length === 3) {
      out.set(m.label, [Number(m.cell[0]), Number(m.cell[1]), Number(m.cell[2])]);
    }
  }
  return out;
}

export function groupedComparisons(result: unknown, table: DataTableModel): ComparisonSet | null {
  const r = result as R;
  if (!r || typeof r !== "object" || r.error) return null;

  // Multiple t tests: rows [{row, p, p_adjusted}], names [A, B].
  if (Array.isArray(r.rows) && Array.isArray(r.names) && r.names.length === 2
    && typeof r.n_tests === "number") {
    const [a, b] = r.names as string[];
    const fdr = r.approach === "fdr";
    const out: Comparison[] = [];
    let unmatched = 0;
    for (const row of r.rows as R[]) {
      const p = row.p_adjusted ?? row.p;
      if (typeof p !== "number" || row.omitted) { unmatched++; continue; }
      out.push({ a, b, p, family: String(row.row) });
    }
    return {
      label: `Multiple t tests (${fdr ? "q values" : "adjusted P values"}, ${
        METHOD[String(r.method)] ?? String(r.method)})`,
      comparisons: out, unmatched,
    };
  }

  // Three-way ANOVA: comparisons between cells.
  const cells = threeWayCells(r);
  if (cells.size && Array.isArray(r.multiple_comparisons?.comparisons)) {
    const names = [...cells.keys()];
    const out: Comparison[] = [];
    let unmatched = 0;
    for (const c of r.multiple_comparisons.comparisons as R[]) {
      const p = c.p_adjusted ?? c.p;
      const pair = typeof c.pair === "string" ? splitPair(c.pair, names) : null;
      if (!pair || typeof p !== "number") { unmatched++; continue; }
      out.push({ a: pair[0], b: pair[1], p });
    }
    const m = METHOD[String(r.multiple_comparisons.method)] ?? "";
    return { label: `${m ? `${m} ` : ""}comparisons between cells`.trim(), comparisons: out,
      unmatched };
  }

  // Two-way: group names are data sets (within rows) or rows (within data
  // sets); offer both to the pair splitter.
  const names = [...new Set([...groupedDatasetLabels(table), ...groupedRowLabels(table),
    ...table.datasets.map((d) => d.name)])];
  return extractComparisons(r, names);
}
