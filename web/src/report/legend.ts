// Figure legends: what is plotted (centre, dispersion, what the error bars
// mean), n with its unit, the test with its sidedness, the post hoc test
// and correction, the star scale when stars are drawn, and the software
// with its version. The items are the ones journals ask legends to carry:
// Nature reporting summary ("exact sample size (n) ... as a discrete
// number and unit of measurement", "the statistical test(s) used AND
// whether they are one- or two-sided", "a description of all covariates
// ... central tendency ... AND variation"), Cell STAR Methods ("what n
// represents", "definition of center and dispersion"), eLife (exact n,
// replicates defined), JCB / Lord et al. 2020 (independent experiments
// stated), SAMPL (state the test and the scale of the asterisks). Pure.
import { describeResult, type GroupN, type TestInfo } from "./describe.ts";
import { starScale, type PStyle } from "./pformat.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export type ErrorBars = "sd" | "sem" | "ci95" | "ci" | "range" | "none";

const BAR_WORDS: Record<ErrorBars, string> = {
  sd: "the standard deviation (SD)",
  sem: "the standard error of the mean (SEM)",
  ci95: "the 95% confidence interval of the mean",
  ci: "the 95% confidence interval of the mean",
  range: "the range (minimum to maximum)",
  none: "",
};

/** One sentence on what the graph shows (null for an unknown kind). */
export function whatIsPlotted(graphType: string | null | undefined,
  opts: { errorBars?: ErrorBars | null; points?: boolean; estimation?: R | null } = {}): string | null {
  const bars = opts.errorBars ?? "sd";
  const err = bars === "none" ? "" : BAR_WORDS[bars];
  switch (graphType) {
    case "scatter":
      return `Points show individual values; horizontal lines show the mean and error bars ${err}.`;
    case "bar":
      return `Bars show the mean and error bars ${err}; points show individual values.`;
    case "box":
      return "Boxes show the median and interquartile range (IQR); whiskers extend to the most "
        + "extreme values within 1.5 × IQR of the box (Tukey); points show individual values.";
    case "violin":
      return "Violins show a kernel density estimate of the values with a line at the mean; "
        + "points show individual values.";
    case "estimation": {
      const e = opts.estimation;
      const ci = e?.ci_type === "percentile" ? "percentile" : "bias-corrected and accelerated (BCa)";
      const lvl = typeof e?.ci_level === "number" ? `${Math.round(e.ci_level * 100)}%` : "95%";
      const n = e?.n_resamples ?? 5000;
      const cumming = e?.plot?.kind === "cumming";
      return `${cumming ? "Upper panel" : "Left axis"}: individual values${e?.paired ? " (lines join paired values)" : ""}, `
        + "with the mean and SD drawn as a gapped line beside each group. "
        + `${cumming ? "Lower panel" : "Right axis"}: the ${e?.effects?.[0] === "median_diff" ? "median" : "mean"} difference from the control (dot) `
        + `with its ${lvl} ${ci} bootstrap confidence interval (vertical bar) and the bootstrap `
        + `distribution of the difference (${n} resamples, half-violin)`
        + `${cumming ? "" : ", on an axis whose zero is aligned with the control mean"}.`;
    }
    case "xy":
      return `Points show the mean of the replicates${err ? ` with error bars showing ${err}` : ""}; `
        + "the curve is the fitted model.";
    case "survival":
      return "Kaplan-Meier survival curves; tick marks show censored subjects.";
    case "nested_scatter":
      return "Points show individual values within each subcolumn and short lines the subcolumn "
        + "means; long lines show the group mean with its confidence interval from the nested model.";
    case "grouped_interleaved":
    case "grouped_separated":
    case "grouped_stacked":
    case "grouped_three_way":
      return `Bars show the mean${err ? ` and error bars ${err}` : ""}${opts.points ? "; points show individual values" : ""}.`;
    case "grouped_scatter":
      return `Points show individual values; horizontal lines show the mean${err ? ` and error bars ${err}` : ""}.`;
    case "grouped_box":
      return "Boxes show the median and interquartile range; whiskers extend to the most "
        + "extreme values within 1.5 × IQR (Tukey).";
    case "grouped_lines":
      return `Points show the mean${err ? ` with error bars showing ${err}` : ""}, joined across rows.`;
    case "grouped_volcano":
      return "Each point is one row: the difference between the two data sets against −log10(P).";
    default:
      return null;
  }
}

export interface ReportUnit {
  /** What one n is: "mice", "wells", "patients" (plural noun). */
  unit?: string;
  /** Number of independent experiments (biological replicates). */
  experiments?: number | null;
}

