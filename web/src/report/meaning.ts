// "What this means": one plain sentence under the key result of an
// analysis, saying what the number means in the user's own groups, plus
// the way that kind of result is most often misread and the test that was
// run with why it fits (needs `plain-language-results`, `nonsig-wording`,
// `explain-test-choice-in-output`).
//
// Wording rules, with their sources:
// - P is the chance of data at least this extreme IF there were no
//   difference; it is not the chance that there is none, and a small P
//   does not say the effect is large or important (Greenland et al. 2016,
//   misinterpretations 1, 2 and 9-11 of their list).
// - P above the threshold is never "no difference", "no effect" or "a
//   trend": the data do not show a difference, and the CI says which
//   differences remain compatible with them (Amrhein, Greenland & McShane
//   2019; Greenland et al. 2016).
// - One-way ANOVA says the means are not all equal, not which differ; an
//   interaction means one factor's effect depends on the other; a hazard
//   ratio compares event rates at every moment; an odds ratio is not a
//   relative risk; correlation is not causation; an IC50 is halfway
//   between the curve's own plateaus (GraphPad Statistics and Curve
//   Fitting Guides, pages cited per meaning).
//
// Every number comes from the engine's result; the only arithmetic here is
// a difference of two means, a ratio as a percentage, a share r² as a
// percentage and the 81^(1/h) span of a Hill curve. P values are written
// through pformat.ts. Pure (no React); unit-tested (meaning.test.ts).
import { formatSig } from "../types.ts";
import { formatPValue, type PStyle } from "./pformat.ts";
import { DEFAULT_REPORT } from "./prefs.ts";
import { POSTHOC_NAMES } from "./describe.ts";
import { ratioClause } from "./ratioToControl.ts";
import { withheldInfo } from "../sheets/common/withheld.ts";
import { SRC, type Source } from "../guide/sources.ts";
import { REF_SOURCES } from "../sheets/assays/qpcr/refs.ts";
import { assayMeaning } from "./meaningMore.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** What a meaning needs from the data table (a DataTableModel fits). */
export interface MeaningTable {
  type?: string;
  xTitle?: string;
  yTitle?: string;
  xUnit?: string;
  rowTitles?: string[];
  datasets?: { name: string }[];
  factorNames?: { rows?: string; datasets?: string };
}

export interface MeaningInput {
  /** The results sheet's analysis id ("column", "cox", ...). */
  analysisId?: string;
  result: unknown;
  options?: unknown;
  table?: MeaningTable | null;
  /** P-value style (Preferences → Reporting). */
  style?: PStyle;
}

export interface Meaning {
  /** One sentence: the result in the user's own groups and units. */
  sentence: string;
  /** How this kind of result is often misread, and the correct reading. */
  misreading?: string;
  /** The test that was run and why it fits (what it compares, what it assumes). */
  test?: string;
  sources: Source[];
}

// ------------------------------------------------------------- sources

const GP_S = "https://www.graphpad.com/guides/prism/latest/statistics/";
const GP_C = "https://www.graphpad.com/guides/prism/latest/curve-fitting/";

export const MEANING_SOURCES = {
  // P is computed assuming the null; it is not the probability the null is
  // true; P > 0.05 is not evidence for the null; a 95% CI is not a 95%
  // probability statement about this interval; significance is not size.
  greenland2016: { label: "Greenland et al. 2016, Statistical tests, P values, confidence intervals, and power: a guide to misinterpretations, Eur J Epidemiol 31:337",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4877414/" },
  // "Don't say 'no difference' or 'no association' just because a P value
  // is larger than a threshold"; read CIs as compatibility intervals.
  amrhein2019: { label: "Amrhein, Greenland & McShane 2019, Scientists rise up against statistical significance, Nature 567:305",
    url: "https://doi.org/10.1038/d41586-019-00857-9" },
  // kappa = (observed − chance agreement) / (1 − chance agreement).
  cohen1960: { label: "Cohen 1960, A coefficient of agreement for nominal scales, Educ Psychol Meas 20:37",
    url: "https://doi.org/10.1177/001316446002000104" },
  // Sources below were loaded and read on 2026-10-09.
  gpUnpairedT: { label: "GraphPad Statistics Guide: Interpreting results: Unpaired t",
    url: `${GP_S}how_the_unpaired_t_test_works2.htm` },
  gpPairedT: { label: "GraphPad Statistics Guide: Interpreting results: Paired t",
    url: `${GP_S}interpretingpairedttests.htm` },
  // Compares distributions of ranks; medians only if the shapes are equal.
  gpMannWhitney: { label: "GraphPad Statistics Guide: Interpreting results: Mann-Whitney test",
    url: `${GP_S}how_the_mann-whitney_test_works.htm` },
  // "This does not imply that every mean is different from every other mean."
  gpOneWay: { label: "GraphPad Statistics Guide: Interpreting results: One-way ANOVA",
    url: `${GP_S}f_ratio_and_anova_table_%28one-way_anova%29.htm` },
  // The interaction tests whether the differences between columns are
  // consistent across rows.
  gpInteraction: SRC.gpTwoWayResults,
  // r² is the fraction of variance shared; another variable may influence both.
  gpCorrelation: { label: "GraphPad Statistics Guide: Interpreting results: Correlation",
    url: `${GP_S}stat_interpreting_results_correlati.htm` },
  // "It equals the change in Y for each unit change in X."
  gpSlope: { label: "GraphPad Curve Fitting Guide: Slope and intercept",
    url: `${GP_C}slopeandintercept.htm` },
  gpMultipleReg: { label: "GraphPad Curve Fitting Guide: Parameter values from multiple regression",
    url: `${GP_C}reg_parameter-values-from-multiple.htm` },
  gpLogisticOr: { label: "GraphPad Curve Fitting Guide: Odds ratios (multiple logistic regression)",
    url: `${GP_C}reg_multiple_logistic_results_odds_ratios.htm` },
  // "the ratio of proportions".
  gpRelativeRisk: { label: "GraphPad Statistics Guide: Interpreting results: Relative risk",
    url: `${GP_S}stat_interpreting_results_contingen.htm` },
  // The odds ratio approximates the relative risk only for rare outcomes.
  gpOddsRatio: { label: "GraphPad Statistics Guide: Interpreting results: Odds ratio",
    url: `${GP_S}stat_interpreting_results_odds_rati.htm` },
  gpContingencyP: { label: "GraphPad Statistics Guide: Interpreting results: P values from contingency tables",
    url: `${GP_S}stat_interpreting_results_contingen_2_2.htm` },
  gpNestedT: { label: "GraphPad Statistics Guide: Interpreting results: Nested t test",
    url: `${GP_S}stat_interpreting-results-nested-t-.htm` },
  // EC50: halfway between Bottom and Top.
  gpEc50: { label: "GraphPad Curve Fitting Guide: The EC50",
    url: `${GP_C}reg_the_ec50.htm` },
  // A standard slope is 1.0; steeper curves have larger slopes.
  gpHillSlope: { label: "GraphPad Curve Fitting Guide: Hill slope",
    url: `${GP_C}reg_hill_slope.htm` },
} satisfies Record<string, Source>;

const S = MEANING_SOURCES;

// ------------------------------------------------------------- helpers

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ci2 = (v: unknown): [number, number] | null =>
  (Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]) ? [v[0], v[1]] : null);
const ALPHA = 0.05;

/** A number as the results sheet shows it, with a real minus sign. */
export function fmt(v: number): string {
  return formatSig(v).replace(/^-/, "−");
}
const abs = (v: number) => fmt(Math.abs(v));
const pct = (v: number) => `${Math.round(v)}%`;

