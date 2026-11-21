// The methods sentence of a column analysis, built from the options and
// the result (which test, which post test, how P values were computed).
// Pure; methods.tsx adds the software sentence and the Copy card.
import type { ColumnOptionsState } from "../../types";
import { formatPValue } from "../../report/pformat";
import { familyMethodsClause, familyOf } from "../../report/family";
import { DEFAULT_NORMALITY_TESTS, NORMALITY_TEST_LABELS, formatSig } from "../../types";
import { logMethodsSentence } from "./logScale";
import { rmMethodsSentence } from "./rmPosthoc";
import { oneTailedAlternative } from "./tails";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

/** "P = 0.0123" in the project's P-value style (report/pformat.ts). */
const P = (p: unknown) => (typeof p !== "number" ? "n/a" : formatPValue(p));

const POST: Record<string, string> = {
  tukey: "Tukey's multiple comparisons test",
  dunnett: "Dunnett's multiple comparisons test against the control group",
  bonferroni: "Bonferroni's multiple comparisons test",
  sidak: "Šídák's multiple comparisons test",
  holm_sidak: "the Holm-Šídák multiple comparisons test",
  holm: "t tests with Holm's step-down (Bonferroni) correction",
  newman_keuls: "the Newman-Keuls multiple comparisons test",
  fisher_lsd: "Fisher's LSD test (without correction for multiple comparisons)",
  games_howell: "the Games-Howell multiple comparisons test",
  dunnett_t3: "Dunnett's T3 multiple comparisons test",
  tamhane_t2: "Tamhane's T2 multiple comparisons test",
  welch_uncorrected: "unpaired t tests with Welch's correction (without correction for multiple comparisons)",
};

/** ", with Šídák correction for 2 planned comparisons" (report/family.ts),
 *  or "" when the result carries no family label. */