const UNIT_WORDS: Record<NonNullable<TestInfo["nUnit"]>, string> = {
  values: "", pairs: "pairs", subjects: "subjects", subcolumns: "subcolumns",
};

/** "n = 6 per group", "n = 6 mice per group from 3 independent
 *  experiments", "n = 6 (Control), 5 (Treated)". */
export function nStatement(groups: GroupN[], info: Pick<TestInfo, "nUnit">,
  unit: ReportUnit = {}): string | null {
  const g = groups.filter((x) => Number.isFinite(x.n));
  if (!g.length) return null;
  const word = unit.unit?.trim() || (info.nUnit ? UNIT_WORDS[info.nUnit] : "");
  const exp = unit.experiments && unit.experiments > 0 && !/experiment/i.test(word)
    ? ` from ${unit.experiments} independent experiment${unit.experiments === 1 ? "" : "s"}` : "";
  const same = g.every((x) => x.n === g[0].n);
  if (info.nUnit === "pairs" && same) {
    return `n = ${g[0].n} ${unit.unit?.trim() ? `${unit.unit.trim()} (paired)` : "pairs"}${exp}`;
  }
  if (same) {
    return `n = ${g[0].n}${word ? ` ${word}` : ""}${g.length > 1 ? " per group" : ""}${exp}`;
  }
  return `n = ${g.map((x) => `${x.n} (${x.name})`).join(", ")}${word ? ` ${word}` : ""}${exp}`;
}

export interface LegendInput {
  /** Graph kind id of the figure (null: legend for the results alone). */
  graphType: string | null;
  /** What the graph draws, from the figure package's legend sentence
   *  (graph/legend.ts plottedClause); replaces whatIsPlotted when set, so
   *  the legend under a graph and its caption never disagree. */
  plotted?: string;
  /** Added in parentheses after the n statement ("54 cells in all"). */
  nNote?: string;
  result: unknown;
  /** n per group from the table, used when the result has none. */
  groups?: GroupN[];
  unit?: ReportUnit;
  errorBars?: ErrorBars | null;
  points?: boolean;
  /** Stars are drawn on the figure (pairwise brackets as asterisks). */
  starsShown?: boolean;
  /** P values are drawn on the figure as numbers. */
  pShown?: boolean;
  style: PStyle;
  hideNs?: boolean;
  /** "OpenDose 0.2.0 (SciPy 1.14.1, NumPy 2.0.2)". */
  software: string;
}

/** The figure-legend paragraph. */
export function legendParagraph(i: LegendInput): string {
  const info = describeResult(i.result);
  const parts: string[] = [];
  const what = i.plotted?.trim() || whatIsPlotted(i.graphType, {
    errorBars: i.errorBars, points: i.points,
    estimation: (i.result as R | null)?.analysis === "estimation" ? i.result as R : null,
  });
  if (what) parts.push(what);
  const groups = info.groups.length ? info.groups : i.groups ?? [];
  const n = nStatement(groups, info, i.unit);
  if (n) parts.push(`${n}${i.nNote ? ` (${i.nNote})` : ""}.`);
  const est = (i.result as R | null)?.analysis === "estimation";
  if (est) {
    const many = info.multiplicity === "uncorrected";
    parts.push(`Differences were estimated by bootstrap resampling; P values are from two-sided permutation tests${many ? ", not corrected for multiple comparisons" : ""}.`);
  } else if (info.test) {
    let t = `${article(info.test)} ${info.test}${info.sided ? ` (${info.sided === "two-sided" ? "two-tailed" : info.sided})` : ""}`;
    if (info.posthoc && info.multiplicity === "corrected") {
      t += ` followed by ${info.posthoc}, with P values adjusted for multiple comparisons (${info.correction})`;
    } else if (info.posthoc && info.multiplicity === "uncorrected") {
      t += ` followed by ${info.posthoc}, without correction for multiple comparisons`;
    } else if (info.multiplicity === "uncorrected") {
      t += ", without correction for multiple comparisons";
    }
    parts.push(`${t} was used.`);
  }
  if (i.starsShown) parts.push(`${starScale(i.style, i.hideNs ?? false)}.`);
  if (i.pShown) parts.push("P values shown are exact.");
  parts.push(`Analysed and drawn with ${i.software}.`);
  return parts.join(" ");
}

/** "The" before a named test (Mann-Whitney), else "A" / "An". */
function article(s: string): string {
  if (/^[A-Z]/.test(s)) return "The";
  return /^[aeiou]/i.test(s) && !/^(one|uni|eu)/i.test(s) ? "An" : "A";
}
