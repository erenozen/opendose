// Comparing two correlations (P-48): on an XY table, X vs. one Y data set
// against X vs. another; on a column table, A vs. B against a second pair
// of data sets. Independent samples: Fisher's z; the same subjects
// (row by row): Steiger's (1980) Z (engine correlation.compare_*). The
// design is the user's choice; "auto" reads it from the layout (values in
// the same rows = the same subjects) and the results say which was used.
// Pure (no React).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { ColumnOptionsState } from "../../types.ts";
import { yRowMeans } from "./correlationX.ts";

export type CompareDesign = "auto" | "independent" | "dependent";

/** "i,j" → [i, j] (two different non-negative indices), else null. */
export function parseCompare(s: string | undefined): [number, number] | null {
  const m = /^(\d+),(\d+)$/.exec((s ?? "").trim());
  if (!m) return null;
  const [i, j] = [Number(m[1]), Number(m[2])];
  return i === j ? null : [i, j];
}

/** Every pair of data sets as a select option, value "i,j" (i < j),
 *  leaving out `skip` (the first correlation's pair). */
export function comparePairs(names: string[], skip?: [number, number]): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (skip && ((skip[0] === i && skip[1] === j) || (skip[0] === j && skip[1] === i))) continue;
      out.push({ value: `${i},${j}`, label: `${names[i]} vs. ${names[j]}` });
    }
  }
  return out;
}

const filled = (v: (number | null)[]) => new Set(v.flatMap((y, r) => (y === null ? [] : [r])));
const meets = (a: Set<number>, b: Set<number>) => [...a].some((r) => b.has(r));

/** The design used: the stated one, or from the layout when "auto". A
 *  data set in both correlations always means the same subjects. */
export function resolveDesign(stated: CompareDesign | undefined, shared: boolean, sameRows: boolean):
  { design: "independent" | "dependent"; reason: "stated" | "shared" | "same-rows" | "different-rows" } {
  if (shared) return { design: "dependent", reason: "shared" };
  if (stated === "independent" || stated === "dependent") return { design: stated, reason: "stated" };
  return sameRows ? { design: "dependent", reason: "same-rows" } : { design: "independent", reason: "different-rows" };
}

/** XY table, X against each Y: the engine request comparing X vs. Y_i
 *  with X vs. Y_j (row means of replicates), or null when no comparison
 *  is asked for. */
export function xyComparePayload(table: DataTableModel, o: ColumnOptionsState):
  { payload: Record<string, unknown>; design: ReturnType<typeof resolveDesign> } | { error: string } | null {
  const pair = parseCompare(o.corrCompare);
  if (!pair) return null;
  if (o.corrMethod !== "pearson") return { error: "Two correlations are compared as Pearson r: choose Pearson" };
  const d = numericData(table);
  const [i, j] = pair;
  if (i >= d.datasets.length || j >= d.datasets.length) return { error: "Choose two Y data sets to compare" };
  const xName = table.xTitle.trim() || "X";
  const yi = yRowMeans(d.datasets[i].ys).means, yj = yRowMeans(d.datasets[j].ys).means;
  const ni = d.datasets[i].name.trim() || `Data set ${i + 1}`;
  const nj = d.datasets[j].name.trim() || `Data set ${j + 1}`;
  const design = resolveDesign(o.corrCompareDesign, false, meets(filled(yi), filled(yj)));
  const col = (name: string, v: (number | null)[]) => ({ name, ys: v.map((y) => [y]) });
  const datasets = design.design === "dependent"
    // one X, shared: Steiger's Z for overlapping correlations
    ? [col(xName, d.x), col(ni, yi), col(nj, yj)]
    // X twice, each restricted to its own rows: two independent samples
    : [col(xName, d.x.map((x, r) => (yi[r] === null ? null : x))), col(ni, yi),
      col(xName, d.x.map((x, r) => (yj[r] === null ? null : x))), col(nj, yj)];
  return {
    design,
    payload: {
      analysis: "correlation",
      data: { datasets },
      options: { method: "pearson", dataset_a: 0, dataset_b: 1,
        compare: { dataset_c: design.design === "dependent" ? 0 : 2,
          dataset_d: design.design === "dependent" ? 2 : 3, design: design.design } },
    },
  };
}

/** Column table: the "compare" option of the engine correlation (A vs. B
 *  against the chosen pair), or null when none is asked for. */
export function columnCompareOption(table: DataTableModel, o: ColumnOptionsState):
  { compare: Record<string, unknown>; design: ReturnType<typeof resolveDesign> } | null {
  const pair = parseCompare(o.corrCompare);
  if (!pair) return null;
  const d = numericData(table);
  const n = d.datasets.length;
  if ([o.datasetA, o.datasetB, ...pair].some((k) => k < 0 || k >= n)) return null;
  const rowsOf = (k: number) => filled(d.datasets[k].ys.map((row) => (row.some((v) => v !== null) ? 1 : null)));
  const shared = pair.includes(o.datasetA) || pair.includes(o.datasetB);
  const ab = [...rowsOf(o.datasetA)].filter((r) => rowsOf(o.datasetB).has(r));
  const cd = new Set([...rowsOf(pair[0])].filter((r) => rowsOf(pair[1]).has(r)));
  const design = resolveDesign(o.corrCompareDesign, shared, ab.some((r) => cd.has(r)));
  return { design, compare: { dataset_c: pair[0], dataset_d: pair[1], design: design.design } };
}

/** The test's name as the results and methods state it. */
export function comparisonTestName(test: string): string {
  if (test === "fisher_z_independent") return "Fisher's z test, independent samples";
  if (test === "steiger_overlapping") return "Steiger's Z test, the same subjects, one variable in common";
  if (test === "steiger_nonoverlapping") return "Steiger's Z test, the same subjects, no variable in common";
  return test;
}

/** Why the design is what it is, in one clause. */
export function designReason(reason: string): string {
  switch (reason) {
    case "shared": return "the two correlations share a data set, so they come from the same subjects";
    case "same-rows": return "both have values in the same rows, read as the same subjects (change this under “Measured on”)";
    case "different-rows": return "their values are in different rows, read as different subjects (change this under “Measured on”)";
    default: return "as chosen under “Measured on”";
  }
}