function list(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The measurement unit in a Y title such as "Tumour volume (mm³)". */
export function unitFromTitle(title: string | undefined): string {
  const m = /\(([^()]{1,24})\)\s*$/.exec(title ?? "");
  return m ? m[1].trim() : "";
}

function withUnit(v: string, unit: string): string {
  if (!unit) return v;
  return unit === "%" ? `${v}%` : `${v} ${unit}`;
}

/** "P = 0.0012" in the project's style. */
function P(p: number, style: PStyle): string {
  return formatPValue(p, style);
}

const dedupe = (xs: Source[]) => xs.filter((s, i) => xs.findIndex((t) => t.url === s.url) === i);

function meaning(sentence: string, sources: Source[], misreading?: string, test?: string): Meaning {
  return { sentence, sources: dedupe(sources), ...(misreading ? { misreading } : {}),
    ...(test ? { test } : {}) };
}

// The two misreadings every P value invites (Greenland et al. 2016;
// Amrhein et al. 2019).
const MIS_SIG = (p: string) => `${p} is the probability that there is no real difference, or that chance `
  + "alone produced the result. P is computed assuming there is no difference; it is not the probability "
  + "that there is none, and a small P does not say the difference is large or important.";
const MIS_NS = "“no difference” or “a trend”. A P value above 0.05 does not show the groups "
  + "are the same: the data are compatible with every difference inside the confidence interval.";

// ------------------------------------------------------------- two groups

interface Diff {
  /** b − a (b relative to a). */
  d: number;
  ci: [number, number] | null;
}

/** b − a with its CI, from an engine difference that may be a − b. The
 *  means (when given) decide which way the engine subtracted. */
function bMinusA(diff: unknown, ci: unknown, meanA?: unknown, meanB?: unknown): Diff | null {
  if (!num(diff)) return null;
  const c = ci2(ci);
  let aMinusB = true;
  if (num(meanA) && num(meanB) && meanA !== meanB) {
    aMinusB = Math.sign(diff) === Math.sign(meanA - meanB);
  }
  return aMinusB ? { d: -diff, ci: c ? [-c[1], -c[0]] : null } : { d: diff, ci: c };
}

/** "3.13 to 7.27 higher" / "1.50 lower to 2.20 higher" for b − a. */
function ciWords(ci: [number, number], unit: string, up = "higher", down = "lower"): string {
  const [lo, hi] = ci;
  if (lo >= 0) return `${abs(lo)} to ${withUnit(abs(hi), unit)} ${up}`;
  if (hi <= 0) return `${abs(hi)} to ${withUnit(abs(lo), unit)} ${down}`;
  return `${withUnit(abs(lo), unit)} ${down} to ${withUnit(abs(hi), unit)} ${up}`;
}

function ttestMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["group A", "group B"];
  const unit = unitFromTitle(t?.yTitle);
  const p = r.p_two_tailed;
  if (!num(p)) return null;
  const sig = p < ALPHA;
  if (r.log_scale && typeof r.log_scale === "object" && num(r.ratio)) return logTtestMeaning(r, a, b, p, style);
  switch (r.test) {
    case "unpaired_t":
    case "welch_t": {
      const x = bMinusA(r.difference, r.ci_difference, r.mean_a, r.mean_b);
      if (!x) return null;
      const dir = x.d >= 0 ? "higher" : "lower";
      // the ratio to control with its Fieller CI when the engine gives one
      // (unpaired t test, P-18), else the bare percentage
      const ratio = ratioClause(r.ratio_to_control, b, a);
      const rel = ratio ? `; ${ratio}`
        : num(r.mean_a) && num(r.mean_b) && r.mean_a > 0 && r.mean_b > 0
          ? `, ${pct(Math.abs(100 * x.d / r.mean_a))} ${dir}` : "";
      const means = num(r.mean_a) && num(r.mean_b) ? ` (mean ${fmt(r.mean_b)} vs. ${fmt(r.mean_a)}${rel})` : "";
      const test = r.test === "welch_t"
        ? "Unpaired t test with Welch's correction: compares the means of two independent groups without assuming equal SDs."
        : "Unpaired t test: compares the means of two independent groups, assuming similar SDs.";
      if (sig) {
        return meaning(`On average ${b} was ${withUnit(abs(x.d), unit)} ${dir} than ${a}${means}`
          + `${x.ci ? `, 95% CI ${ciWords(x.ci, unit)}` : ""}; a difference this large would be unusual `
          + `(${P(p, style)}) if the groups did not differ.`,
        [S.gpUnpairedT, S.greenland2016], MIS_SIG(P(p, style)), test);
      }
      return meaning(`${b} averaged ${withUnit(abs(x.d), unit)} ${dir} than ${a}${means}, but the data do not `
        + `show a difference (${P(p, style)})${x.ci ? `: the 95% CI runs from ${ciWords(x.ci, unit)}, so `
          + "they are compatible with no difference and with differences of that size" : ""}.`,
      [S.gpUnpairedT, S.amrhein2019], MIS_NS, test);
    }
    case "paired_t": {
      const x = bMinusA(r.mean_difference, r.ci_difference);
      if (!x) return null;
      const dir = x.d >= 0 ? "higher" : "lower";
      const pairs = num(r.n_pairs) ? ` across ${r.n_pairs} pairs` : "";
      const test = "Paired t test: compares matched values through the mean of their differences.";
      if (sig) {
        return meaning(`Within each pair, ${b} was on average ${withUnit(abs(x.d), unit)} ${dir} than ${a}${pairs}`
          + `${x.ci ? ` (95% CI ${ciWords(x.ci, unit)})` : ""}; a mean change this large would be unusual `
          + `(${P(p, style)}) if there were no consistent difference within pairs.`,
        [S.gpPairedT, S.greenland2016], MIS_SIG(P(p, style)), test);
      }
      return meaning(`Within pairs, ${b} averaged ${withUnit(abs(x.d), unit)} ${dir} than ${a}${pairs}, but the data `
        + `do not show a consistent difference (${P(p, style)})${x.ci ? `: the 95% CI runs from ${ciWords(x.ci, unit)}` : ""}.`,
      [S.gpPairedT, S.amrhein2019], MIS_NS, test);
    }
    case "ratio_paired_t": {
      const g = r.geometric_mean_ratio;
      const c = ci2(r.ci_ratio);
      if (!num(g)) return null;
      const test = "Ratio paired t test: compares matched values by their ratio (a paired t test on the logarithms).";
      const ci = c ? ` (95% CI ${fmt(c[0])} to ${fmt(c[1])})` : "";
      if (sig) {
        return meaning(`On average ${a} was ${fmt(g)} times ${b} within a pair${ci}; a ratio this far from 1 `
          + `would be unusual (${P(p, style)}) if the matched values did not differ.`,
        [SRC.gpRatioPaired, S.greenland2016], MIS_SIG(P(p, style)), test);
      }
      return meaning(`On average ${a} was ${fmt(g)} times ${b} within a pair, but the data do not show a `
        + `consistent ratio other than 1 (${P(p, style)})${c ? `: the 95% CI runs from ${fmt(c[0])} to ${fmt(c[1])}` : ""}.`,
      [SRC.gpRatioPaired, S.amrhein2019], MIS_NS, test);
    }
    case "mann_whitney":
    case "wilcoxon_matched_pairs": {
      const mw = r.test === "mann_whitney";
      const x = mw ? bMinusA(r.hodges_lehmann_difference, r.ci_hodges_lehmann, r.median_a, r.median_b)
        : bMinusA(r.median_difference, r.ci_median);
      const dir = x && x.d < 0 ? "lower" : "higher";
      const meds = mw && num(r.median_a) && num(r.median_b)
        ? ` (median ${fmt(r.median_b)} vs. ${fmt(r.median_a)})` : "";
      const shift = x ? `; ${mw ? "the typical shift" : "the median paired difference"} is `
        + `${withUnit(abs(x.d), unit)}${x.ci ? ` (95% CI ${ciWords(x.ci, unit)})` : ""}` : "";
      const test = mw ? "Mann-Whitney test: compares two independent groups by the ranks of their values, not their means."
        : "Wilcoxon matched-pairs signed rank test: compares matched values by the ranks of their differences.";
      const mis = mw ? "a comparison of the two medians. It compares the whole distributions by rank, "
        + "so a small P does not by itself say the medians differ." : sig ? MIS_SIG(P(p, style)) : MIS_NS;
      if (sig) {
        return meaning(`${mw ? `Values in ${b} tended to be ${dir} than in ${a}` : `Within pairs, ${b} tended to be ${dir} than ${a}`}`
          + `${meds}${shift}; ranks this far apart would be unusual (${P(p, style)}) if `
          + `${mw ? "both came from the same distribution" : "there were no consistent difference within pairs"}.`,
        [mw ? S.gpMannWhitney : SRC.gpNonparametric, S.greenland2016], mis, test);
      }
      return meaning(`The data do not show that values in ${b} differ from ${a}${meds} (${P(p, style)})${shift}.`,
        [mw ? S.gpMannWhitney : SRC.gpNonparametric, S.amrhein2019], mw ? mis : MIS_NS, test);
    }
    case "kolmogorov_smirnov":
      return ksMeaning({ ...r, p: p }, a, b, style);
    default:
      return null;
  }
}

/** A fold change to three significant digits ("2.97"). */
const fold = (v: number) => formatSig(v, 3);

/** t test on log values (sheets/column/logScale.ts): the ratio of
 *  geometric means a/b with its CI, never a difference of logs. */
function logTtestMeaning(r: R, a: string, b: string, p: number, style: PStyle): Meaning {
  const c = ci2(r.ratio_ci);
  const ci = c ? ` (95% CI ${fold(c[0])}–${fold(c[1])}-fold)` : "";
  const test = "t test on log-transformed values: compares geometric means as a ratio, for data whose SD grows with the mean.";
  if (p < ALPHA) {
    return meaning(`The geometric mean of ${a} was ${fold(r.ratio)} times that of ${b}${ci}; a ratio this far from 1 `
      + `would be unusual (${P(p, style)}) if the groups did not differ.`,
    [S.gpUnpairedT, S.greenland2016], MIS_SIG(P(p, style)), test);
  }
  return meaning(`The geometric mean of ${a} was ${fold(r.ratio)} times that of ${b}, but the data do not show a `
    + `difference (${P(p, style)})${c ? `: the 95% CI runs from ${fold(c[0])}- to ${fold(c[1])}-fold` : ""}.`,
  [S.gpUnpairedT, S.amrhein2019], MIS_NS, test);
}

function ksMeaning(r: R, a: string, b: string, style: PStyle): Meaning | null {
  if (!num(r.p)) return null;
  const test = "Kolmogorov-Smirnov test: compares the whole distributions of two independent groups.";
  if (r.p < ALPHA) {
    return meaning(`The distributions of ${a} and ${b} differ in location, spread or shape; a gap between `
      + `their cumulative distributions this large${num(r.D) ? ` (D = ${fmt(r.D)})` : ""} would be unusual `
      + `(${P(r.p, style)}) if both came from the same distribution.`,
    [SRC.gpNonparametric, S.greenland2016], MIS_SIG(P(r.p, style)), test);
  }
  return meaning(`The data do not show that the distributions of ${a} and ${b} differ (${P(r.p, style)}).`,
    [SRC.gpNonparametric, S.amrhein2019], MIS_NS, test);
}

// ------------------------------------------------------------- ANOVA

/** The post hoc row with the smallest P, written as "B exceeds A by 5.2
 *  (95% CI 2.9 to 7.5)", and the count of pairs below 0.05. */
function posthocClause(mc: R | null | undefined, unit: string): string {
  const rows: R[] = Array.isArray(mc?.comparisons) ? mc!.comparisons : [];
  if (!rows.length) return "";
  const pOf = (c: R) => (num(c.p_adjusted) ? c.p_adjusted : num(c.p) ? c.p : null);
  const nSig = rows.filter((c) => { const p = pOf(c); return p !== null && p < ALPHA; }).length;
  const method = String(mc?.method ?? "");
  const name = POSTHOC_NAMES[method] ?? "the multiple comparisons";
  const best = [...rows].filter((c) => pOf(c) !== null).sort((x, y) => pOf(x)! - pOf(y)!)[0];
  let ex = "";
  if (best && nSig && typeof best.pair === "string" && best.pair.includes(" vs. ")) {
    const [first, second] = best.pair.split(" vs. ");
    const d = num(best.difference) ? best.difference : null;
    const c = ci2(best.ci) ?? ci2(best.ci95);
    const fam = best.family ? ` (${best.family})` : "";
    if (num(best.ratio)) {
      // log-scale comparisons: a ratio of geometric means, not a difference of logs
      const rc = ci2(best.ratio_ci);
      ex = `, most clearly ${first}/${second}${fam} = ${fold(best.ratio)}-fold`
        + `${rc ? ` (95% CI ${fold(rc[0])}–${fold(rc[1])})` : ""}`;
    } else if (d !== null && d !== 0) {
      const [hi, lo] = d < 0 ? [second, first] : [first, second];
      const ci = c ? ` (95% CI ${abs(d < 0 ? c[1] : c[0])} to ${withUnit(abs(d < 0 ? c[0] : c[1]), unit)})` : "";
      ex = `, most clearly ${hi} above ${lo}${fam} by ${withUnit(abs(d), unit)}${ci}`;
    }
  }
  return `; by ${name}, ${nSig} of ${rows.length} ${rows.length === 1 ? "pair" : "pairs"} ${nSig === 1 ? "differs" : "differ"}${ex}`;
}

