// What a result is, in words: the test with its sidedness, the post hoc
// test and multiplicity correction, the groups with their n, and which
// reporting items it carries (effect size with CI, statistic with df,
// assumption checks). Shared by the results sentences, the figure legend
// and the journal checklists, so all three name a test the same way.
// Pure, unit-tested.

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export interface GroupN { name: string; n: number }

export interface TestInfo {
  /** "unpaired t test", "ordinary one-way ANOVA", ... (null: no test). */
  test: string | null;
  /** Every P the app reports is two-sided unless a result says otherwise. */
  sided: "two-sided" | null;
  /** Post hoc test, e.g. "Tukey's multiple comparisons test". */
  posthoc: string | null;
  /** How multiplicity is handled: one comparison only ("single"), a named
   *  correction, deliberately uncorrected, or not applicable (null). */
  multiplicity: "single" | "corrected" | "uncorrected" | null;
  /** The correction's name ("Tukey", "Holm-Šídák", "two-stage step-up FDR"). */
  correction: string | null;
  /** Analysed groups with their n (what the n counts: `nUnit`). */
  groups: GroupN[];
  /** "values" (independent), "pairs", "subjects", "subcolumns". */
  nUnit: "values" | "pairs" | "subjects" | "subcolumns" | null;
  /** The result reports a test statistic with its degrees of freedom. */
  statisticWithDf: boolean;
  /** Assumption checks reported with the result (or why none are needed). */
  assumptions: string | null;
  /** Exact P values (with the style's floor) are reported. */
  exactP: boolean;
  /** Repeated measures / matched design. */
  repeated: boolean;
}

export const POSTHOC_NAMES: Record<string, string> = {
  tukey: "Tukey's multiple comparisons test",
  dunnett: "Dunnett's multiple comparisons test (each group against the control)",
  bonferroni: "Bonferroni's multiple comparisons test",
  sidak: "Šídák's multiple comparisons test",
  holm_sidak: "the Holm-Šídák multiple comparisons test",
  holm: "Holm's step-down correction",
  newman_keuls: "the Newman-Keuls multiple comparisons test",
  fisher_lsd: "Fisher's LSD test",
  fisher: "Fisher's LSD test",
  games_howell: "the Games-Howell multiple comparisons test",
  dunnett_t3: "Dunnett's T3 multiple comparisons test",
  tamhane_t2: "Tamhane's T2 multiple comparisons test",
  welch_uncorrected: "unpaired Welch t tests",
  dunns: "Dunn's multiple comparisons test",
  bh: "the Benjamini-Hochberg false discovery rate (FDR) procedure",
  by: "the Benjamini-Krieger-Yekutieli two-stage step-up FDR procedure",
  bky: "the Benjamini-Krieger-Yekutieli two-stage step-up FDR procedure",
  two_stage: "the Benjamini-Krieger-Yekutieli two-stage step-up FDR procedure",
  benjamini_yekutieli: "the Benjamini-Yekutieli FDR procedure",
  none: "no correction for multiple comparisons",
};

export const CORRECTION_NAMES: Record<string, string> = {
  tukey: "Tukey", dunnett: "Dunnett", bonferroni: "Bonferroni", sidak: "Šídák",
  holm_sidak: "Holm-Šídák", holm: "Holm", newman_keuls: "Newman-Keuls",
  games_howell: "Games-Howell", dunnett_t3: "Dunnett T3", tamhane_t2: "Tamhane T2",
  dunns: "Dunn (Bonferroni-type)", bh: "Benjamini-Hochberg FDR",
  bky: "two-stage step-up FDR", two_stage: "two-stage step-up FDR", by: "two-stage step-up FDR",
  benjamini_yekutieli: "Benjamini-Yekutieli FDR",
};

const UNCORRECTED = new Set(["fisher_lsd", "fisher", "welch_uncorrected", "none"]);

