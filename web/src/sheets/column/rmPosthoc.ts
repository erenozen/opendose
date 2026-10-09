// Multiple comparisons after repeated-measures one-way ANOVA: which
// method (the column options' `comparisons`), which baseline for Dunnett
// (`controlIndex`), which family for the single-step and step-down
// corrections (the comparisons picker: every pair, each vs. a control, or
// planned pairs) and which error term. Every comparison keeps the
// matching: with the Geisser-Greenhouse correction (sphericity not
// assumed) each pair uses only its own paired differences; assuming
// sphericity, the pooled mean square residual of the RM ANOVA (GraphPad
// statistics guide, "Multiple comparisons after repeated measures one-way
// ANOVA"; Maxwell & Delaney 2004, pp. 552-555). The engine computes it
// (engine/opendose/rm_posthoc.py); with missing values the mixed-effects
// model (mixed_rm_oneway) keeps the incomplete subjects. Pure, unit-tested
// (__tests__/rmPosthoc.test.ts).
import { numericData } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { ColumnOptionsState } from "../../types.ts";
import { effectiveFamily, PLANNED_METHODS, validPairs } from "./comparisonsFamily.ts";

/** Methods the RM post hoc offers (engine rm_posthoc.METHODS). */
export const RM_METHODS = ["tukey", "dunnett", "sidak", "bonferroni", "holm", "holm_sidak",
  "fisher_lsd"] as const;
export type RmMethod = typeof RM_METHODS[number];

export const RM_METHOD_LABELS: Record<"none" | RmMethod, string> = {
  none: "No multiple comparisons",
  tukey: "Tukey (compare every pair)",
  dunnett: "Dunnett (each vs. baseline)",
  sidak: "Šídák",
  bonferroni: "Bonferroni",
  holm: "Holm (Bonferroni step-down)",
  holm_sidak: "Holm-Šídák",
  fisher_lsd: "Fisher's LSD (no correction)",
};

/** The mixed-effects model's methods (engine mixedmodel._METHODS). */
const MIXED_METHODS: Record<string, string> = {
  tukey: "tukey", dunnett: "dunnett", bonferroni: "bonferroni", sidak: "sidak",
  holm_sidak: "holm_sidak", fisher_lsd: "fisher",
};

/** The RM post hoc method chosen, or null (none, or a method the RM
 *  analysis does not offer, such as Newman-Keuls). */
export function rmMethod(o: ColumnOptionsState): RmMethod | null {
  const m = o.comparisons as string;
  return (RM_METHODS as readonly string[]).includes(m) ? m as RmMethod : null;
}

/** The baseline (Dunnett's control): controlIndex when it is a treatment
 *  of the table, else the first. */
export function rmBaseline(o: ColumnOptionsState, k: number): number {
  const c = o.controlIndex;
  return Number.isInteger(c) && c >= 0 && c < k ? c : 0;
}

/** Error term: each pair's paired differences (default, sphericity not
 *  assumed) or the pooled RM ANOVA residual (sphericity assumed). */
export function rmError(o: ColumnOptionsState): "per_pair" | "pooled" {
  return o.rmComparisonsError === "pooled" ? "pooled" : "per_pair";
}

/** The engine's rm_anova `comparisons` block, or null for none. */
export function rmComparisonsSpec(o: ColumnOptionsState, k: number): Record<string, unknown> | null {
  if (o.analysis !== "rm_anova" || o.rmKind !== "parametric" || k < 2) return null;
  const method = rmMethod(o);
  if (!method) return null;
  const spec: Record<string, unknown> = { method, control: rmBaseline(o, k), error: rmError(o) };
  if (PLANNED_METHODS.has(method)) {
    const fam = effectiveFamily(o, k);
    if (fam === "control") spec.family = "control";
    else if (fam === "pairs") { spec.family = "pairs"; spec.pairs = validPairs(o.plannedPairs, k); }
  }
  return spec;
}

/** Rows (subjects) with some but not all treatments: RM ANOVA leaves them
 *  out; the mixed model keeps them. First subcolumn of each data set. */
export function incompleteSubjects(table: DataTableModel): number {
  const sets = numericData(table).datasets;
  const nRows = Math.max(0, ...sets.map((d) => d.ys.length));
  let n = 0;
  for (let r = 0; r < nRows; r++) {
    const have = sets.filter((d) => {
      const v = d.ys[r]?.[0];
      return typeof v === "number" && Number.isFinite(v);
    }).length;
    if (have > 0 && have < sets.length) n++;
  }
  return n;
}

/** Fit the mixed-effects model instead of RM ANOVA: chosen, parametric,
 *  and some subject is missing a value. */