const MIS_ANOVA = "every group differs from every other. A small P here says only that the groups are "
  + "not all the same; the multiple comparisons say which pairs differ.";

function oneWayMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const unit = unitFromTitle(t?.yTitle);
  const groups: string[] = Array.isArray(r.group_summaries) ? r.group_summaries.map((g: R) => String(g.name))
    : Array.isArray(r.names) ? r.names.map(String) : [];
  const k = groups.length;
  const kWord = k ? `${k} ` : "";
  let p: unknown, mc: R | undefined, what = "means", test: string;
  switch (r.analysis) {
    case "anova":
      if (r.kind === "nonparametric") {
        p = r.p; mc = r.dunns; what = "distributions";
        test = "Kruskal-Wallis test: compares three or more independent groups by rank.";
      } else {
        p = r.table?.p; mc = r.multiple_comparisons;
        test = "Ordinary one-way ANOVA: compares the means of three or more independent groups, assuming similar SDs.";
        if (r.log_scale && typeof r.log_scale === "object") {
          what = "geometric means";
          test = "Ordinary one-way ANOVA on log-transformed values: compares geometric means, for data whose SD grows with the mean.";
        }
      }
      break;
    case "anova_unequal_var":
      p = r.welch?.p; mc = r.multiple_comparisons;
      test = "Welch's ANOVA: compares the means of three or more independent groups without assuming equal SDs.";
      break;
    case "rm_one_way_anova":
      p = num(r.table?.p_geisser_greenhouse) ? r.table.p_geisser_greenhouse : r.table?.p_assuming_sphericity;
      mc = r.multiple_comparisons;
      test = "Repeated-measures one-way ANOVA: compares treatments measured on the same subjects, so differences between subjects drop out.";
      break;
    case "friedman":
      p = r.p; mc = r.dunns; what = "distributions";
      test = "Friedman test: compares treatments measured on the same subjects, by the ranks within each subject.";
      break;
    default:
      return null;
  }
  if (!num(p)) return null;
  const across = k ? ` (${list(groups)})` : "";
  if (p < ALPHA) {
    return meaning(`The ${kWord}group ${what}${across} are not all the same: differences this large `
      + `would be unusual (${P(p, style)}) if every group came from the same population`
      + `${posthocClause(mc, unit) || "; ANOVA alone does not say which groups differ"}.`,
    [S.gpOneWay, SRC.gpMcHowTo, S.greenland2016], MIS_ANOVA, test);
  }
  return meaning(`The data do not show differences among the ${kWord}group ${what}${across} `
    + `(${P(p, style)}); that is not evidence that they are equal.`,
  [S.gpOneWay, S.amrhein2019], MIS_NS, test);
}

// ------------------------------------------------------------- two-way

function twoWayMeaning(r: R, o: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const src: R = r.sources ?? {};
  const inter = src.interaction;
  if (!inter) return null;
  const pOf = (s: R | undefined) => (s ? (num(s.p_geisser_greenhouse) ? s.p_geisser_greenhouse : s.p) : null);
  const pi = pOf(inter);
  if (!num(pi)) return null;
  const unit = unitFromTitle(t?.yTitle);
  const fn: string[] = Array.isArray(r.factor_names) ? r.factor_names.map(String) : [];
  const rowF = String(o.row_factor || fn[0] || t?.factorNames?.rows || "the row factor");
  const colF = String(o.col_factor || fn[1] || t?.factorNames?.datasets || "the column factor");
  const cols: string[] = Array.isArray(r.dataset_names) ? r.dataset_names
    : Array.isArray(r.col_names) ? r.col_names : (t?.datasets ?? []).map((d) => d.name);
  const rows: string[] = Array.isArray(r.row_names) ? r.row_names
    : Array.isArray(o.row_names) ? o.row_names : (t?.rowTitles ?? []);
  const colSrc = src[colF] ?? src.column_factor;
  const test = r.analysis === "two_way_anova"
    ? "Two-way ANOVA: splits the variation into the two factors and their interaction."
    : "Two-way repeated-measures ANOVA: splits the variation into the two factors and their interaction, with subjects as a random factor.";
  const sources = [S.gpInteraction, SRC.gpTwoWay];
  if (pi < ALPHA) {
    let ex = "";
    const cm: unknown = r.cell_means;
    if (cols.length === 2 && Array.isArray(cm) && cm.length === rows.length && rows.length >= 2) {
      const diffs = (cm as unknown[]).map((row, i) => (Array.isArray(row) && num(row[0]) && num(row[1])
        ? { row: String(rows[i]), d: row[1] - row[0] } : null)).filter((x): x is { row: string; d: number } => !!x);
      if (diffs.length >= 2) {
        const lo = diffs.reduce((m, x) => (Math.abs(x.d) < Math.abs(m.d) ? x : m));
        const hi = diffs.reduce((m, x) => (Math.abs(x.d) > Math.abs(m.d) ? x : m));
        ex = `: the difference ${cols[1]} − ${cols[0]} was ${withUnit(fmt(lo.d), unit)} at ${lo.row} `
          + `but ${withUnit(fmt(hi.d), unit)} at ${hi.row}`;
      }
    }
    return meaning(`The effect of ${colF} differed between levels of ${rowF} (interaction ${P(pi, style)})${ex}, `
      + `so describe the effect of ${colF} at each level of ${rowF} rather than as one average.`,
    [...sources, S.greenland2016],
    `a significant main effect means that factor matters at every level of the other. With an `
      + "interaction, its effect depends on the other factor.", test);
  }
  const pc = pOf(colSrc);
  return meaning(`The data do not show that the effect of ${colF} depends on ${rowF} (interaction ${P(pi, style)})`
    + `${num(pc) ? `; averaged over ${rowF}, the effect of ${colF} has ${P(pc, style)}` : ""}.`,
  [...sources, S.amrhein2019],
  "“no interaction”: the effects are proven to add up. A large interaction P only means the data do not show the effects depend on each other.",
  test);
}

// Aligned rank transform (P-85): the same reading as the two-way ANOVA,
// on aligned ranks (Wobbrock et al. 2011): an effect on the ranks, not a
// size in the data's units.
const ART_SOURCE: Source = SRC.wobbrock2011;

function artMeaning(r: R, style: PStyle): Meaning | null {
  const src: R = r.sources ?? {};
  const pi = src.interaction?.p;
  if (!num(pi)) return null;
  const fn: string[] = Array.isArray(r.factor_names) ? r.factor_names.map(String) : [];
  const rowF = fn[0] || "the row factor";
  const colF = fn[1] || "the column factor";
  const pc = src[colF]?.p, pr = src[rowF]?.p;
  const test = "Aligned rank transform two-way ANOVA: a nonparametric test of the two factors and "
    + "their interaction on ranks aligned for each effect.";
  const mis = "a measure of how large the effect is. The test is on aligned ranks: it says which "
    + "effects shift the values, not by how much in the data's units.";
  if (pi < ALPHA) {
    return meaning(`On aligned ranks, the effect of ${colF} differed between levels of ${rowF} `
      + `(interaction ${P(pi, style)}), so describe the effect of ${colF} at each level of ${rowF} `
      + "rather than as one average.", [ART_SOURCE, S.gpInteraction, S.greenland2016], mis, test);
  }
  const main = [num(pr) ? `${rowF} ${P(pr, style)}` : "", num(pc) ? `${colF} ${P(pc, style)}` : ""]
    .filter(Boolean).join("; ");
  return meaning(`The aligned ranks do not show that the effect of ${colF} depends on ${rowF} `
    + `(interaction ${P(pi, style)})${main ? `; main effects: ${main}` : ""}.`,
  [ART_SOURCE, S.amrhein2019], mis, test);
}

// ------------------------------------------------------------- correlation, regression

function correlationMeaning(r: R, style: PStyle): Meaning | null {
  const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["X", "Y"];
  if (!num(r.r) || !num(r.p_two_tailed)) return null;
  const c = ci2(r.ci_r);
  const ranks = r.method === "spearman" || r.method === "kendall";
  const sym = r.method === "spearman" ? "Spearman r" : r.method === "kendall" ? "Kendall's τb" : "r";
  const ci = c ? `, 95% CI ${fmt(c[0])} to ${fmt(c[1])}` : "";
  const test = ranks ? `${r.method === "spearman" ? "Spearman" : "Kendall"} correlation: how consistently the two variables rank together (any monotonic relationship).`
    : "Pearson correlation: how closely two variables follow a straight line together.";
  const mis = "one causes the other. A correlation does not show causation: both may follow a third factor, "
    + `and ${ranks ? "a rank correlation" : "r"} measures only a ${ranks ? "monotonic" : "straight-line"} association.`;
  const src = [S.gpCorrelation];
  if (r.p_two_tailed < ALPHA) {
    const together = r.r > 0 ? "tend to rise together" : "move in opposite directions (as one rises the other tends to fall)";
    const share = !ranks && num(r.r_squared) ? `; a straight line through one accounts for about ${pct(100 * r.r_squared)} of the variation in the other` : "";
    return meaning(`${a} and ${b} ${together} (${sym} = ${fmt(r.r)}${ci})${share}; a correlation this strong would be `
      + `unusual (${P(r.p_two_tailed, style)}) if there were none.`, [...src, S.greenland2016], mis, test);
  }
  return meaning(`The data do not show a correlation between ${a} and ${b} (${P(r.p_two_tailed, style)}): `
    + `${sym} = ${fmt(r.r)}${c ? ` with a 95% CI from ${fmt(c[0])} to ${fmt(c[1])} is compatible with no relationship and with ${Math.max(Math.abs(c[0]), Math.abs(c[1])) >= 0.5 ? "a strong one" : "a weak one"}` : ""}.`,
  [...src, S.amrhein2019], MIS_NS, test);
}

function linregMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const ds = (Array.isArray(r.datasets) ? r.datasets : []).find((d: R) => d?.fit?.slope);
  if (!ds) return null;
  const fit = ds.fit;
  const s = fit.slope;
  const p = fit.f_nonzero_slope?.p;
  if (!num(s?.value) || !num(p)) return null;
  const x = (t?.xTitle || "X").trim() || "X";
  const y = String(ds.name || unitFromTitle(t?.yTitle) || "Y");
  const c = ci2(s.ci95);
  const ci = c ? ` (95% CI ${fmt(c[0])} to ${fmt(c[1])})` : "";
  const test = "Linear regression: fits the straight line that best predicts Y from X.";
  if (p < ALPHA) {
    return meaning(`Each one-unit increase in ${x} goes with a change of ${fmt(s.value)} in ${y}${ci}; a slope this far `
      + `from zero would be unusual (${P(p, style)}) if ${y} did not change with ${x}.`,
    [S.gpSlope, S.greenland2016],
    "proof that the relationship is a straight line, or that X causes Y. A small P says only that the slope is not zero; check the residuals for curvature.",
    test);
  }
  return meaning(`The data do not show that ${y} changes with ${x} (${P(p, style)}): the slope ${fmt(s.value)}${ci} `
    + "is compatible with no change and with changes of that size.", [S.gpSlope, S.amrhein2019], MIS_NS, test);
}

