// "Analyse on the log scale" for the unpaired (and Welch) t test and the
// ordinary one-way ANOVA: the engine runs the test on log10(values)
// (options.log_scale) and reports geometric means and ratios of geometric
// means with their CIs (engine/opendose/logscale.py). This module decides
// when the option applies, reads the engine's scale_check into the chip
// "SD grows with the mean: analyse on the log scale?", counts the values
// <= 0 that have no logarithm, and writes the fold-change phrases used by
// the results, the sentence, the methods text and the legend. Pure,
// unit-tested (__tests__/logScale.test.ts).
//
// Sources: GraphPad statistics guide, "The lognormal distribution" and
// "Analysis checklist: Lognormal t test"; Bland & Altman (1996),
// "Transforming data", BMJ 312:770 and "The use of transformation when
// comparing two means", BMJ 312:1153.
import type { ColumnOptionsState } from "../../types.ts";
import { formatSig } from "../../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Analyses the log-scale option applies to: the unpaired and Welch t
 *  tests and the ordinary one-way ANOVA (equal SDs), on raw values. A
 *  paired design has its own log-scale test, the ratio paired t test. */
export function logScaleApplies(o: ColumnOptionsState, summaryData = false): boolean {
  if (summaryData) return false;
  if (o.analysis === "ttest") return o.ttestKind === "unpaired" || o.ttestKind === "welch";
  return o.analysis === "anova" && o.anovaKind === "parametric"
    && (o.anovaSd ?? "equal") !== "unequal";
}

/** Engine options for the log scale (nothing when off, so the default
 *  payloads stay as they were). */
export function logScaleOptions(o: ColumnOptionsState, summaryData = false): Record<string, unknown> {
  return o.logScale && logScaleApplies(o, summaryData) ? { log_scale: true } : {};
}

/** The result was computed on the log scale. */
export function onLogScale(result: unknown): boolean {
  const r = result as R | null;
  return !!r && typeof r === "object" && !!r.log_scale && typeof r.log_scale === "object";
}

/** "log10", "ln", "log2" of a log-scale result. */
export function logBase(result: unknown): string {
  const b = (result as R | null)?.log_scale?.base;
  return b === "ln" || b === "log2" ? b : "log10";
}

export interface ScaleSuggestion {
  /** The chip: "SD grows with the mean (SD ratio 4.7): analyse on the log scale?" */
  label: string;
  /** Why, in words (the engine's reason). */
  reason: string;
}

/** The chip suggesting the log scale, from the engine's scale_check of a
 *  result that was not on the log scale (null when it does not suggest it). */
export function scaleSuggestion(result: unknown): ScaleSuggestion | null {
  const r = result as R | null;
  if (!r || typeof r !== "object" || r.error || onLogScale(r)) return null;
  const sc = r.scale_check as R | undefined;
  if (!sc || sc.suggest_log !== true) return null;
  const groups = Array.isArray(sc.groups) ? sc.groups.filter((g: R) => num(g?.sd)).length : 0;
  const measure = groups >= 3 && num(sc.pearson_r_sd_mean)
    ? `r(SD, mean) = ${sc.pearson_r_sd_mean.toFixed(2)}`
    : num(sc.sd_ratio_max_min) ? `SD ratio ${sc.sd_ratio_max_min.toFixed(1)}` : "";
  return {
    label: `SD grows with the mean${measure ? ` (${measure})` : ""}: analyse on the log scale?`,
    reason: String(sc.reason ?? ""),
  };
}

export interface DroppedValues {
  count: number;
  /** [group, values left out] for groups that lost values. */
  groups: [string, number][];
  label: string;
}