export const TEST_NAMES: Record<string, string> = {
  unpaired_t: "unpaired t test",
  welch_t: "unpaired t test with Welch's correction",
  paired_t: "paired t test",
  ratio_paired_t: "ratio paired t test",
  mann_whitney: "Mann-Whitney test",
  wilcoxon_matched_pairs: "Wilcoxon matched-pairs signed rank test",
  kolmogorov_smirnov: "two-sample Kolmogorov-Smirnov test",
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function base(): TestInfo {
  return {
    test: null, sided: null, posthoc: null, multiplicity: null, correction: null,
    groups: [], nUnit: null, statisticWithDf: false, assumptions: null, exactP: false,
    repeated: false,
  };
}

function withMc(info: TestInfo, mc: R | null | undefined, method?: string): TestInfo {
  if (!mc || !Array.isArray(mc.comparisons) || !mc.comparisons.length) return info;
  const m = String(method ?? mc.method ?? "");
  info.posthoc = POSTHOC_NAMES[m] ?? m.replace(/_/g, " ");
  if (UNCORRECTED.has(m) || mc.corrected === false) {
    info.multiplicity = "uncorrected";
    info.correction = null;
  } else {
    info.multiplicity = "corrected";
    info.correction = CORRECTION_NAMES[m] ?? m;
  }
  return info;
}

function groupsOf(list: unknown): GroupN[] {
  return Array.isArray(list) ? list.filter((g) => g && num(g.n))
    .map((g) => ({ name: String(g.name ?? ""), n: g.n })) : [];
}

/** " on log10-transformed values" for a result analysed on the log scale
 *  (sheets/column/logScale.ts), else "". */
function logClause(r: R): string {
  return r.log_scale && typeof r.log_scale === "object"
    ? ` on ${r.log_scale.base === "ln" || r.log_scale.base === "log2" ? r.log_scale.base : "log10"}-transformed values` : "";
}

/** Describe an engine result (any analysis). */
export function describeResult(result: unknown): TestInfo {
  const r = result as R | null;
  const info = base();
  if (!r || typeof r !== "object" || r.error) return info;
  const names: string[] = Array.isArray(r.names) ? r.names.map(String) : [];
  switch (r.analysis) {
    case "ttest": {
      info.test = (TEST_NAMES[String(r.test)] ?? "two-group test") + logClause(r);
      info.sided = "two-sided";
      info.multiplicity = "single";
      info.exactP = true;
      const paired = /(^|_)paired|wilcoxon/.test(String(r.test));
      info.repeated = paired;
      if (paired && num(r.n_pairs)) {
        info.groups = names.map((name) => ({ name, n: r.n_pairs }));
        info.nUnit = "pairs";
      } else if (num(r.n_a) && num(r.n_b)) {
        info.groups = [{ name: names[0] ?? "A", n: r.n_a }, { name: names[1] ?? "B", n: r.n_b }];
        info.nUnit = "values";
      }
      info.statisticWithDf = num(r.t) && num(r.df);
      info.assumptions = r.f_test_variances ? "F test for equal variances"
        : r.test === "welch_t" ? "equal SDs not assumed (Welch)"
          : /mann|wilcoxon|kolmogorov/.test(String(r.test)) ? "nonparametric (no normality assumption)"
            : null;
      return info;
    }
    case "anova":
      info.sided = "two-sided";
      info.exactP = true;
      info.groups = groupsOf(r.group_summaries);
      info.nUnit = "values";
      if (r.kind === "nonparametric") {
        info.test = "Kruskal-Wallis test";
        info.assumptions = "nonparametric (no normality assumption)";
        return withMc(info, r.dunns, "dunns");
      }
      info.test = `ordinary one-way ANOVA${logClause(r)}`;
      info.statisticWithDf = true;
      info.assumptions = r.brown_forsythe ? "Brown-Forsythe and Bartlett's tests for equal variances" : null;
      return withMc(info, r.multiple_comparisons);
    case "anova_unequal_var":
      info.test = "Welch's and Brown-Forsythe one-way ANOVA";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.groups = groupsOf(r.group_summaries);
      info.nUnit = "values";
      info.assumptions = "equal SDs not assumed (Welch)";
      return withMc(info, r.multiple_comparisons);
    case "rm_one_way_anova":
      info.test = "repeated-measures one-way ANOVA (Geisser-Greenhouse corrected)";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.repeated = true;
      info.groups = (names.length ? names : []).map((name) => ({ name, n: r.n_subjects }));
      info.nUnit = "subjects";
      info.assumptions = "sphericity not assumed (Geisser-Greenhouse)";
      // the comparisons block of RM one-way ANOVA is `comparisons`
      return withMc(info, r.multiple_comparisons ?? (Array.isArray(r.comparisons?.comparisons)
        ? r.comparisons : null));
    case "mixed_rm_one_way":
      info.test = "mixed-effects model (REML) for repeated measures (Geisser-Greenhouse corrected)";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.repeated = true;
      info.groups = Array.isArray(r.estimated_means) ? r.estimated_means
        .filter((m: R) => num(m?.n)).map((m: R) => ({ name: String(m.name), n: m.n })) : [];
      info.nUnit = "subjects";
      info.assumptions = "sphericity not assumed (Geisser-Greenhouse)";
      return withMc(info, r.multiple_comparisons);
    case "friedman":
      info.test = "Friedman test";
      info.sided = "two-sided";
      info.exactP = true;
      info.repeated = true;
      info.groups = names.map((name) => ({ name, n: r.n_subjects }));
      info.nUnit = "subjects";
      info.assumptions = "nonparametric (no normality assumption)";
      return withMc(info, r.dunns, "dunns");
    case "two_way_anova":
      info.test = "two-way ANOVA";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.nUnit = "values";
      return withMc(info, r.multiple_comparisons);
    case "rm_two_way_mixed":
    case "rm_two_way_both":
    case "mixed_rm_twoway":
      info.test = r.analysis === "rm_two_way_both"
        ? "two-way repeated-measures ANOVA (both factors repeated)"
        : r.analysis === "mixed_rm_twoway" ? "mixed-effects model (REML) for repeated measures"
          : "two-way repeated-measures ANOVA (mixed design)";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.repeated = true;
      info.nUnit = "subjects";
      if (Array.isArray(r.group_sizes) && Array.isArray(r.col_names)) {
        info.groups = r.col_names.map((name: string, i: number) => ({ name, n: r.group_sizes[i] }))
          .filter((g: GroupN) => num(g.n));
      }
      info.assumptions = num(r.gg_epsilon) ? "sphericity not assumed (Geisser-Greenhouse)" : null;
      return withMc(info, r.multiple_comparisons);
    case "three_way_anova":
      info.test = "three-way ANOVA";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.nUnit = "values";
      return withMc(info, r.multiple_comparisons);
    case "multiple_row_tests": {
      const t = String(r.test ?? "");
      info.test = `multiple ${t === "welch" ? "Welch t tests" : t === "paired" ? "paired t tests"
        : t === "mann_whitney" ? "Mann-Whitney tests" : "unpaired t tests"} (one per row)`;
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      const m = String(r.method ?? "");
      info.posthoc = POSTHOC_NAMES[m] ?? m;
      info.multiplicity = UNCORRECTED.has(m) ? "uncorrected" : "corrected";
      info.correction = CORRECTION_NAMES[m] ?? m;
      info.nUnit = t === "paired" ? "pairs" : "values";
      const rows: R[] = Array.isArray(r.rows) ? r.rows : [];
      if (rows.length && names.length === 2) {
        const nA = rows.map((x) => x.n_a).filter(num), nB = rows.map((x) => x.n_b).filter(num);
        if (nA.length && nB.length) {
          info.groups = [{ name: names[0], n: Math.min(...nA) }, { name: names[1], n: Math.min(...nB) }];
        }
      }
      return info;
    }
    case "correlation":
      info.test = r.method === "spearman" ? "Spearman correlation"
        : r.method === "kendall" ? "Kendall rank correlation (tau-b)" : "Pearson correlation";
      info.sided = "two-sided";
      info.exactP = true;
      info.multiplicity = "single";
      info.statisticWithDf = r.method === "pearson" || r.method === undefined;
      if (num(r.n)) info.groups = [{ name: names.join(" and ") || "pairs", n: r.n }];
      info.nUnit = "pairs";
      return info;
    case "contingency":
      info.test = r.rows === 2 && r.cols === 2 ? "Fisher's exact test" : "chi-square test";
      info.sided = "two-sided";
      info.exactP = true;
      info.multiplicity = "single";
      info.statisticWithDf = !!r.chi_square;
      if (num(r.total)) info.groups = [{ name: "subjects", n: r.total }];
      info.nUnit = "subjects";
      return info;
    case "mcnemar":
      info.test = "McNemar's test";
      info.sided = "two-sided";
      info.exactP = true;
      info.multiplicity = "single";
      info.repeated = true;
      if (num(r.n_pairs)) info.groups = [{ name: "pairs", n: r.n_pairs }];
      info.nUnit = "pairs";
      return info;
    case "survival": {
      info.test = "log-rank (Mantel-Cox) test";
      info.sided = "two-sided";
      info.exactP = true;
      info.multiplicity = "single";
      info.statisticWithDf = !!r.logrank;
      const curves = r.curves && typeof r.curves === "object" ? r.curves : {};
      info.groups = Object.entries(curves).map(([name, c]) => ({ name, n: (c as R).n }))
        .filter((g) => num(g.n));
      info.nUnit = "subjects";
      // Pairwise log-rank tests and the test for trend (sheets/survival/extras.ts).
      const pw = r.extras?.pairwise;
      if (pw && !pw.error && Array.isArray(pw.comparisons) && pw.comparisons.length) {
        if (r.extras.trend_shown && pw.trend) info.test = "log-rank (Mantel-Cox) test and the log-rank test for trend";
        const k = pw.family_size ?? pw.comparisons.length;
        info.posthoc = `pairwise log-rank tests (${String(pw.family?.label ?? "").startsWith("each group")
          ? `each group against ${pw.comparisons[0].a}` : "all pairs"}, ${k} comparisons)`;
        info.multiplicity = pw.correction === "none" ? "uncorrected" : "corrected";
        info.correction = pw.correction === "none" ? null : CORRECTION_NAMES[pw.correction] ?? pw.correction;
      }
      return info;
    }
    case "nested_t_test":
      info.test = "nested t test (subcolumns as a random factor)";
      info.sided = "two-sided";
      info.exactP = true;
      info.multiplicity = "single";
      info.statisticWithDf = true;
      info.groups = (Array.isArray(r.group_means) ? r.group_means : [])
        .map((g: R) => ({ name: String(g.name), n: g.n_subcolumns })).filter((g: GroupN) => num(g.n));
      info.nUnit = "subcolumns";
      return info;
    case "nested_one_way_anova":
      info.test = "nested one-way ANOVA (subcolumns as a random factor)";
      info.sided = "two-sided";
      info.exactP = true;
      info.statisticWithDf = true;
      info.groups = (Array.isArray(r.group_means) ? r.group_means : [])
        .map((g: R) => ({ name: String(g.name), n: g.n_subcolumns })).filter((g: GroupN) => num(g.n));
      info.nUnit = "subcolumns";
      return withMc(info, r.multiple_comparisons);
    case "estimation":
      info.test = r.paired ? "paired estimation (bootstrap)" : "estimation statistics (bootstrap)";
      info.sided = "two-sided";
      info.exactP = true;
      info.repeated = !!r.paired;
      info.multiplicity = Array.isArray(r.comparisons) && r.comparisons.length > 1
        ? "uncorrected" : "single";
      info.groups = groupsOf(r.groups);
      info.nUnit = r.paired ? "pairs" : "values";
      info.assumptions = "no distributional assumption (bootstrap and permutation)";
      return info;
    case "column_statistics":
      info.groups = (Array.isArray(r.datasets) ? r.datasets : [])
        .map((d: R) => ({ name: String(d.name), n: d.descriptive?.n })).filter((g: GroupN) => num(g.n));
      info.nUnit = "values";
      if (r.datasets?.some((d: R) => d.one_sample_t)) {
        info.test = "one-sample t test and Wilcoxon signed rank test";
        info.sided = "two-sided";
        info.exactP = true;
        info.statisticWithDf = true;
        info.multiplicity = info.groups.length > 1 ? "uncorrected" : "single";
      }
      info.assumptions = r.datasets?.some((d: R) => d.normality && Object.keys(d.normality).length)
        ? "normality tests" : null;
      return info;
    case "dose_response":
      info.test = "nonlinear regression (least squares)";
      return info;
    default:
      return info;
  }
}