/** "Sex[M]" → { variable: "Sex", level: "M" }. */
function splitLevel(name: string): { variable: string; level: string | null } {
  const m = /^(.*)\[(.*)\]$/.exec(name);
  return m ? { variable: m[1], level: m[2] } : { variable: name, level: null };
}

function regressionMeaning(r: R, style: PStyle): Meaning | null {
  const logistic = r.analysis === "logistic_regression";
  const coefs: R[] = (Array.isArray(r.coefficients) ? r.coefficients : [])
    .filter((c: R) => c && c.name !== "Intercept" && num(c.p));
  if (!coefs.length) return null;
  const c = coefs[0];
  const { variable, level } = splitLevel(String(c.name));
  const others = [...new Set(coefs.slice(1).map((x) => splitLevel(String(x.name)).variable))]
    .filter((v) => v !== variable);
  const hold = others.length ? `, holding ${list(others)} constant` : "";
  const outcome = String(r.outcome ?? "the outcome");
  const sig = c.p < ALPHA;
  const ref = level && r.reference_levels && typeof r.reference_levels === "object"
    ? (r.reference_levels as R)[variable] : null;
  const vs = level ? `${variable} ${level}${ref ? ` (vs. ${ref})` : " (vs. the reference level)"}` : null;
  if (logistic) {
    const or = c.odds_ratio;
    const ci = ci2(c.odds_ratio_ci);
    if (!num(or)) return null;
    const ciT = ci ? ` (95% CI ${fmt(ci[0])} to ${fmt(ci[1])})` : "";
    const lead = vs ? `${vs} multiplies the odds of ${outcome} by ${fmt(or)}${ciT}`
      : `Each one-unit increase in ${variable} multiplies the odds of ${outcome} by ${fmt(or)}${ciT}`;
    const test = "Logistic regression: models the odds of a yes/no outcome from several predictors at once.";
    const mis = `an odds ratio of ${fmt(or)} as ${fmt(or)} times the probability. It multiplies the odds; `
      + "when the outcome is common, the probability changes much less.";
    return meaning(`${lead[0].toUpperCase()}${lead.slice(1)}${hold}; ${sig
      ? `an odds ratio this far from 1 would be unusual (${P(c.p, style)}) if ${variable} had no association with ${outcome}`
      : `the data do not show an association (${P(c.p, style)}), and the CI includes 1`}.`,
    [S.gpLogisticOr, sig ? S.greenland2016 : S.amrhein2019], mis, test);
  }
  const est = c.estimate;
  const ci = ci2(c.ci);
  if (!num(est)) return null;
  const ciT = ci ? ` (95% CI ${fmt(ci[0])} to ${fmt(ci[1])})` : "";
  const lead = vs ? `${outcome} differed by ${fmt(est)} with ${vs}${ciT}`
    : `Each one-unit increase in ${variable} goes with a change of ${fmt(est)} in ${outcome}${ciT}`;
  return meaning(`${lead[0].toUpperCase()}${lead.slice(1)}${hold}; ${sig
    ? `a coefficient this far from 0 would be unusual (${P(c.p, style)}) if ${variable} had no association with ${outcome}`
    : `the data do not show an association (${P(c.p, style)})`}.`,
  [S.gpMultipleReg, sig ? S.greenland2016 : S.amrhein2019],
  sig ? "proof that the predictor causes the change. The coefficient describes an association, adjusted only for the other predictors in the model." : MIS_NS,
  "Multiple linear regression: estimates each predictor's association with the outcome, adjusted for the others.");
}

// ------------------------------------------------------------- curve fits

const SI: [number, string][] = [[1, "M"], [1e-3, "mM"], [1e-6, "µM"], [1e-9, "nM"], [1e-12, "pM"]];

/** A concentration in molar written with a prefix ("104 nM"). */
function conc(v: number, unit: string): string {
  if (unit.trim() !== "M" || v <= 0) return withUnit(fmt(v), unit.trim());
  const [f, u] = SI.find(([f]) => v >= f * 0.9995) ?? SI[SI.length - 1];
  return `${fmt(v / f)} ${u}`;
}

function doseMeaning(r: R, t: MeaningTable | null | undefined): Meaning | null {
  const sets: R[] = Array.isArray(r.datasets) ? r.datasets : [];
  for (const ds of sets) {
    const fit = ds?.fit;
    const params: R = fit?.params ?? {};
    const midKey = ["IC50", "EC50"].find((k) => num(params[k]?.value));
    if (!fit || !midKey) continue;
    const mid = params[midKey];
    const h = params.HillSlope?.value;
    const top = params.Top?.value, bottom = params.Bottom?.value;
    const unit = t?.xUnit ?? "";
    const c = ci2(mid.ci95);
    const ci = c ? ` (95% CI ${conc(c[0], unit)} to ${conc(c[1], unit)})` : "";
    const name = String(ds.name ?? "The curve");
    const span = num(top) && num(bottom) ? ` (Bottom ${fmt(bottom)}, Top ${fmt(top)})` : "";
    const flags = fit.range_flags;
    if (flags && (flags.ec50_above_range || flags.ec50_below_range)) {
      return meaning(`For ${name}, the concentration giving half of the curve's effect lies `
        + `${flags.ec50_above_range ? "above the highest" : "below the lowest"} concentration tested, so the ${midKey} `
        + "is not determined by these data (the curve has no plateau on that side).",
      [SRC.gpRelAbsIc50, SRC.gpAmbiguous]);
    }
    let steep = "";
    if (num(h) && h !== 0) {
      const fold = 81 ** (1 / Math.abs(h));
      steep = `; the Hill slope of ${fmt(h)} means the response goes from 10% to 90% of its range over a `
        + `${fold >= 100 ? Math.round(fold).toString() : fmt(Number(fold.toPrecision(3)))}-fold rise in concentration `
        + `(81-fold for a slope of 1${Math.abs(h) > 1 ? ", so this curve is steeper" : Math.abs(h) < 1 ? ", so this curve is shallower" : ""})`;
    }
    const more = sets.filter((d) => d?.fit?.params?.[midKey]).length > 1 ? " (first data set shown)" : "";
    return meaning(`${name}${more} gives a response halfway between its plateaus${span} at ${conc(mid.value, unit)}, its ${midKey}${ci}${steep}.`,
    [S.gpEc50, S.gpHillSlope, SRC.gpRelAbsIc50],
    `the ${midKey} as the concentration that gives a response of 50 (or 50% inhibition). It is relative: halfway between this curve's own Bottom and Top.`,
    "Nonlinear regression: fits the dose-response curve by least squares.");
  }
  return null;
}

// ------------------------------------------------------------- survival

/** "45% of" (below 1) or "2.25 times"; `label` adds "(hazard ratio 0.45, "
 *  for the percentage form so the table's number appears too. */
function hrWords(hr: number): string {
  return hr < 1 ? `${pct(100 * hr)} of` : `${fmt(hr)} times`;
}

/** " (hazard ratio 0.45, 95% CI a to b)" or, when the words already show
 *  the ratio, " (95% CI a to b)". */
function ratioCi(name: string, v: number, c: [number, number] | null): string {
  if (!c) return v < 1 ? ` (${name} ${fmt(v)})` : "";
  return v < 1 ? ` (${name} ${fmt(v)}, 95% CI ${fmt(c[0])} to ${fmt(c[1])})` : ` (95% CI ${fmt(c[0])} to ${fmt(c[1])})`;
}

function survivalMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const curves: R = r.curves && typeof r.curves === "object" ? r.curves : {};
  const names: string[] = Array.isArray(r.logrank?.group_names) ? r.logrank.group_names.map(String)
    : Object.keys(curves);
  const unit = (t?.xUnit ?? "").trim();
  const medians = names.filter((n) => curves[n]).map((n) => {
    const m = curves[n].median_survival;
    return `${n} ${num(m) ? withUnit(fmt(m), unit) : "not reached"}`;
  });
  const medT = medians.length ? `; median survival ${list(medians)}` : "";
  const p = r.logrank?.p;
  const hr = r.hazard_ratio;
  const test = "Kaplan-Meier curves compared by the log-rank test, which weighs every event time equally.";
  const mis = "a comparison of median survival times or of how many subjects had the event. The hazard ratio "
    + "compares event rates at each moment and assumes their ratio stays the same over time.";
  if (names.length === 2 && hr && num(hr.value)) {
    const c = ci2(hr.ci);
    const [g0, g1] = names;
    const lead = `At any moment, ${g0}'s rate of the event (hazard) was ${hrWords(hr.value)} ${g1}'s`
      + ratioCi("hazard ratio", hr.value, c);
    if (c && (c[0] > 1 || c[1] < 1)) {
      return meaning(`${lead}${num(p) ? `, log-rank ${P(p, style)}` : ""}${medT}.`,
        [SRC.gpHazardRatio, SRC.gpMedianSurvival], mis, test);
    }
    return meaning(`${lead}; the CI includes 1, so the data do not show a difference in risk`
      + `${num(p) ? ` (log-rank ${P(p, style)})` : ""}${c ? ` and are compatible with ${g0}'s hazard being anywhere from ${fmt(c[0])} to ${fmt(c[1])} times ${g1}'s` : ""}${medT}.`,
    [SRC.gpHazardRatio, S.amrhein2019], mis, test);
  }
  if (!num(p)) return null;
  if (p < ALPHA) {
    return meaning(`The survival curves of ${list(names)} are not all the same: differences this large would be unusual `
      + `(log-rank ${P(p, style)}) if every group had the same survival${medT}.`,
    [SRC.gpSurvival, S.greenland2016], MIS_SIG(P(p, style)), test);
  }
  return meaning(`The data do not show that the survival of ${list(names)} differs (log-rank ${P(p, style)})${medT}.`,
    [SRC.gpSurvival, S.amrhein2019], MIS_NS, test);
}