/** Values <= 0 the log-scale analysis left out (no logarithm), or null. */
export function droppedValues(result: unknown): DroppedValues | null {
  const ls = (result as R | null)?.log_scale as R | undefined;
  if (!ls || !num(ls.n_dropped) || ls.n_dropped <= 0) return null;
  const by = ls.values_dropped && typeof ls.values_dropped === "object"
    ? Object.entries(ls.values_dropped as Record<string, unknown>)
      .filter((e): e is [string, number] => num(e[1]) && e[1] > 0) : [];
  const n = ls.n_dropped;
  const pairs = num(ls.pairs_dropped) && ls.pairs_dropped > 0;
  return {
    count: n, groups: by,
    label: pairs
      ? `${n} pair${n === 1 ? "" : "s"} with a value ≤ 0 ${n === 1 ? "was" : "were"} left out: logarithms are undefined`
      : `${n} value${n === 1 ? "" : "s"} ≤ 0 ${n === 1 ? "was" : "were"} left out: logarithms are undefined`,
  };
}

/** A fold change to three significant digits ("2.97"). */
export function foldNumber(v: number): string {
  return formatSig(v, 3);
}

/** "Treated/Control = 2.97-fold (95% CI 1.67–5.28)". */
export function foldPhrase(a: string, b: string, ratio: unknown, ci: unknown,
  level = 0.95): string {
  if (!num(ratio)) return "";
  const c = Array.isArray(ci) && num(ci[0]) && num(ci[1])
    ? ` (${Math.round(level * 100)}% CI ${foldNumber(ci[0])}–${foldNumber(ci[1])})` : "";
  return `${a}/${b} = ${foldNumber(ratio)}-fold${c}`;
}

/** The two-group ratio of a log-scale t test: "Treated/Control = 2.97-fold
 *  (95% CI 1.67–5.28)" (A / B as the engine reports it), or "". */
export function ttestFold(result: unknown): string {
  const r = result as R | null;
  if (!onLogScale(r) || !r) return "";
  const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["A", "B"];
  return foldPhrase(a, b, r.ratio, r.ratio_ci);
}

/** "Low vs. Control" -> ["Low", "Control"] (the engine's pair label, A/B). */
export function pairNames(pair: unknown): [string, string] | null {
  if (typeof pair !== "string") return null;
  const i = pair.indexOf(" vs. ");
  return i > 0 ? [pair.slice(0, i), pair.slice(i + 5)] : null;
}

/** The comparisons of a log-scale ANOVA as fold changes, one phrase each. */
export function comparisonFolds(result: unknown): string[] {
  const r = result as R | null;
  if (!onLogScale(r) || !r) return [];
  const mc = r.multiple_comparisons as R | undefined;
  if (!mc || !Array.isArray(mc.comparisons)) return [];
  return mc.comparisons.map((c: R) => {
    const n = pairNames(c.pair);
    return n && num(c.ratio) ? foldPhrase(n[0], n[1], c.ratio, c.ratio_ci) : "";
  }).filter(Boolean);
}

/** The methods clause: "analysed on log10-transformed values; back-transformed
 *  geometric means and ratios of geometric means (with 95% CIs) are reported". */
export function logMethodsClause(result: unknown): string {
  if (!onLogScale(result)) return "";
  return `analysed on ${logBase(result)}-transformed values; back-transformed geometric means `
    + "and ratios of geometric means are reported with 95% CIs";
}

/** The methods sentence added after the test's own sentence. */
export function logMethodsSentence(result: unknown): string {
  if (!onLogScale(result)) return "";
  const d = droppedValues(result);
  return `Data were ${logMethodsClause(result)}; P values are those of the test on the `
    + "logarithms (Bland & Altman 1996, BMJ 312:1153)"
    + (d ? `. ${d.count} value${d.count === 1 ? "" : "s"} ≤ 0 (no logarithm) ${d.count === 1 ? "was" : "were"} left out` : "")
    + ".";
}

/** The figure-legend clause for a log-scale result. */
export function logLegendClause(result: unknown): string {
  if (!onLogScale(result)) return "";
  const fold = ttestFold(result);
  return `Statistics on ${logBase(result)}-transformed values (geometric means; ratios of `
    + `geometric means with 95% CIs)${fold ? `: ${fold}` : ""}.`;
}
