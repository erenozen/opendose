// Shared pure parts of the mixed models whose random intercept is an
// experimental unit (mouse, litter, culture): the nested two-way ANOVA of
// grouped tables (sheets/grouped/nestedTwoWay.ts, engine handler
// mixed_nested_two_way) and the grouping-column model of multiple-variables
// tables (sheets/multivariable/mixedGrouping.ts, mixed_grouping). Both
// share one results panel and one graph (./mixedPanels.tsx); this module
// holds their options, unit words, the family header of the comparisons,
// the brackets of the graph, the sentence on the ICC and the methods text.
// Pure (no React, no engine): unit-tested in __tests__/mixedModel.test.ts.
import type { ComparisonSet } from "../../graph/results.ts";
import { pEquals } from "../../report/pformat.ts";
import { formatSig } from "../../types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** Graph kind of the nested scatter of unit means (stored: never rename). */
export const G_MIXED_NESTED = "mixed_nested_scatter";

export interface Source { label: string; url: string }

/** Sources cited in the panels (each URL loaded on 2026-10-09). */
export const MIXED_SRC = {
  aarts2014: { label: "Aarts et al. 2014, A solution to dependency: using multilevel analysis to accommodate nested data, Nat Neurosci 17:491",
    url: "https://doi.org/10.1038/nn.3648" },
  lazic2010: { label: "Lazic 2010, The problem of pseudoreplication in neuroscientific studies, BMC Neurosci 11:5",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/" },
  lme4: { label: "Bates et al. 2015, Fitting linear mixed-effects models using lme4, J Stat Softw 67(1)",
    url: "https://doi.org/10.18637/jss.v067.i01" },
  gpNested: { label: "GraphPad Statistics Guide: Overview of nested t tests and ANOVA",
    url: "https://www.graphpad.com/guides/prism/latest/statistics/stat_overview-of-nested-t-tests.htm" },
  gpMixedRm: { label: "GraphPad Statistics Guide: The mixed model approach to analyzing repeated measures data",
    url: "https://www.graphpad.com/guides/prism/latest/statistics/stat_anova-approach-vs_-mixed-model.htm" },
  pinheiroBates: { label: "Pinheiro & Bates 2000, Mixed-Effects Models in S and S-PLUS, Springer, ch. 5",
    url: "https://doi.org/10.1007/b98882" },
  littell2006: { label: "Littell et al. 2006, SAS for Mixed Models, 2nd ed., SAS Institute, ch. 5", url: "" },
} satisfies Record<string, Source>;

// ------------------------------------------------------------ options

export type MixedComparisons =
  | "none" | "tukey" | "dunnett" | "bonferroni" | "sidak" | "holm_sidak" | "holm" | "fisher";

export const MIXED_COMPARISON_LABELS: Record<MixedComparisons, string> = {
  none: "No multiple comparisons",
  tukey: "Tukey (every pair)",
  dunnett: "Dunnett (each vs. a control)",
  sidak: "Šídák",
  holm_sidak: "Holm-Šídák",
  bonferroni: "Bonferroni",
  holm: "Holm",
  fisher: "Fisher's LSD (no correction)",
};

export type ComparisonScope = "b_within_a" | "a_within_b" | "cells" | "a_means" | "b_means";

export const SCOPES: ComparisonScope[] = ["b_within_a", "a_within_b", "cells", "a_means", "b_means"];

/** What each scope compares, in the factors' own names. */
export function scopeLabel(scope: ComparisonScope, a: string, b: string | null): string {
  if (!b) return `${a}: every pair of levels`;
  switch (scope) {
    case "b_within_a": return `${b} within each level of ${a}`;
    case "a_within_b": return `${a} within each level of ${b}`;
    case "cells": return `Every pair of cells (${a} × ${b})`;
    case "a_means": return `${a} (marginal means, averaged over ${b})`;
    default: return `${b} (marginal means, averaged over ${a})`;
  }
}

export type NegativeVariance = "allow" | "zero";

/** The experimental unit: a preset (singular / plural) or a word typed in. */
export const UNIT_PRESETS: { id: string; singular: string; plural: string }[] = [
  { id: "mouse", singular: "mouse", plural: "mice" },
  { id: "rat", singular: "rat", plural: "rats" },
  { id: "animal", singular: "animal", plural: "animals" },
  { id: "litter", singular: "litter", plural: "litters" },
  { id: "cage", singular: "cage", plural: "cages" },
  { id: "culture", singular: "culture", plural: "cultures" },
  { id: "dish", singular: "dish", plural: "dishes" },
  { id: "donor", singular: "donor", plural: "donors" },
  { id: "patient", singular: "patient", plural: "patients" },
  { id: "experiment", singular: "experiment", plural: "experiments" },
  { id: "slice", singular: "slice", plural: "slices" },
];

export interface UnitWords { singular: string; plural: string }

/** Unit words from the options: a preset id, or "other" with a typed
 *  plural (the singular drops a final "s"). */
export function unitWords(unit: string, custom = ""): UnitWords {
  const p = UNIT_PRESETS.find((u) => u.id === unit);
  if (p) return { singular: p.singular, plural: p.plural };
  const plural = custom.trim() || "units";
  const singular = plural.endsWith("ies") ? `${plural.slice(0, -3)}y`
    : plural.endsWith("s") && plural.length > 1 ? plural.slice(0, -1) : plural;
  return { singular, plural };
}

/** Options shared by the two analyses. */
export interface MixedUnitOptions {
  unit: string;
  unitCustom: string;
  comparisons: MixedComparisons;
  scope: ComparisonScope;
  controlIndex: number;
  ciLevel: number;
  negativeVariance: NegativeVariance;
}

export const DEFAULT_MIXED_UNIT: MixedUnitOptions = {
  unit: "mouse", unitCustom: "", comparisons: "tukey", scope: "b_within_a",
  controlIndex: 0, ciLevel: 0.95, negativeVariance: "allow",
};

const obj = (raw: unknown): R => (raw && typeof raw === "object" ? raw as R : {});

export function normalizeMixedUnit(raw: unknown): MixedUnitOptions {
  const o = obj(raw);
  const d = DEFAULT_MIXED_UNIT;
  return {
    unit: typeof o.unit === "string" && o.unit ? o.unit : d.unit,
    unitCustom: typeof o.unitCustom === "string" ? o.unitCustom : d.unitCustom,
    comparisons: typeof o.comparisons === "string" && o.comparisons in MIXED_COMPARISON_LABELS
      ? o.comparisons as MixedComparisons : d.comparisons,
    scope: SCOPES.includes(o.scope) ? o.scope : d.scope,
    controlIndex: Number.isInteger(o.controlIndex) && o.controlIndex >= 0 ? o.controlIndex : 0,
    ciLevel: typeof o.ciLevel === "number" && o.ciLevel > 0.5 && o.ciLevel < 1 ? o.ciLevel : 0.95,
    negativeVariance: o.negativeVariance === "zero" ? "zero" : "allow",
  };
}

/** The engine options the two handlers share. */
export function engineUnitOptions(o: MixedUnitOptions): R {
  return {
    unit_name: unitWords(o.unit, o.unitCustom).plural,
    negative_variance: o.negativeVariance,
    ci_level: o.ciLevel,
    comparisons: o.comparisons === "none" ? null : o.comparisons,
    comparison_scope: o.scope,
    control_index: o.controlIndex,
  };
}

// ------------------------------------------------------------ comparisons

export const METHOD_NAMES: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", bonferroni: "Bonferroni", sidak: "Šídák",
  holm_sidak: "Holm-Šídák", holm: "Holm", fisher_lsd: "Fisher's LSD", fisher: "Fisher's LSD",
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** How the P values of a comparisons block (the engine's
 *  family_comparisons) are adjusted: "adjusted for 6 comparisons
 *  (Šídák)", "adjusted for 1 comparison within each of 2 families
 *  (Tukey)", "not adjusted for the 4 comparisons (Fisher's LSD)". */
export function adjustedText(block: R | null | undefined): string {
  const fam = block?.family ?? {};
  const method = String(fam.method ?? block?.method ?? "");
  const name = METHOD_NAMES[method] ?? method;
  const size = typeof fam.size === "number" ? fam.size : (block?.comparisons?.length ?? 0);
  if (method === "fisher_lsd" || method === "fisher") {
    return `not adjusted for the ${plural(block?.n_comparisons ?? size, "comparison")} (${name})`;
  }
  if (fam.per_family && (fam.n_families ?? 1) > 1) {
    return `adjusted for ${plural(size, "comparison")} within each of ${fam.n_families} families (${name})`;
  }
  return `adjusted for ${plural(size, "comparison")} (${name})`;
}

/** Split "A vs. B" into two of the given names (names may hold " vs. "). */
export function splitPairOf(pair: string, names: readonly string[]): [string, string] | null {
  for (const a of names) {
    if (!pair.startsWith(`${a} vs. `)) continue;
    const b = pair.slice(a.length + 5);
    if (names.includes(b)) return [a, b];
  }
  return null;
}

/** Factor names and levels of a result (two factors, or one). */
export function factorsOf(result: R | null | undefined): { a: string; b: string | null; la: string[]; lb: string[] } {
  const names: string[] = Array.isArray(result?.factor_names) ? result!.factor_names : [];
  const lv = (n: string | undefined) => (n && Array.isArray(result?.levels?.[n]) ? result!.levels[n].map(String) : []);
  return { a: names[0] ?? "A", b: names[1] ?? null, la: lv(names[0]), lb: lv(names[1]) };
}

/** Where each cell sits on the nested scatter: A groups side by side, the
 *  B levels within each, a gap between groups. */
export const CELL_GAP = 0.9;

export function cellX(ai: number, bi: number, nB: number): number {
  return ai * (Math.max(1, nB) + CELL_GAP) + bi;
}

export interface NestedBrackets { set: ComparisonSet; positions: Map<string, number> }

const posKey = (family: string | undefined, name: string) => `${family ?? ""}␟${name}`;

/** The engine's comparisons as brackets of the nested scatter: every pair
 *  with its family (the level it is within) and the x of each end. */
export function nestedBrackets(result: unknown): NestedBrackets | null {
  const r = result as R | null;
  const block = r?.comparisons;
  if (!r || r.error || !block || !Array.isArray(block.comparisons)) return null;
  const { a, b, la, lb } = factorsOf(r);
  const nB = b ? lb.length : 1;
  const positions = new Map<string, number>();
  const out: ComparisonSet = {
    label: `${METHOD_NAMES[String(block.method)] ?? block.method} multiple comparisons`,
    comparisons: [], unmatched: 0,
  };
  const scope = String(block.scope ?? "");
  for (const c of block.comparisons as R[]) {
    const p = c.p_adjusted;
    if (typeof p !== "number" || typeof c.pair !== "string") { out.unmatched++; continue; }
    const famText = typeof c.family === "string" ? c.family : "";
    if (b && (scope === "b_within_a" || scope === "a_within_b")) {
      const outerName = scope === "b_within_a" ? a : b;
      const outer = famText.startsWith(`${outerName}: `) ? famText.slice(outerName.length + 2) : "";
      const inner = scope === "b_within_a" ? lb : la;
      const pair = splitPairOf(c.pair, inner);
      const oi = (scope === "b_within_a" ? la : lb).indexOf(outer);
      if (!pair || oi < 0) { out.unmatched++; continue; }
      for (const name of pair) {
        const ii = inner.indexOf(name);
        positions.set(posKey(outer, name), scope === "b_within_a" ? cellX(oi, ii, nB) : cellX(ii, oi, nB));
      }
      out.comparisons.push({ a: pair[0], b: pair[1], p, family: outer });
    } else if (scope === "cells" || !b) {
      const names = b ? la.flatMap((x) => lb.map((y) => `${x} / ${y}`)) : la;
      const pair = splitPairOf(c.pair, names);
      if (!pair) { out.unmatched++; continue; }
      for (const name of pair) {
        const k = names.indexOf(name);
        positions.set(posKey(undefined, name), b ? cellX(Math.floor(k / nB), k % nB, nB) : cellX(k, 0, 1));
      }
      out.comparisons.push({ a: pair[0], b: pair[1], p });
    } else if (scope === "a_means") {
      const pair = splitPairOf(c.pair, la);
      if (!pair) { out.unmatched++; continue; }
      for (const name of pair) positions.set(posKey(undefined, name), cellX(la.indexOf(name), (nB - 1) / 2, nB));
      out.comparisons.push({ a: pair[0], b: pair[1], p });
    } else {
      // B marginal means span every A group: no single place for a bracket
      out.unmatched++;
    }
  }
  return { set: out, positions };
}

export function bracketX(b: NestedBrackets | null, name: string, family?: string): number | null {
  return b?.positions.get(posKey(family, name)) ?? null;
}

// ------------------------------------------------------------ words

/** One sentence on the ICC and what it means for n (Aarts et al. 2014). */
export function iccSentence(r: R, words: UnitWords): string {
  if (typeof r.icc !== "number") return "";
  const pct = Math.round(r.icc * 100);
  const m = typeof r.mean_values_per_unit === "number" ? formatSig(r.mean_values_per_unit, 3) : "?";
  const de = typeof r.design_effect === "number" ? formatSig(r.design_effect, 3) : "?";
  const eff = typeof r.effective_n === "number" ? formatSig(r.effective_n, 3) : "?";
  return `ICC = ${formatSig(r.icc, 3)}: ${pct}% of the variation lies between ${words.plural}, so `
    + `values from one ${words.singular} are not independent. With ${m} `
    + `values per ${words.singular} the design effect is 1 + (${m} − 1) × ICC = ${de}: the ${r.n_values} values `
    + `carry about as much information as ${eff} independent ones, and counting them as n would `
    + "make P values far too small.";
}

/** "the interaction" etc.: the ANOVA terms joined for a sentence. */
function factorPhrase(names: string[]): string {
  if (names.length === 2) return `${names[0]}, ${names[1]} and their interaction`;
  return names[0] ?? "the factor";
}

/** Copyable methods paragraph of the nested two-way / grouping model. */
export function mixedMethodsText(r: R, words: UnitWords, outcome: string): string {
  const names: string[] = Array.isArray(r.factor_names) ? r.factor_names : [];
  const formula = String(r.formula ?? "").replace(/\(1 \| unit\)/, `(1 | ${words.singular})`);
  const nUnits = r.n_units;
  const nested = r.unit_nested_in ? Object.values(r.unit_nested_in).every(Boolean) : true;
  let t = `${cap(outcome)} was analysed with a linear mixed model with ${factorPhrase(names)} as `
    + `fixed effects and ${words.singular} as a random intercept (${formula}), fitted by restricted `
    + "maximum likelihood (REML). Fixed effects were tested with Type III Wald F tests whose "
    + `denominator degrees of freedom come from the ${nUnits} ${words.plural}, not from the `
    + `${r.n_values} individual values (containment method: ${nUnits} ${words.plural} − `
    + `${r.n_cells} cells = ${r.df?.units} df${nested ? "" : `; factors varying within ${words.plural} on the residual ${r.df?.residual} df`}). `;
  const rows: R[] = Array.isArray(r.anova) ? r.anova : [];
  if (rows.length) {
    t += rows.map((x) => `${x.term}: F(${x.dfn}, ${x.dfd}) = ${formatSig(x.f)}, P ${pEquals(x.p)}`)
      .join("; ") + ". ";
  }
  const cmp = r.comparisons;
  if (cmp && Array.isArray(cmp.comparisons) && cmp.comparisons.length) {
    const { a, b } = factorsOf(r);
    t += `${scopeLabel(cmp.scope as ComparisonScope, a, b)} ${b ? "was" : "were"} compared on the `
      + `model-estimated means, with P values ${adjustedText(cmp)}. `;
  }
  if (typeof r.icc === "number") {
    t += `The between-${words.singular} variance was ${formatSig(r.variance_components?.unit?.variance)} `
      + `and the residual variance ${formatSig(r.variance_components?.residual?.variance)} `
      + `(intraclass correlation ${formatSig(r.icc, 3)}). `;
  }
  t += "Analysis in OpenDose (open-source, built on SciPy).";
  return t;
}

/** What the nested scatter draws (the legend's first sentence). */
export function mixedPlotted(words: UnitWords, ciLevel = 0.95): string {
  const lvl = `${Number((ciLevel * 100).toPrecision(4))}%`;
  return `Points show the mean of each ${words.singular}; horizontal lines show the cell mean `
    + `estimated by a mixed model with ${words.singular} as a random intercept, with its ${lvl} `
    + `confidence interval; df come from ${words.plural}, not from individual values.`;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