function coxMeaning(r: R, style: PStyle): Meaning | null {
  const coefs: R[] = Array.isArray(r.coefficients) ? r.coefficients : [];
  if (!coefs.length) return null;
  const c = coefs.find((x) => x.term === "Group" && x.level) ?? coefs.find((x) => x.level) ?? coefs[0];
  if (!num(c.hazard_ratio)) return null;
  const ci = ci2(c.hazard_ratio_ci);
  const others = [...new Set(coefs.map((x) => String(x.term ?? x.name)))].filter((x) => x !== String(c.term ?? c.name));
  const hold = others.length ? `, holding ${list(others)} constant` : "";
  const ciT = ratioCi("hazard ratio", c.hazard_ratio, ci);
  const lead = c.level
    ? `At any moment, the rate of the event (hazard) in ${c.term === "Group" ? "" : `${c.term} `}${c.level} was ${hrWords(c.hazard_ratio)} that in ${c.reference ?? "the reference level"}${ciT}${hold}`
    : `Each one-unit increase in ${c.name} multiplies the rate of the event (hazard) at any moment by ${fmt(c.hazard_ratio)}${ciT}${hold}`;
  const test = "Cox proportional-hazards regression: compares event rates over time, adjusted for the other covariates.";
  const mis = "a ratio of median survival times or of the share of subjects with the event. It compares event "
    + "rates at each moment and assumes their ratio stays the same over time (see the proportional-hazards test).";
  const sig = ci ? ci[0] > 1 || ci[1] < 1 : num(c.p) && c.p < ALPHA;
  if (sig) return meaning(`${lead}${num(c.p) ? ` (${P(c.p, style)})` : ""}.`, [SRC.gpHazardRatio, S.greenland2016], mis, test);
  return meaning(`${lead}; the CI includes 1, so the data do not show a difference in risk${num(c.p) ? ` (${P(c.p, style)})` : ""}.`,
    [SRC.gpHazardRatio, S.amrhein2019], mis, test);
}

// ------------------------------------------------------------- contingency

function contingencyMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const rows = (t?.rowTitles ?? []).map((x, i) => x?.trim() || `Row ${i + 1}`);
  const cols = (t?.datasets ?? []).map((d, i) => d.name?.trim() || `Column ${i + 1}`);
  const fisher = r.fisher_exact?.p;
  const p = num(fisher) && r.rows === 2 && r.cols === 2 ? fisher : r.chi_square?.p;
  const how = num(fisher) && r.rows === 2 && r.cols === 2 ? "Fisher's exact test" : "chi-square test";
  if (!num(p)) return null;
  const test = r.rows === 2 && r.cols === 2
    ? "Fisher's exact test on a 2 × 2 table: is the outcome associated with the group?"
    : "Chi-square test: are the row and column categories associated?";
  const rr = r.relative_risk, or = r.odds_ratio, pr = r.proportions;
  if (r.rows === 2 && r.cols === 2 && rr && num(rr.value) && pr && num(pr.p1) && num(pr.p2)) {
    const [r1, r2] = [rows[0] ?? "row 1", rows[1] ?? "row 2"];
    const outcome = cols[0] ?? "the first outcome";
    const c = ci2(rr.ci);
    const orT = or && num(or.value) ? `; odds ratio ${fmt(or.value)}` : "";
    const lead = `“${outcome}” in ${pct(100 * pr.p1)} of ${r1} vs. ${pct(100 * pr.p2)} of ${r2}: the risk in ${r1} was `
      + `${hrWords(rr.value)} that in ${r2} (relative risk ${fmt(rr.value)}${c ? `, 95% CI ${fmt(c[0])} to ${fmt(c[1])}` : ""}${orT})`;
    const mis = "the odds ratio as a relative risk. Odds ratios lie further from 1 than relative risks unless the outcome is rare.";
    if (p < ALPHA) {
      return meaning(`${lead}; an association this strong would be unusual (${P(p, style)}, ${how}) if group and outcome were unrelated.`,
        [S.gpRelativeRisk, S.gpOddsRatio, S.gpContingencyP], mis, test);
    }
    return meaning(`${lead}; the data do not show an association (${P(p, style)}, ${how}), and the CI is compatible with no difference in risk.`,
      [S.gpRelativeRisk, S.gpOddsRatio, S.amrhein2019], mis, test);
  }
  if (p < ALPHA) {
    return meaning(`How ${cols.length ? list(cols) : "the outcomes"} are distributed differs among ${rows.length ? list(rows) : "the rows"}: `
      + `an association this strong would be unusual (${P(p, style)}, ${how}) if rows and columns were unrelated.`,
    [S.gpContingencyP, S.greenland2016], MIS_SIG(P(p, style)), test);
  }
  return meaning(`The data do not show an association between the rows and the columns (${P(p, style)}, ${how}).`,
    [S.gpContingencyP, S.amrhein2019], MIS_NS, test);
}

function proportionMeaning(r: R, style: PStyle): Meaning | null {
  const g: R[] = Array.isArray(r.groups) ? r.groups : [];
  const names: string[] = Array.isArray(r.names) ? r.names.map(String) : ["Group 1", "Group 2"];
  const p = r.fisher_exact?.p ?? r.z_test?.p;
  if (g.length !== 2 || !num(g[0]?.proportion) || !num(g[1]?.proportion) || !num(p)) return null;
  const d = r.difference_ci;
  const c = ci2(d?.ci);
  const ci = c ? ` (difference ${fmt(100 * (d.value as number))} percentage points, 95% CI ${fmt(100 * c[0])} to ${fmt(100 * c[1])})` : "";
  const lead = `${pct(100 * g[0].proportion)} of ${names[0]} vs. ${pct(100 * g[1].proportion)} of ${names[1]}${ci}`;
  const test = "Comparison of two proportions with Fisher's exact test.";
  if (p < ALPHA) return meaning(`${lead}; a gap this large would be unusual (${P(p, style)}) if the true proportions were equal.`,
    [S.gpContingencyP, S.greenland2016], MIS_SIG(P(p, style)), test);
  return meaning(`${lead}; the data do not show a difference (${P(p, style)}).`, [S.gpContingencyP, S.amrhein2019], MIS_NS, test);
}

function kappaMeaning(r: R): Meaning | null {
  if (!num(r.kappa)) return null;
  const c = ci2(r.ci);
  const agree = num(r.observed_agreement) && num(r.expected_agreement)
    ? `The raters agreed on ${pct(100 * r.observed_agreement)} of the items, against ${pct(100 * r.expected_agreement)} expected by chance alone; ` : "";
  return meaning(`${agree}κ = ${fmt(r.kappa)}${c ? ` (95% CI ${fmt(c[0])} to ${fmt(c[1])})` : ""} means they reached `
    + `${pct(100 * Math.max(0, r.kappa))} of the agreement possible beyond chance.`, [S.cohen1960],
  "κ as the percentage of items the raters agreed on. It counts only the agreement beyond what chance alone would give.",
  "Cohen's kappa: agreement between two raters on categories, corrected for chance.");
}

function mcnemarMeaning(r: R, style: PStyle): Meaning | null {
  const p = r.recommended_p ?? r.chi_square?.p;
  if (!num(p)) return null;
  const disc = Array.isArray(r.discordant) && r.discordant.length === 2 ? r.discordant : null;
  const lead = disc ? `Of the pairs whose two outcomes disagreed, ${disc[0]} went one way and ${disc[1]} the other` : "The paired proportions were compared";
  const test = "McNemar's test: compares two paired proportions using only the pairs that disagree.";
  if (p < ALPHA) return meaning(`${lead}; an imbalance this large would be unusual (${P(p, style)}) if both outcomes were equally likely to change.`,
    [S.gpContingencyP, S.greenland2016], MIS_SIG(P(p, style)), test);
  return meaning(`${lead}; the data do not show that the paired proportions differ (${P(p, style)}).`,
    [S.gpContingencyP, S.amrhein2019], MIS_NS, test);
}

// ------------------------------------------------------------- nested

function nestedMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const unit = unitFromTitle(t?.yTitle);
  const da = r.data_analyzed ?? {};
  const nSub = da.n_subcolumns, nVal = da.n_values, nTr = da.n_treatments;
  const per = num(nSub) && num(nTr) && nTr > 0 && nSub % nTr === 0 ? `, ${nSub / nTr} per group` : "";
  const dfNum = r.analysis === "nested_t_test" ? r.df : r.df_den;
  const counts = num(nSub) && num(nVal)
    ? `; the test counts the ${nSub} subcolumns${per}, not the ${nVal} values, so its df is ${fmt(dfNum)}` : "";
  const mis = "every value as an independent replicate. Values in one subcolumn (one animal, one dish) are not "
    + "independent, so n is the number of subcolumns, which is why the CI is wider than a plain t test's.";
  const sources = [r.analysis === "nested_t_test" ? S.gpNestedT : SRC.gpNested, SRC.lazic2010];
  if (r.analysis === "nested_t_test") {
    if (!num(r.p) || !num(r.difference)) return null;
    const [x, y] = String(r.comparison ?? "").split(" - ");
    const b = x || "the second group", a = y || "the first group";
    const c = ci2(r.ci);
    const dir = r.difference >= 0 ? "higher" : "lower";
    const test = "Nested t test: compares two groups when each holds several subcolumns (e.g. animals) of replicate values.";
    if (r.p < ALPHA) {
      return meaning(`On average ${b} was ${withUnit(abs(r.difference), unit)} ${dir} than ${a}${c ? ` (95% CI ${ciWords(c, unit)})` : ""}`
        + `; a difference this large would be unusual (${P(r.p, style)}) if the groups did not differ${counts}.`,
      [...sources, S.greenland2016], mis, test);
    }
    return meaning(`${b} averaged ${withUnit(abs(r.difference), unit)} ${dir} than ${a}, but the data do not show a difference `
      + `(${P(r.p, style)})${c ? `: the 95% CI runs from ${ciWords(c, unit)}` : ""}${counts}.`,
    [...sources, S.amrhein2019], mis, test);
  }
  if (!num(r.p)) return null;
  const groups: string[] = Array.isArray(r.names) ? r.names.map(String) : [];
  const test = "Nested one-way ANOVA: compares three or more groups when each holds several subcolumns of replicate values.";
  if (r.p < ALPHA) {
    return meaning(`The ${groups.length || ""} group means${groups.length ? ` (${list(groups)})` : ""} are not all the same `
      .replace("The  group", "The group")
      + `(${P(r.p, style)})${counts}${posthocClause(r.multiple_comparisons, unit)}.`,
    [...sources, S.gpOneWay], mis, test);
  }
  return meaning(`The data do not show differences among the group means (${P(r.p, style)})${counts}.`,
    [...sources, S.amrhein2019], mis, test);
}

// ------------------------------------------------------------- others