function withFamily(mc: unknown, fallback?: string): string {
  const f = familyOf(mc, fallback);
  return f ? `, with ${familyMethodsClause(f)}` : "";
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("")
  : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function pHow(r: R): string {
  return r?.p_method === "exact" ? " (exact P value)"
    : r?.p_method === "approximate" ? " (approximate P value)" : "";
}

/** The sentence describing the analysis (without the software sentence). */
export function columnMethodsSentence(o: ColumnOptionsState, r: R): string {
  const s = testSentence(o, r);
  // on the log scale (logScale.ts): how the values were transformed
  const logs = s ? logMethodsSentence(r) : "";
  return logs ? `${s} ${logs}` : s;
}

function testSentence(o: ColumnOptionsState, r: R): string {
  // P withheld (common/withheld.ts): say no test was run.
  if (r?.withheld) {
    return "The values were described without a statistical test (exploratory): with fewer "
      + "than two independent values in a group, no P value can be computed.";
  }
  switch (o.analysis) {
    case "column_statistics": {
      const tests = (o.normalityTests ?? DEFAULT_NORMALITY_TESTS)
        .map((t) => `the ${NORMALITY_TEST_LABELS[t] ?? t}`);
      let s = "Descriptive statistics were computed for each data set"
        + (o.percentileMethod === "prism" ? " (percentiles from rank (n + 1)p)" : "");
      if (tests.length) s += `, and normality was assessed with ${list(tests)} test${tests.length > 1 ? "s" : ""} (α = 0.05)`;
      if (o.lognormality) {
        s += `${tests.length ? "; lognormality was assessed with the same tests on the logarithms" : ""}`
          + ", and normal and lognormal distributions were compared by the likelihoods of their maximum-likelihood"
          + " fits, normalized to sum to 100% (Burnham & Anderson 2002)";
      }
      if (o.hypothetical.trim()) {
        s += `. Each column was compared with the hypothetical value ${o.hypothetical.trim()} by a one-sample t test and the Wilcoxon signed rank test`
          + (o.zeroMethod === "pratt" ? " (values equal to the hypothetical median handled by Pratt's method)" : "")
          + (o.ratioT ? ", and by a one-sample ratio t test on the logarithms" : "");
      }
      return `${s}.`;
    }
    case "ttest": {
      const s = ttestSentence(o, r);
      // the one-tailed P the results card shows (not on the log scale card)
      const tails = o.ttestTails;
      if (!s || (tails !== "greater" && tails !== "less") || o.ttestKind === "kolmogorov_smirnov"
        || r.ratio != null) return s;
      const p = tails === "greater" ? r.p_greater : r.p_less;
      if (typeof p !== "number") return s;
      return `${s} A one-tailed P value was also computed for the direction stated in advance (alternative: `
        + `${oneTailedAlternative(r, tails)}; ${P(p)}).`;
    }
    case "anova": {
      if (o.anovaKind === "nonparametric") {
        return "Groups were compared with the Kruskal-Wallis test"
          + (o.kwExact ? (r.p_method === "exact" ? " (exact P value)"
            : " (approximate P value; the samples are too large for the exact one)") : "")
          + ` (H = ${formatSig(r.H)}, ${P(r.p)})`
          + (r.dunns ? `, followed by Dunn's multiple comparisons test${r.dunns.corrected === false ? " without correction for multiple comparisons" : withFamily(r.dunns, "dunns")}` : "")
          + ".";
      }
      if (r.analysis === "anova_unequal_var") {
        const w = r.welch, bf = r.brown_forsythe;
        const mc = r.multiple_comparisons;
        return "Group means were compared without assuming equal SDs, by Welch's ANOVA"
          + ` (W(${w.dfn}, ${formatSig(w.dfd)}) = ${formatSig(w.W)}, ${P(w.p)})`
          + ` and the Brown-Forsythe ANOVA (F*(${bf.dfn}, ${formatSig(bf.dfd)}) = ${formatSig(bf.F)}, ${P(bf.p)})`
          + (mc ? `, followed by ${POST[mc.method] ?? mc.method}${mc.family === "control" ? " against the control group" : ""}${mc.method === "welch_uncorrected" ? "" : withFamily(mc)}` : "")
          + ".";
      }
      const t = r.table ?? {};
      const mc = r.multiple_comparisons;
      return `Group means were compared by ordinary one-way ANOVA (F(${t.df_between}, ${t.df_within}) = ${formatSig(t.F)}, ${P(t.p)})`
        + (mc ? `, followed by ${POST[mc.method] ?? mc.method}${mc.method === "fisher_lsd" ? "" : withFamily(mc)}` : "") + "."
        + (r.trend && !r.trend.error ? ` A test for linear trend across the columns in the order entered gave a slope of ${formatSig(r.trend.slope)} per column (${P(r.trend.linear.p)}; nonlinear variation ${P(r.trend.nonlinear.p)}).` : "");
    }
    case "frequency": {
      if (r.exact) {
        return `Exact cumulative frequency distributions were computed${r.fits ? " and fitted with a cumulative Gaussian distribution by least squares" : ""}.`;
      }
      return `Frequency distributions were tabulated with a bin width of ${formatSig(r.bin_width)}${r.bin_width_auto ? " (chosen automatically: 1 + log2(n) bins, rounded down to a round number)" : ""}`
        + `${r.cumulative ? ", cumulatively" : ""}${r.relative ? ` as ${r.relative === "percent" ? "percentages" : "fractions"}` : ""}`
        + `${typeof r.upper_limit === "number" ? `; values above ${formatSig(r.upper_limit)} were left out (and a value equal to it when it fell on a bin edge, since no bin extends past the limit)` : ""}`
        + `${r.fits ? ", and a Gaussian distribution was fitted to the counts at the bin centers by least squares" : ""}.`;
    }
    case "p_stack": {
      const how = ({ bky: "the two-stage step-up method of Benjamini, Krieger and Yekutieli",
        bh: "the method of Benjamini and Hochberg", by: "the method of Benjamini and Yekutieli",
        holm_sidak: "the Holm-Šídák step-down method", sidak: "the Šídák method",
        bonferroni: "the Bonferroni method", holm: "Holm's step-down method" } as Record<string, string>)[r.method];
      if (!how) return `${r.n} P values were each compared with α = ${formatSig(r.alpha)}, without correction for multiple comparisons; ${r.discoveries} were below it.`;
      return r.approach === "fdr"
        ? `A family of ${r.n} P values was corrected for multiple comparisons by controlling the false discovery rate with ${how} (Q = ${formatSig(100 * r.q)}%); ${r.discoveries} comparison${r.discoveries === 1 ? " was a discovery" : "s were discoveries"}.`
        : `A family of ${r.n} P values was corrected for multiple comparisons with ${how} (family-wise α = ${formatSig(r.alpha)}); ${r.discoveries} comparison${r.discoveries === 1 ? " was" : "s were"} significant.`;
    }
    case "median_test":
      return "Group medians were compared with Mood's median test, counting the values above and not above the grand median"
        + (r.chi_square ? ` (chi-square = ${formatSig(r.chi_square.chi2)}, df = ${r.chi_square.df}, ${P(r.chi_square.p)})` : "")
        + (r.fisher_exact ? `; Fisher's exact test on the two-group table gave ${P(r.fisher_exact.p)}` : "") + ".";
    case "rm_anova":
      return o.rmKind === "nonparametric"
        ? `Matched values were compared with the Friedman test${o.rmExact ? (r.p_method === "exact" ? " (exact P value)" : " (approximate P value; the design is too large for the exact one)") : ""} (${P(r.p)}), followed by Dunn's multiple comparisons test${r.dunns?.corrected === false ? "" : withFamily(r.dunns, "dunns")}.`
        // with the comparisons and their error term (rmPosthoc.ts)
        : rmMethodsSentence(r);
    case "two_way_anova": {
      const mc = r.multiple_comparisons;
      return `Data were analyzed by two-way ANOVA (rows × data sets${o.twoWayModel === "additive"
        ? "; main effects only, without the interaction term" : ""})`
        + (mc ? `, followed by ${POST[mc.method] ?? mc.method}${mc.direction === "all_cells"
          ? " comparing every cell mean with every other" : ""}${withFamily(mc)}` : "") + ".";
    }
    case "rm_two_way": return "Data were analyzed by two-way repeated-measures ANOVA.";
    case "correlation": {
      const name = o.corrMethod === "pearson" ? "Pearson correlation coefficient"
        : o.corrMethod === "kendall" ? "Kendall rank correlation coefficient (tau-b)"
          : "Spearman correlation coefficient";
      const tails = o.corrTails === "greater" ? " and a one-tailed P value (alternative: positive correlation)"
        : o.corrTails === "less" ? " and a one-tailed P value (alternative: negative correlation)" : "";
      if (r.analysis === "correlation_x") {
        const n = (r.items ?? []).length;
        return `X was correlated with each of ${n} Y data set${n === 1 ? "" : "s"} by the ${name} with a two-tailed P value${tails}`
          + `${r.replicates_averaged ? "; replicate Y values were averaged per row" : ""}.`;
      }
      return `Correlation was computed as the ${name} with a two-tailed P value${tails}.`;
    }
    case "roc": return "The area under the ROC curve was computed with its SE and confidence interval (DeLong).";
    case "bland_altman": return "Agreement between the two methods was assessed by the Bland-Altman method (bias and 95% limits of agreement).";
    case "outliers": return o.outlierMethod === "rout"
      ? `Outliers were identified with the ROUT method (Q = ${o.routQ}%).`
      : `Outliers were identified with Grubbs' test (α = ${o.grubbsAlpha}).`;
    default: return "";
  }
}

/** The sentence of a two-group test, two-tailed, by test kind. */
function ttestSentence(o: ColumnOptionsState, r: R): string {
  const [a, b] = r.names ?? ["A", "B"];
  const pair = `${a} and ${b}`;
  switch (o.ttestKind) {
    case "unpaired": return `${pair} were compared with an unpaired two-tailed t test (t = ${formatSig(r.t)}, df = ${formatSig(r.df)}, ${P(r.p_two_tailed)}).`;
    case "welch": return `${pair} were compared with an unpaired two-tailed t test with Welch's correction, not assuming equal SDs (t = ${formatSig(r.t)}, df = ${formatSig(r.df)}, ${P(r.p_two_tailed)}).`;
    case "paired": return `${pair} were compared with a two-tailed paired t test (t = ${formatSig(r.t)}, df = ${r.df}, ${P(r.p_two_tailed)}).`;
    case "ratio_paired": return `${pair} were compared with a two-tailed ratio paired t test on the logarithms of the paired values; the geometric mean of the ratios was ${formatSig(r.geometric_mean_ratio)} (95% CI ${formatSig(r.ci_ratio?.[0])} to ${formatSig(r.ci_ratio?.[1])}, ${P(r.p_two_tailed)}).`;
    case "mann_whitney": return `${pair} were compared with the two-tailed Mann-Whitney test${pHow(r)} (U = ${formatSig(r.U)}, ${P(r.p_two_tailed)}); the difference is summarized by the Hodges-Lehmann estimate (${formatSig(r.hodges_lehmann_difference)}).`;
    case "kolmogorov_smirnov": return `The distributions of ${pair} were compared with the two-sample Kolmogorov-Smirnov test${pHow(r)} (D = ${formatSig(r.D)}, ${P(r.p)}).`;
    case "wilcoxon": return `${pair} were compared with the two-tailed Wilcoxon matched-pairs signed rank test${pHow(r)}${o.zeroMethod === "pratt" ? ", handling zero differences by Pratt's method" : ""} (W = ${formatSig(r.W)}, ${P(r.p_two_tailed)}).`;
    default: return "";
  }
}
