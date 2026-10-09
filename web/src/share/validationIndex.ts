// "How this is validated" on a results sheet: which pinned cross-checks of
// the validation page (validation.json, compiled from engine/tests) are
// about the analysis on screen, and a sentence that counts them ("checked
// against statsmodels, R and 3 published tables"). The mapping reads the
// stored analysis id and, for the column analyses, the test chosen in its
// options; it matches the `analysis` field of each check. Pure:
// unit-tested in __tests__/validationIndex.test.ts.

export interface CheckLike { group: string; analysis: string }

export interface ValidationScope {
  /** What the checks are about, for the page's heading ("Dunnett's test"). */
  title: string;
  /** Matched against each check's `analysis` field. */
  pattern: RegExp;
}

const scope = (title: string, pattern: RegExp): ValidationScope => ({ title, pattern });

/** Checks of the one-way ANOVA machinery itself (its comparisons). */
const ONE_WAY = /\(one-way ANOVA\)/i;
const CORRELATION = /Spearman|correlation/i;

function columnScope(o: Record<string, unknown>): ValidationScope | null {
  switch (o.analysis) {
    case "ttest":
      switch (o.ttestKind) {
        case "paired": return scope("the paired t test", /^paired t test/i);
        case "ratio_paired": return scope("the ratio paired t test", /ratio paired t test/i);
        case "kolmogorov_smirnov":
          return scope("the two-sample Kolmogorov-Smirnov test", /two-sample Kolmogorov-Smirnov/i);
        case "mann_whitney": return scope("the Mann-Whitney test", /Mann-Whitney/i);
        case "wilcoxon": return scope("the Wilcoxon matched-pairs test", /Wilcoxon/i);
        default: return scope("the unpaired t test", /^(unpaired|two-sample|Welch) t tests?\b/i);
      }
    case "anova": {
      if (o.anovaKind === "nonparametric") return scope("the Kruskal-Wallis test and Dunn's test",
        /Kruskal-Wallis|Dunn's/i);
      if (o.anovaSd === "unequal") {
        return scope("Welch's ANOVA and its comparisons",
          /Welch ANOVA|Games-Howell|Studentized maximum modulus|Dunnett T3|Tamhane/i);
      }
      const c = String(o.comparisons ?? "tukey");
      if (c === "dunnett") return scope("one-way ANOVA with Dunnett's test", /^Dunnett/i);
      if (c === "tukey") return scope("one-way ANOVA with Tukey's test", /^Tukey/i);
      if (["bonferroni", "sidak", "holm_sidak", "holm"].includes(c)) {
        return scope("one-way ANOVA and multiplicity corrections",
          new RegExp(`${ONE_WAY.source}|^Multiplicity corrections`, "i"));
      }
      return scope("one-way ANOVA", ONE_WAY);
    }
    case "rm_anova": return scope("repeated-measures one-way ANOVA", /RM one-way|Friedman/i);
    case "two_way_anova": return scope("two-way ANOVA",
      /^two-way ANOVA|Compact letter display \(two-way/i);
    case "rm_two_way": return scope("repeated-measures two-way ANOVA",
      /two-way RM ANOVA|Mixed-effects two-way RM/i);
    case "correlation": return scope("correlation", CORRELATION);
    case "column_statistics": return scope("column statistics",
      /normality test|CI of the median|Geometric mean|one-sample/i);
    case "outliers": return scope("outlier tests", /Grubbs|ROUT/i);
    default: return null;
  }
}

/** The checks to show for an analysis, or null when no rule names it. */
export function validationScope(analysisId: string, options?: unknown): ValidationScope | null {
  const o = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
  switch (analysisId) {
    case "column": return columnScope(o);
    case "nonlin": case "compare_fits": case "assay_plate": case "assay_stdcurve":
    case "growth_curves":
      return scope("nonlinear regression", /^nonlinear regression|equation library/i);
    case "deming": return scope("Deming regression", /Deming/i);
    case "linear_regression": return scope("linear regression", /^(simple )?linear regression/i);
    case "mv_regression": return scope("multiple linear regression", /^multiple linear regression/i);
    case "mv_logistic": return scope("logistic regression", /logistic regression/i);
    case "mv_pca": return scope("principal component analysis", /principal component/i);
    case "mv_correlation": return scope("correlation", CORRELATION);
    case "survival": return scope("survival curves and the log-rank test",
      /survival|log-rank|Gehan/i);
    case "cox": case "mv_cox": return scope("Cox regression", /\bCox\b|proportional hazards/i);
    case "contingency": return scope("contingency tables",
      /^(?!.*goodness of fit)(?=.*(odds ratio|relative risk|proportion|2x2|chi-square|McNemar|Cochran-Mantel|Fisher|kappa))/i);
    case "chisq_goodness_of_fit": return scope("the chi-square goodness-of-fit test",
      /goodness of fit|binomial test/i);
    case "fraction_of_total": case "fraction_of_total_table":
      return scope("confidence intervals of proportions", /CI of a proportion|interval of a proportion|Wilson/i);
    case "nested_ttest": return scope("the nested t test", /^nested t test/i);
    case "nested_anova": return scope("nested one-way ANOVA", /^nested one-way ANOVA/i);
    case "grouped_two_way": return o.design === "rm_rows" || o.design === "rm_both"
      ? scope("repeated-measures two-way ANOVA", /two-way RM|Mixed-effects two-way/i)
      : scope("two-way ANOVA", /^two-way ANOVA|Compact letter display \(two-way/i);
    case "grouped_three_way": return scope("three-way ANOVA", /three-way ANOVA/i);
    case "grouped_multiple_t": case "volcano_table":
      return scope("multiple t tests and false discovery rates",
        /multiple t tests|false discovery|Multiplicity corrections|BKY/i);
    case "transform": case "transform_concentrations":
      return scope("transforms and formulas", /transform|Formula/i);
    default: return null;
  }
}

export function checksIn<T extends CheckLike>(checks: T[], s: ValidationScope | null): T[] {
  return s ? checks.filter((c) => s.pattern.test(c.analysis)) : [];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Checked against statsmodels, R and 3 published tables (7 pinned
 *  checks)." Cases are counted as the distinct analyses of a group. */
export function validationSentence(checks: CheckLike[]): string {
  if (!checks.length) return "";
  const cases = (g: string) => new Set(checks.filter((c) => c.group === g)
    .map((c) => c.analysis)).size;
  const parts: string[] = [];
  const add = (g: string, text: (n: number) => string) => {
    const n = cases(g);
    if (n) parts.push(text(n));
  };
  add("Prism screenshot", () => "GraphPad Prism results for the same data");
  add("NIST StRD", () => "NIST certified values");
  add("R", () => "R");
  add("statsmodels", () => "statsmodels");
  add("pingouin", () => "pingouin");
  add("SciPy", () => "SciPy");
  add("Statistics guide example", (n) => `${plural(n, "worked example")} from the GraphPad guides`);
  add("Published table", (n) => plural(n, "published table"));
  add("Published example", (n) => plural(n, "published example"));
  add("Other", (n) => plural(n, "other reference"));
  const list = parts.length <= 1 ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Checked against ${list} (${plural(checks.length, "pinned check")}).`;
}