function columnStatsMeaning(r: R, t: MeaningTable | null | undefined, style: PStyle): Meaning | null {
  const ds = (Array.isArray(r.datasets) ? r.datasets : []).find((d: R) => d?.one_sample_t && num(d.one_sample_t.p_two_tailed));
  if (!ds) return null;
  const unit = unitFromTitle(t?.yTitle);
  const tt = ds.one_sample_t;
  const m = ds.descriptive?.mean;
  const h = tt.hypothetical;
  const test = "One-sample t test: compares a mean with a hypothetical value.";
  const mean = num(m) ? ` (mean ${withUnit(fmt(m), unit)})` : "";
  if (tt.p_two_tailed < ALPHA) {
    return meaning(`${ds.name}${mean} differs from ${fmt(h)}: a mean this far from it would be unusual `
      + `(${P(tt.p_two_tailed, style)}) if the population mean were ${fmt(h)}.`, [SRC.gpOneSample, S.greenland2016],
    MIS_SIG(P(tt.p_two_tailed, style)), test);
  }
  return meaning(`The data do not show that ${ds.name}${mean} differs from ${fmt(h)} (${P(tt.p_two_tailed, style)}).`,
    [SRC.gpOneSample, S.amrhein2019], MIS_NS, test);
}

function multiRowMeaning(r: R): Meaning | null {
  if (!num(r.n_tests) || !num(r.n_flagged)) return null;
  const method = POSTHOC_NAMES[String(r.method)] ?? "the correction for multiple comparisons";
  const fdr = r.approach === "fdr";
  return meaning(`${r.n_flagged} of ${r.n_tests} rows ${fdr ? "are discoveries" : "differ"} after ${method}; with one test `
    + "per row, some small P values occur by chance alone, which is what the correction allows for.",
  [SRC.gpMultipleProblem, SRC.gpAdjustedP],
  "the rows that were not flagged as rows without a difference. They are rows where these data do not show one.",
  "Multiple t tests, one per row, with a correction for the number of tests.");
}

function estimationMeaning(r: R, t: MeaningTable | null | undefined): Meaning | null {
  const c = Array.isArray(r.comparisons) ? r.comparisons[0] : null;
  const e = Array.isArray(c?.effects) ? c.effects[0] : null;
  if (!c || !e || !num(e.difference)) return null;
  const unit = e.effect === "mean_diff" || e.effect === "median_diff" ? unitFromTitle(t?.yTitle) : "";
  const ci = ci2(e.ci);
  const what = String(e.label ?? "Difference").toLowerCase();
  return meaning(`The ${what} ${c.test} − ${c.control} is ${withUnit(fmt(e.difference), unit)}`
    + `${ci ? `; the 95% bootstrap CI from ${fmt(ci[0])} to ${withUnit(fmt(ci[1]), unit)} shows the differences most compatible with these data` : ""}.`,
  [S.greenland2016, S.amrhein2019],
  "a 95% chance that the true difference lies in this particular interval. 95% describes how often such intervals capture the true value over many repeated experiments.",
  "Estimation plot: the effect size with a bootstrap confidence interval instead of a yes/no test.");
}

function demingMeaning(r: R): Meaning | null {
  const ds = (Array.isArray(r.datasets) ? r.datasets : []).find((d: R) => num(d?.fit?.slope?.value));
  if (!ds) return null;
  const s = ds.fit.slope, i = ds.fit.y_intercept;
  const sc = ci2(s.ci), ic = ci2(i?.ci);
  const ok = sc && ic ? (sc[0] <= 1 && sc[1] >= 1 && ic[0] <= 0 && ic[1] >= 0) : null;
  return meaning(`A slope of 1 and an intercept of 0 would mean the two methods agree; here the slope is ${fmt(s.value)}`
    + `${sc ? ` (95% CI ${fmt(sc[0])} to ${fmt(sc[1])})` : ""}${num(i?.value) ? ` and the intercept ${fmt(i.value)}${ic ? ` (95% CI ${fmt(ic[0])} to ${fmt(ic[1])})` : ""}` : ""}`
    + `${ok === null ? "" : ok ? ", both compatible with agreement" : ", so the methods differ systematically"}.`,
  [S.amrhein2019], ok ? "CIs that include 1 and 0 as proof that the methods agree. They show the data are compatible with agreement; the CI widths say how large a disagreement is still possible." : undefined,
  "Deming regression: fits a line when both methods measure with error.");
}

function methodRegMeaning(r: R): Meaning | null {
  const c = (Array.isArray(r.comparisons) ? r.comparisons : []).find((d: R) => num(d?.passing_bablok?.slope?.value));
  if (!c) return null;
  const pb = c.passing_bablok;
  const sc = ci2(pb.slope.ci), ic = ci2(pb.intercept?.ci);
  const lvl = `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`;
  const ok = sc && ic ? (sc[0] <= 1 && sc[1] >= 1 && ic[0] <= 0 && ic[1] >= 0) : null;
  return meaning(`A slope of 1 and an intercept of 0 would mean ${c.name} and ${c.x_name} agree; the Passing-Bablok slope is `
    + `${fmt(pb.slope.value)}${sc ? ` (${lvl} CI ${fmt(sc[0])} to ${fmt(sc[1])})` : ""} and the intercept ${fmt(pb.intercept.value)}`
    + `${ic ? ` (${lvl} CI ${fmt(ic[0])} to ${fmt(ic[1])})` : ""}`
    + `${ok === null ? "" : ok ? ", both compatible with agreement" : ", so the methods differ systematically"}.`,
  [SRC.passingBablok1983, S.amrhein2019],
  ok ? "CIs that include 1 and 0 as proof that the methods agree. They show the data are compatible with agreement; the CI widths say how large a disagreement is still possible." : undefined,
  "Passing-Bablok regression: a line of one method on the other from the median of the pairwise slopes, with no assumption about the error distributions.");
}

function iccMeaning(r: R): Meaning | null {
  const want = r.options?.form ?? "ICC2";
  const c = (Array.isArray(r.forms) ? r.forms : []).find((x: R) => x.form === want);
  if (!c || !num(c.value)) return null;
  const ci = ci2(c.ci);
  const one = c.unit === "single" ? "a single rater's rating" : `the mean of the ${r.k_raters} raters' ratings`;
  const agree = c.type === "absolute" ? "with the raters' systematic differences counted as disagreement"
    : "ignoring constant differences between the raters";
  return meaning(`An ICC of ${fmt(c.value)}${ci ? ` (95% CI ${fmt(ci[0])} to ${fmt(ci[1])})`.replace("95%",
    `${Number(((r.ci_level ?? 0.95) * 100).toPrecision(4))}%`) : ""} means that about ${pct(100 * Math.max(0, c.value))} of the `
    + `variation in ${one} is true variation between the ${r.n_targets} targets, ${agree}.`,
  [SRC.shroutFleiss1979],
  "an ICC as a correlation between two raters. It is the share of the rating variance that comes from the targets; the form chosen decides whether a rater who reads consistently high lowers it.",
  "Intraclass correlation: reliability of raters or instruments rating the same targets.");
}

// ------------------------------------------------------------- Wave 2 models (P-69)

/** "Treatment Mutagen (vs. Control)" or "each one-unit increase in Dose". */
function termWords(c: R, refs: R | null | undefined): { vs: string | null; variable: string } {
  const { variable, level } = splitLevel(String(c.name));
  const ref = level && refs && typeof refs === "object" ? refs[variable] : null;
  return { variable, vs: level ? `${variable} ${level}${ref ? ` (vs. ${ref})` : " (vs. the reference level)"}` : null };
}

/** Poisson, quasi-Poisson and negative binomial regression (rate ratios),
 *  binomial and quasi-binomial regression (odds ratios). */
function countModelMeaning(r: R, style: PStyle): Meaning | null {
  const coefs: R[] = (Array.isArray(r.coefficients) ? r.coefficients : [])
    .filter((c: R) => c && c.name !== "Intercept" && num(c.p));
  if (!coefs.length) return null;
  const c = coefs[0];
  const binomial = r.analysis === "binomial_regression";
  const ratio = binomial ? c.odds_ratio : c.rate_ratio;
  if (!num(ratio)) return null;
  const ci = ci2(binomial ? c.odds_ratio_ci : c.rate_ratio_ci);
  const lvl = num(r.ci_level) ? `${Number((r.ci_level * 100).toPrecision(4))}%` : "95%";
  const ciT = ci ? `, ${lvl} CI ${fmt(ci[0])} to ${fmt(ci[1])}` : "";
  const { vs, variable } = termWords(c, r.reference_levels);
  const others = [...new Set(coefs.slice(1).map((x) => splitLevel(String(x.name)).variable))].filter((v) => v !== variable);
  const hold = others.length ? `, holding ${list(others)} constant` : "";
  const outcome = String(r.outcome ?? "the outcome");
  const sig = c.p < ALPHA;
  const quasi = r.family === "quasipoisson" || r.family === "quasibinomial";
  const phi = num(r.dispersion?.phi) ? r.dispersion.phi : null;
  const spread = quasi && phi !== null ? `; the CI and P allow for a variance ${fmt(phi)} times the ${binomial ? "binomial" : "Poisson"} variance (quasi-likelihood)`
    : r.analysis === "negative_binomial_regression" ? "; the CI and P allow for counts more variable than Poisson counts (negative binomial)" : "";
  const verdict = sig
    ? `a ratio this far from 1 would be unusual (${P(c.p, style)}) if ${variable} had no association with ${outcome}`
    : `the data do not show an association (${P(c.p, style)}), and the CI includes 1`;
  if (binomial) {
    const total = r.totals ? ` (out of ${String(r.totals)})` : "";
    const lead = vs ? `${vs} multiplies the odds of ${outcome}${total} by ${fmt(ratio)}`
      : `Each one-unit increase in ${variable} multiplies the odds of ${outcome}${total} by ${fmt(ratio)}`;
    return meaning(`${lead} (odds ratio${ciT})${hold}${spread}; ${verdict}.`,
      [SRC.wartonHui2011, ...(quasi ? [SRC.wedderburn1974] : []), sig ? S.greenland2016 : S.amrhein2019],
      `an odds ratio of ${fmt(ratio)} as ${fmt(ratio)} times the share of positives. It multiplies the odds; when positives are common the share changes much less.`,
      `${quasi ? "Quasi-binomial" : "Binomial"} regression: models the share of positives out of the number counted, so each count carries the weight of its total.`);
  }
  const per = r.exposure ? ` per unit of ${String(r.exposure)}` : "";
  const lvl0 = splitLevel(String(c.name)).level;
  const ref0 = lvl0 && r.reference_levels ? r.reference_levels[variable] : null;
  const lead = vs ? `The rate of ${outcome}${per} with ${variable} ${lvl0} was ${hrWords(ratio)} that with ${ref0 ?? "the reference level"}`
    : `Each one-unit increase in ${variable} multiplies the rate of ${outcome}${per} by ${fmt(ratio)}`;
  const model = r.analysis === "negative_binomial_regression" ? "Negative binomial regression"
    : quasi ? "Quasi-Poisson regression" : "Poisson regression";
  const why = r.analysis === "negative_binomial_regression"
    ? "models counts whose variance grows faster than their mean, as overdispersed counts do."
    : quasi ? "models counts, with the variance allowed to be a multiple of the mean." : "models counts whose variance equals their mean.";
  return meaning(`${lead} (rate ratio ${fmt(ratio)}${ciT})${hold}${spread}; ${verdict}.`,
    [SRC.mccullaghNelder1989, ...(quasi ? [SRC.wedderburn1974] : r.analysis === "negative_binomial_regression"
      ? [SRC.venablesRipley2002] : []), sig ? S.greenland2016 : S.amrhein2019],
    `a rate ratio as a difference in counts. It multiplies the expected count${per}: when the reference rate is low, a large ratio can be a small change in counts.`,
    `${model}: ${why}`);
}