export function fitsMixedModel(o: ColumnOptionsState, table: DataTableModel): boolean {
  return o.analysis === "rm_anova" && o.rmKind === "parametric" && !!o.rmMixed
    && incompleteSubjects(table) > 0;
}

/** Options of the engine's mixed_rm_oneway handler (the model's
 *  comparisons use its estimated means; planned families and Holm are not
 *  available there). */
export function mixedOptions(o: ColumnOptionsState, k: number): Record<string, unknown> {
  const m = rmMethod(o);
  const cmp = m ? MIXED_METHODS[m] ?? null : null;
  return { method: "mixed", comparisons: cmp, control_index: rmBaseline(o, k) };
}

/** What the mixed model cannot do of the chosen comparisons, or "". */
export function mixedLimitations(o: ColumnOptionsState, k: number): string {
  const m = rmMethod(o);
  if (!m) return "";
  if (!MIXED_METHODS[m]) return "Holm's correction is not available with the mixed-effects model; choose Holm-Šídák, Šídák or Bonferroni.";
  if (PLANNED_METHODS.has(m) && effectiveFamily(o, k) !== "all") {
    return "With the mixed-effects model the comparisons cover every pair (planned families need complete subjects).";
  }
  return "";
}

/** The methods phrase of the comparisons, e.g. "Dunnett's test vs. Baseline". */
const METHOD_PHRASES: Record<string, string> = {
  tukey: "Tukey's multiple comparisons test",
  dunnett: "Dunnett's test",
  sidak: "Šídák's multiple comparisons test",
  bonferroni: "Bonferroni's multiple comparisons test",
  holm: "t tests with Holm's step-down correction",
  holm_sidak: "the Holm-Šídák multiple comparisons test",
  fisher_lsd: "Fisher's LSD test (without correction for multiple comparisons)",
  fisher: "Fisher's LSD test (without correction for multiple comparisons)",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** The RM comparisons block of a result: rm_anova's `comparisons`, or the
 *  mixed model's `multiple_comparisons`. */
export function rmComparisonsOf(result: unknown): R | null {
  const r = result as R | null;
  if (!r || typeof r !== "object") return null;
  if (r.analysis === "rm_one_way_anova" && r.comparisons && typeof r.comparisons === "object"
    && Array.isArray(r.comparisons.comparisons)) return r.comparisons;
  if (r.analysis === "mixed_rm_one_way" && r.multiple_comparisons
    && Array.isArray(r.multiple_comparisons.comparisons)) return r.multiple_comparisons;
  return null;
}

/** "Dunnett's test vs. Baseline after repeated-measures one-way ANOVA with
 *  the Geisser-Greenhouse correction, each comparison using only the
 *  paired differences of its two treatments" (the methods sentence). */
export function rmMethodsSentence(result: unknown): string {
  const r = result as R | null;
  if (!r) return "";
  const mc = rmComparisonsOf(r);
  const mixed = r.analysis === "mixed_rm_one_way";
  const test = mixed
    ? `a mixed-effects model (restricted maximum likelihood, random subject intercept; ${r.n_missing ?? "some"} missing value${r.n_missing === 1 ? "" : "s"}, ${r.n_subjects} subjects) with the Geisser-Greenhouse correction`
    : "repeated-measures one-way ANOVA with the Geisser-Greenhouse correction";
  if (!mc) return `Matched values were compared by ${test}.`;
  const m = String(mc.method ?? "");
  const names: string[] = Array.isArray(mc.names) ? mc.names : Array.isArray(r.names) ? r.names : [];
  const baseline = m === "dunnett" ? baselineName(mc, names) : null;
  const phrase = (METHOD_PHRASES[m] ?? m) + (baseline ? ` vs. ${baseline}` : "");
  const err = mixed ? "the model's estimated means and their standard errors"
    : mc.error === "per_pair" ? "only the paired differences of its two treatments (sphericity not assumed)"
      : "the pooled residual mean square of the RM ANOVA (sphericity assumed)";
  const size = typeof mc.family?.size === "number" ? mc.family.size : mc.comparisons.length;
  const adj = m === "fisher_lsd" || m === "fisher" ? "" : `, P values adjusted for ${size} comparison${size === 1 ? "" : "s"}`;
  return `Matched values were compared by ${test}, followed by ${phrase}; each comparison used ${err}${adj}.`;
}

/** The baseline a Dunnett family compares with ("Baseline"), from the
 *  family label or the comparisons. */
export function baselineName(mc: R, names: string[] = []): string | null {
  const label = String(mc?.family?.label ?? "");
  const m = /vs\. (?:the control )?(.+?)\)\s*$/.exec(label);
  if (m) return m[1];
  const c = Array.isArray(mc?.comparisons) ? mc.comparisons[0] : null;
  if (c && typeof c.b_index === "number" && names[c.b_index]) return names[c.b_index];
  return null;
}
