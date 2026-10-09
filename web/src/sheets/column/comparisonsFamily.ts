// Which comparisons a post test makes (its family): every pair, each
// group vs. a control, or the pairs planned before the experiment. The
// correction then counts exactly that family, so a planned family of two
// comparisons is adjusted for two, not for every pair (GraphPad statistics
// guide, "Options tab, multiple comparisons (one-way ANOVA)": Šídák for
// selected pairs; Dunn 1964 for the rank-sum family). Pure, unit-tested.
import type { ColumnOptionsState } from "../../types.ts";

export type ComparisonsFamily = "all" | "control" | "pairs";

/** Post tests after ordinary one-way ANOVA that accept a planned family
 *  (Tukey and Newman-Keuls have their own fixed all-pairs family, Dunnett
 *  its control family). */
export const PLANNED_METHODS: ReadonlySet<string> = new Set([
  "sidak", "bonferroni", "holm_sidak", "holm", "fisher_lsd",
]);

/** Where the family applies: Dunn's test (after Kruskal-Wallis or
 *  Friedman), a one-way ANOVA post test that accepts planned families, or
 *  nowhere (null). */
export function familyTarget(o: ColumnOptionsState, summaryData = false): "dunn" | "posthoc" | null {
  if (o.analysis === "anova" && o.anovaKind === "nonparametric") return "dunn";
  if (o.analysis === "rm_anova" && o.rmKind === "nonparametric") return "dunn";
  if (!summaryData && o.analysis === "anova" && o.anovaKind === "parametric"
    && (o.anovaSd ?? "equal") !== "unequal" && PLANNED_METHODS.has(o.comparisons)) return "posthoc";
  // after RM one-way ANOVA (rmPosthoc.ts builds the engine's block)
  if (!summaryData && o.analysis === "rm_anova" && o.rmKind === "parametric"
    && PLANNED_METHODS.has(o.comparisons)) return "posthoc";
  return null;
}

/** Every pair [i, j] (i < j) of k groups. */
export function allPairs(k: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) out.push([i, j]);
  return out;
}

/** The ticked pairs that are usable for k groups: in range, two different
 *  groups, each pair once (in the order first ticked). */
export function validPairs(pairs: unknown, k: number): [number, number][] {
  if (!Array.isArray(pairs)) return [];
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const p of pairs) {
    if (!Array.isArray(p) || p.length !== 2) continue;
    const [i, j] = [Number(p[0]), Number(p[1])];
    if (!Number.isInteger(i) || !Number.isInteger(j) || i === j) continue;
    if (i < 0 || j < 0 || i >= k || j >= k) continue;
    const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([i, j]);
  }
  return out;
}

/** The family actually used: "pairs" with no usable pair, or a control out
 *  of range, falls back to every pair. */
export function effectiveFamily(o: ColumnOptionsState, k: number): ComparisonsFamily {
  const fam = o.comparisonsFamily ?? "all";
  if (fam === "pairs" && !validPairs(o.plannedPairs, k).length) return "all";
  if (fam === "control" && (o.controlIndex < 0 || o.controlIndex >= k)) return "all";
  return fam;
}

/** Number of comparisons in the family of k groups. */
export function familySize(o: ColumnOptionsState, k: number): number {
  const fam = effectiveFamily(o, k);
  if (fam === "control") return Math.max(0, k - 1);
  if (fam === "pairs") return validPairs(o.plannedPairs, k).length;
  return (k * (k - 1)) / 2;
}

/** The engine options for the family (nothing for every pair, so the
 *  default payloads stay as they were). */
export function familyOptions(o: ColumnOptionsState, k: number,
  summaryData = false): Record<string, unknown> {
  const target = familyTarget(o, summaryData);
  const fam = effectiveFamily(o, k);
  if (!target || fam === "all") return {};
  if (fam === "control") {
    return target === "dunn" ? { dunn_family: "control", control: o.controlIndex }
      : { comparisons_family: "control" };
  }
  const pairs = validPairs(o.plannedPairs, k);
  return target === "dunn" ? { dunn_family: "pairs", pairs } : { comparisons_family: "pairs", pairs };
}

/** Tick or untick the planned pair [i, j]. */
export function togglePair(pairs: unknown, i: number, j: number, on: boolean): [number, number][] {
  const list = Array.isArray(pairs) ? (pairs as [number, number][]) : [];
  const rest = list.filter((p) => !(Array.isArray(p) && ((p[0] === i && p[1] === j)
    || (p[0] === j && p[1] === i))));
  return on ? [...rest, [i, j]] : rest;
}