/** Ordinal (proportional-odds) regression (P-88): the odds ratio of a
 *  higher score for the first predictor, and the proportional-odds check
 *  when it fails. */
function ordinalMeaning(r: R, style: PStyle): Meaning | null {
  const coefs: R[] = (Array.isArray(r.coefficients) ? r.coefficients : []).filter((c: R) => c && num(c.p));
  if (!coefs.length || !num(coefs[0].odds_ratio)) return null;
  const c = coefs[0];
  const ci = ci2(c.odds_ratio_ci);
  const lvl = num(r.ci_level) ? `${Number((r.ci_level * 100).toPrecision(4))}%` : "95%";
  const ciT = ci ? `, ${lvl} CI ${fmt(ci[0])} to ${fmt(ci[1])}` : "";
  const { vs, variable } = termWords(c, r.reference_levels);
  const others = [...new Set(coefs.slice(1).map((x) => splitLevel(String(x.name)).variable))].filter((v) => v !== variable);
  const hold = others.length ? `, holding ${list(others)} constant` : "";
  const outcome = String(r.outcome ?? "the score");
  const sig = c.p < ALPHA;
  const lead = vs ? `${vs} multiplies the odds of a higher ${outcome} by ${fmt(c.odds_ratio)}`
    : `Each one-unit increase in ${variable} multiplies the odds of a higher ${outcome} by ${fmt(c.odds_ratio)}`;
  const verdict = sig
    ? `a ratio this far from 1 would be unusual (${P(c.p, style)}) if ${variable} had no association with ${outcome}`
    : `the data do not show an association (${P(c.p, style)}), and the CI includes 1`;
  const bad = (r.proportional_odds?.tests ?? []).some((t: R) => t?.term === variable && num(t.p) && t.p < ALPHA);
  const po = bad ? `; the proportional-odds check rejects one ratio for every cut point, so this is an average over them` : "";
  return meaning(`${lead} (odds ratio${ciT})${hold}${po}; ${verdict}.`,
    [SRC.mccullagh1980, ...(bad ? [SRC.petersonHarrell1990] : []), sig ? S.greenland2016 : S.amrhein2019],
    "an odds ratio of a higher score as a difference in mean score. It multiplies the odds of being above any cut point; the scores' spacing is not used.",
    "Ordinal (proportional-odds) regression: models the chance of each score or higher, using the order of the scores but not their spacing.");
}

/** Three-way ANOVA: the highest-order interaction the data show first. */
function threeWayMeaning(r: R, style: PStyle): Meaning | null {
  const src: R = r.sources && typeof r.sources === "object" ? r.sources : {};
  const entries = (Object.entries(src) as [string, R][]).filter(([k, s]) => !/^residual/i.test(k) && num(s?.p));
  if (!entries.length) return null;
  const byTerm = (re: RegExp) => entries.filter(([, s]) => re.test(String(s.term ?? "")));
  const three = byTerm(/^ABC$/)[0];
  const twos = byTerm(/^(AB|AC|BC)$/).sort((a, b) => a[1].p - b[1].p);
  const mains = byTerm(/^[ABC]$/);
  const name = (k: string) => k.replace(/ x /g, " × ");
  const test = "Three-way ANOVA: splits the variation into three factors, their three two-way interactions and the three-way interaction.";
  const sources = [SRC.gpThreeWay, S.gpInteraction];
  const MIS3 = "a significant main effect as an effect that holds at every level of the other factors. "
    + "With an interaction, the effect of one factor depends on the levels of the others.";
  if (three && three[1].p < ALPHA) {
    return meaning(`How ${name(twos.find(([, s]) => s.term === "BC")?.[0] ?? "the second and third factors")} combine differs between levels of `
      + `${mains.find(([, s]) => s.term === "A")?.[0] ?? "the first factor"} (three-way interaction ${P(three[1].p, style)}), `
      + "so describe the effects within each combination of levels rather than as averages.",
    [...sources, S.greenland2016], MIS3, test);
  }
  const sig2 = twos.filter(([, s]) => s.p < ALPHA);
  const threeT = three ? `the data do not show a three-way interaction (${P(three[1].p, style)})` : "";
  if (sig2.length) {
    const [k, s] = sig2[0];
    const [f1, f2] = k.split(" x ");
    return meaning(`The effect of ${f2} depended on ${f1} (${name(k)} interaction ${P(s.p, style)})`
      + sig2.slice(1).map(([x, y]) => `; ${x.split(" x ").join(" and ")} also interact (${P(y.p, style)})`).join("")
      + `${threeT ? `; ${threeT}` : ""}, so describe the effect of ${f2} at each level of ${f1}.`,
    [...sources, S.greenland2016], MIS3, test);
  }
  const mainT = mains.map(([k, s]) => `${k} ${P(s.p, style)}`);
  return meaning(`The data do not show that any factor's effect depends on another (smallest interaction `
    + `${twos.length ? P(twos[0][1].p, style) : "P not available"}${threeT ? `; ${threeT}` : ""}); averaged over the others, `
    + `the main effects are ${list(mainT)}.`, [...sources, S.amrhein2019],
  "“no interaction”: the effects are proven to add up. A large interaction P only means the data do not show the effects depend on each other.",
  test);
}

/** "mice" from the engine's "df come from 12 mice, not from 36 values". */
function unitWord(r: R): string {
  const m = /df come from \d+ (.+?), not from/.exec(String(r.design_note ?? ""));
  return m ? m[1] : String(r.grouping ?? "units");
}

/** Mixed models with experimental units as a random intercept: nested
 *  two-way (grouped table) and a grouping column (multiple variables). */
function mixedUnitMeaning(r: R, style: PStyle): Meaning | null {
  const terms: R[] = (Array.isArray(r.anova) ? r.anova : []).filter((t: R) => num(t?.p));
  if (!terms.length) return null;
  const units = unitWord(r);
  const counts = num(r.n_units) && num(r.n_values)
    ? `; the tests count the ${r.n_units} ${units}, not the ${r.n_values} values` : "";
  const icc = num(r.icc) ? ` (${pct(100 * Math.max(0, r.icc))} of the variation lies between ${units})` : "";
  const inter = terms.find((t) => /×|:| x /.test(String(t.term)));
  const test = r.analysis === "mixed_grouping"
    ? `Linear mixed model: compares ${list((r.factor_names ?? []).map(String)) || "the groups"} with each of the ${units} as a random intercept, so values from the same one are not counted as independent.`
    : `Nested two-way mixed model: two factors with ${units} as a random intercept, so the replicate values of one unit are not counted as independent.`;
  const mis = "every value as an independent replicate. Values from one unit (one animal, one dish) are not independent, "
    + "so n is the number of units, which is why the CI is wider and the P larger than an ordinary ANOVA's.";
  const sources = [SRC.lazic2010, SRC.aarts2014];
  const fdf = (t: R) => `F(${fmt(t.dfn)}, ${fmt(t.dfd)}) = ${fmt(t.f)}, ${P(t.p, style)}`;
  if (inter && inter.p < ALPHA) {
    const [a, b] = String(inter.term).split(/\s*(?:×|:| x )\s*/);
    return meaning(`The effect of ${b} differed between levels of ${a} (interaction ${fdf(inter)})${counts}${icc}, `
      + `so describe the effect of ${b} at each level of ${a}.`, [...sources, S.gpInteraction, S.greenland2016], mis, test);
  }
  const mains = terms.filter((t) => t !== inter);
  const sig = mains.filter((t) => t.p < ALPHA);
  const parts = mains.map((t) => (t.p < ALPHA ? `the ${t.term} means differ (${fdf(t)})`
    : `the data do not show a difference between the ${t.term} means (${fdf(t)})`));
  const interT = inter ? `the data do not show an interaction (${P(inter.p, style)}); ` : "";
  return meaning(`${interT[0] ? interT[0].toUpperCase() + interT.slice(1) : ""}${interT ? parts.join("; ") : `${parts[0][0].toUpperCase()}${parts.join("; ").slice(1)}`}`
    + `${counts}${icc}.`, [...sources, sig.length ? S.greenland2016 : S.amrhein2019], mis, test);
}

/** The group × time mixed model of a time course. */
function timecourseMeaning(r: R, style: PStyle): Meaning | null {
  const terms: R[] = Array.isArray(r.anova) ? r.anova : [];
  const gt = terms.find((t) => /×|:/.test(String(t.term)) && num(t.p));
  const g = terms.find((t) => /^group$/i.test(String(t.term)) && num(t.p));
  if (!gt) return null;
  const groups: string[] = Array.isArray(r.groups) ? r.groups.map(String) : [];
  const cmp: R[] = Array.isArray(r.group_difference_at_time?.comparisons) ? r.group_difference_at_time.comparisons : [];
  const test = `Mixed-effects model for repeated measures: each subject measured at every time, with ${String(r.covariance?.label ?? "a covariance structure").toLowerCase()} for the repeated values.`;
  const mis = "a difference at one time point as a difference in the whole time course. The Group × Time interaction asks "
    + "whether the groups change differently over time; the comparisons at each time ask where they differ.";
  const sources = [S.gpInteraction, SRC.gpMixed, SRC.aarts2014];
  if (gt.p < ALPHA) {
    let ex = "";
    const withD = cmp.filter((c) => num(c.difference));
    if (withD.length >= 2) {
      const first = withD[0], last = withD[withD.length - 1];
      const [a, b] = String(first.pair ?? "").split(" vs. ");
      ex = `: ${a} − ${b} was ${fmt(first.difference)} at time ${first.time ?? first.family} and ${fmt(last.difference)} at time ${last.time ?? last.family}`;
    }
    return meaning(`The ${groups.length ? `${list(groups)} ` : ""}groups changed differently over time (Group × Time ${P(gt.p, style)})${ex}, `
      + "so compare the groups at each time rather than by one average difference.", [...sources, S.greenland2016], mis, test);
  }
  return meaning(`The data do not show that the groups change differently over time (Group × Time ${P(gt.p, style)})`
    + `${g ? `; averaged over time, the groups ${g.p < ALPHA ? "differ" : "do not show a difference"} (${P(g.p, style)})` : ""}.`,
  [...sources, S.amrhein2019], mis, test);
}

