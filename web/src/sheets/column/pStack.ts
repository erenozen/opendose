// Analyze a stack of P values (statistics guide, "Analyzing a stack of P
// values"): one column of P values, each row one comparison (row titles
// label them), corrected as a family by the engine's fdr_adjust: the
// false discovery rate (two-stage BKY, BH, BY) or statistical significance
// for the whole family (Holm-Šídák, Šídák, Bonferroni, Holm, or none).
// Pure (no React).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { ColumnOptionsState } from "../../types.ts";

export type PStackMethod = "bky" | "bh" | "by" | "holm_sidak" | "sidak" | "bonferroni" | "holm" | "none";

export const P_STACK_METHODS: readonly (readonly [PStackMethod, string])[] = [
  ["bky", "False discovery rate: two-stage step-up (Benjamini, Krieger & Yekutieli)"],
  ["bh", "False discovery rate: Benjamini & Hochberg"],
  ["by", "False discovery rate: Benjamini & Yekutieli"],
  ["holm_sidak", "Significance: Holm-Šídák (step-down)"],
  ["sidak", "Significance: Šídák"],
  ["bonferroni", "Significance: Bonferroni"],
  ["holm", "Significance: Holm (step-down Bonferroni)"],
  ["none", "Significance: no correction"],
];

export const isFdrMethod = (m: string) => m === "bky" || m === "bh" || m === "by";

/** The engine request, or why the table cannot be read as P values. */
export function pStackPayload(table: DataTableModel, o: ColumnOptionsState):
  { payload: Record<string, unknown> } | { error: string } {
  if (table.subcolumnFormat !== "replicates") {
    return { error: "Enter the P values themselves, one per row (not mean / SD / n)" };
  }
  const sets = numericData(table).datasets;
  const k = sets[o.datasetA] ? o.datasetA : 0;
  const ds = sets[k];
  if (!ds) return { error: "No data set holds the P values" };
  const p: (number | null)[] = [];
  const crowded: number[] = [];
  ds.ys.forEach((row, i) => {
    const vals = row.filter((v): v is number => v !== null);
    if (vals.length > 1) crowded.push(i + 1);
    p.push(vals.length ? vals[0] : null);
  });
  // a row with two values is two comparisons under one label: never pick one
  if (crowded.length) {
    return { error: `Each row must hold one P value; rows ${crowded.slice(0, 6).join(", ")} hold more than one` };
  }
  const bad = p.map((v, i) => (v !== null && (v < 0 || v > 1) ? i + 1 : 0)).filter(Boolean);
  if (bad.length) {
    return { error: `P values lie between 0 and 1; rows ${bad.slice(0, 6).join(", ")} do not` };
  }
  if (!p.some((v) => v !== null)) return { error: "The column holds no P values" };
  const labels = p.map((_, i) => table.rowTitles?.[i]?.trim() || `Row ${i + 1}`);
  const method = o.pStackMethod ?? "bky";
  const num = (s: string | undefined, d: number) => {
    const v = Number(String(s ?? "").trim());
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return {
    payload: {
      analysis: "fdr_adjust",
      data: { p_values: p, labels },
      options: isFdrMethod(method)
        ? { method, q_percent: num(o.pStackQ, 5) }
        : { method, alpha: num(o.pStackAlpha, 0.05) },
    },
  };
}