/** Quantal (probit, logit, cloglog) dose-response: the ED50 of each line. */
function quantalMeaning(r: R): Meaning | null {
  const fits: R[] = Array.isArray(r.fits) ? r.fits.filter((x: R) => !x.error) : [];
  const fit = fits[0];
  const ec = (Array.isArray(fit?.ec) ? fit.ec : []).find((e: R) => e.level === 50) ?? fit?.ec?.[0];
  if (!fit || !ec || !num(ec.dose)) return null;
  const lvl = `${Number(((num(r.ci_level) ? r.ci_level : 0.95) * 100).toPrecision(4))}%`;
  const c = ci2(ec.dose_ci_fieller);
  const ciT = c ? ` (${lvl} Fieller CI ${fmt(c[0])} to ${fmt(c[1])})` : ec.dose_ci_fieller ? ` (the ${lvl} Fieller CI is unbounded: the slope is too uncertain)` : "";
  const level = num(ec.level) ? fmt(ec.level) : "50";
  const more = fits.length > 1 ? " (first data set shown)" : "";
  const gof = fit.goodness_of_fit;
  const fitT = num(gof?.p_pearson) ? (gof.p_pearson < (fit.heterogeneity?.alpha ?? ALPHA)
    ? `; the counts scatter more than the ${fit.link ?? "probit"} curve allows (Pearson χ² P = ${fmt(gof.p_pearson)})${fit.heterogeneity?.applied ? ", so its CIs are widened for heterogeneity" : ""}`
    : "") : "";
  return meaning(`For ${String(fit.name ?? "the line")}${more}, ${level}% of the subjects are expected to respond at a dose of ${fmt(ec.dose)}${ciT}${fitT}.`,
    [SRC.bliss1934],
    `the ED${level} as the dose that gives each subject ${level}% of its response. Each subject responds or not; the ED${level} is the dose at which ${level}% of them do.`,
    `Quantal dose-response (${String(fit.link ?? "probit")}): models the share of subjects responding at each dose.`);
}

/** One summary value per subject (an area under the curve, a value at a
 *  time or over a window) compared between groups. */
function subjectAucMeaning(r: R, style: PStyle): Meaning | null {
  const cmp = r.comparison;
  if (!cmp || !num(cmp.p)) return null;
  const groups: R[] = Array.isArray(r.groups) ? r.groups : [];
  const n = groups.map((g) => `${g.group} ${g.n}`).join(", ");
  // the time-course window summaries (sheets/assays/timecourse WINDOW_LABELS)
  const WINDOW: Record<string, string> = { mean: "mean over the window", max: "peak in the window",
    auc: "area under the curve over the window", auc_per_time: "time-weighted mean over the window" };
  const what = typeof r.summary === "string" && WINDOW[r.summary] ? WINDOW[r.summary]
    : r.per_time ? "area under the curve divided by its time span" : "area under the curve";
  const names: string[] = Array.isArray(cmp.names) ? cmp.names.map(String) : [];
  const diff = num(cmp.difference) && names.length === 2
    ? `; ${names[0]} − ${names[1]} = ${fmt(cmp.difference)}` : "";
  const test = `Summary-measure analysis: one ${what} per subject, compared between groups by ${String(cmp.test ?? "a test")}.`;
  const mis = "the repeated values of a subject as independent replicates. Here each subject counts once, through its own summary value.";
  if (cmp.p < ALPHA) {
    return meaning(`Each subject's ${what} differs between the groups${n ? ` (subjects: ${n})` : ""}: a difference this large would be unusual `
      + `(${P(cmp.p, style)}) if the groups did not differ${diff}.`, [SRC.gpIndependent, S.greenland2016], mis, test);
  }
  return meaning(`The data do not show that each subject's ${what} differs between the groups (${P(cmp.p, style)})${diff}.`,
    [SRC.gpIndependent, S.amrhein2019], mis, test);
}

/** qPCR: the 2^-ΔΔCq fold change of each target against the calibrator. */
function qpcrMeaning(r: R, o: R, style: PStyle): Meaning | null {
  const per: R[] = Array.isArray(r.per_target) ? r.per_target : [];
  const lvl = `${Number(((num(o.ciLevel) ? o.ciLevel : 0.95) * 100).toPrecision(4))}%`;
  for (const t of per) {
    // the comparison of a group with the calibrator, as the results sheet
    // shows it (its CI carries the calibrator's own scatter too)
    const cs: R[] = Array.isArray(t?.statistics?.comparisons) ? t.statistics.comparisons : [];
    const c = cs.find((x) => num(x?.fold_change) && x.second === r.calibrator && x.first !== r.calibrator)
      ?? cs.find((x) => num(x?.fold_change));
    if (!c) continue;
    const fc = c.fold_change;
    const ci = ci2(c.fold_change_ci);
    const p = c.p_adjusted ?? c.p;
    const group = String(c.first ?? c.group ?? "the group"), cal = String(c.second ?? r.calibrator ?? "the calibrator");
    const refs = Array.isArray(r.reference_genes) ? list(r.reference_genes.map(String)) : "the reference genes";
    const dir = fc >= 1 ? `${fmt(fc)}-fold higher` : `${fmt(1 / fc)}-fold lower`;
    const pT = num(p) ? (p < ALPHA ? `; a change this large would be unusual (${P(p, style)}) if expression did not differ`
      : `; the data do not show a change (${P(p, style)})`) : "";
    return meaning(`${String(t.target)} expression in ${group} was ${dir} than in ${cal} (fold change ${fmt(fc)}`
      + `${ci ? `, ${lvl} CI ${fmt(ci[0])} to ${fmt(ci[1])}` : ""}), normalised to ${refs}${pT}.`,
    [SRC.livakSchmittgen2001, REF_SOURCES.miqe, num(p) && p < ALPHA ? S.greenland2016 : S.amrhein2019],
    "a fold change as a change in protein or in activity. It is a ratio of mRNA amounts relative to the reference genes, and assumes they do not change with treatment (see the reference-gene check).",
    "Relative quantification by 2^−ΔΔCq: each target's Cq is normalised to the reference genes, then to the calibrator group.");
  }
  return null;
}

function withheldMeaning(): Meaning {
  return meaning("With one independent value in a group there is no estimate of the variability within groups, so no "
    + "P value or CI can say whether the groups differ; more independent experiments are needed.",
  [SRC.gpIndependent], "technical replicates (wells, repeated reads) as independent values. They show the precision of "
    + "one measurement, not the variation between experiments.");
}

/**
 * The "What this means" line of a result, or null when the analysis has
 * none (descriptive analyses, data manipulations, a failed run).
 */
export function meaningOf(input: MeaningInput): Meaning | null {
  const r = input.result as R | null;
  if (!r || typeof r !== "object" || r.error) return null;
  const style = input.style ?? DEFAULT_REPORT.pStyle;
  const o = (input.options && typeof input.options === "object" ? input.options : {}) as R;
  const t = input.table ?? null;
  try {
    if (withheldInfo(r)) return withheldMeaning();
    // the assay modules (meaningMore.ts)
    const assay = assayMeaning(input.analysisId, r, o, t, style);
    if (assay !== undefined) return assay;
    if (input.analysisId === "cox" || input.analysisId === "mv_cox" || r.analysis === "cox") return coxMeaning(r, style);
    switch (r.analysis) {
      case "ttest": return ttestMeaning(r, t, style);
      case "ks_test": {
        const [a, b] = Array.isArray(r.names) ? r.names.map(String) : ["group A", "group B"];
        return ksMeaning(r, a, b, style);
      }
      case "anova":
      case "anova_unequal_var":
      case "rm_one_way_anova":
      case "friedman": return oneWayMeaning(r, t, style);
      case "two_way_anova":
      case "rm_two_way_mixed":
      case "rm_two_way_both": return twoWayMeaning(r, o, t, style);
      case "two_way_art": return artMeaning(r, style);
      case "correlation": return correlationMeaning(r, style);
      case "linear_regression": return linregMeaning(r, t, style);
      case "multiple_regression":
      case "logistic_regression": return regressionMeaning(r, style);
      case "dose_response": return doseMeaning(r, t);
      case "survival": return survivalMeaning(r, t, style);
      case "contingency": return contingencyMeaning(r, t, style);
      case "proportion_test": return proportionMeaning(r, style);
      case "kappa": return kappaMeaning(r);
      case "mcnemar": return mcnemarMeaning(r, style);
      case "nested_t_test":
      case "nested_one_way_anova": return nestedMeaning(r, t, style);
      case "column_statistics": return columnStatsMeaning(r, t, style);
      case "multiple_row_tests": return multiRowMeaning(r);
      case "estimation": return estimationMeaning(r, t);
      case "deming": return demingMeaning(r);
      case "method_regression": return methodRegMeaning(r);
      case "icc": return iccMeaning(r);
      // Wave 2 models and assays (P-69)
      case "poisson_regression":
      case "negative_binomial_regression":
      case "binomial_regression": return countModelMeaning(r, style);
      case "ordinal_regression": return ordinalMeaning(r, style);
      case "three_way_anova": return threeWayMeaning(r, style);
      case "mixed_nested_two_way":
      case "mixed_grouping": return mixedUnitMeaning(r, style);
      case "mixed_timecourse": return timecourseMeaning(r, style);
      // the general mixed model on a long table: its grouping column is the unit
      case "lmm": return mixedUnitMeaning({ ...r, analysis: "mixed_grouping", grouping: `${String(r.group)} groups`,
        n_units: r.n_groups?.[r.group], icc: r.variance_shares?.[r.group], design_note: undefined }, style);
      case "subject_auc": return subjectAucMeaning(r, style);
      case "qpcr": return qpcrMeaning(r, o, style);
      default: return input.analysisId === "quantal" ? quantalMeaning(r) : null;
    }
  } catch {
    return null;
  }
}
