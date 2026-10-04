// "Why your number may differ" notes: for each results sheet, the defaults
// that commonly differ between programs (tails, ties, exact vs approximate
// P, correction, quantile definition, CI method, relative vs absolute
// IC50, sums of squares and error term, sphericity correction), filled in
// with the settings this analysis actually used. Pure; unit-tested.
import { analysisKind, type ResultContext } from "./checks.ts";

export interface DifferItem {
  /** What the setting is ("Tails", "Ties", ...). */
  topic: string;
  /** What this analysis used. */
  used: string;
  /** What other tools commonly do instead. */
  elsewhere?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

const TWO_TAILED: DifferItem = { topic: "Tails", used: "Two-tailed P values.",
  elsewhere: "Some functions and old papers report one-tailed P (half the value)." };

const METHOD_NAME: Record<string, string> = {
  tukey: "Tukey (all pairs)", dunnett: "Dunnett (each vs the control)",
  bonferroni: "Bonferroni", sidak: "Šídák", holm_sidak: "Holm-Šídák",
  newman_keuls: "Newman-Keuls", fisher_lsd: "Fisher's LSD (no correction)", none: "none",
  games_howell: "Games-Howell", dunnett_t3: "Dunnett's T3", tamhane_t2: "Tamhane's T2",
  welch_uncorrected: "Welch t tests, no correction", fisher: "Fisher's LSD (no correction)",
};

function pMethod(r: R | null): string | null {
  const m = r?.p_method;
  return m === "exact" ? "exact" : m === "approximate" ? "normal approximation" : null;
}

export function differNotes(ctx: ResultContext): DifferItem[] {
  const r = ctx.result as R | null;
  const o = ctx.options as R;
  const kind = analysisKind(ctx);
  const items: DifferItem[] = [];
  const mcFamily = (method: string, family: string) => items.push({ topic: "Multiple comparisons",
    used: `${METHOD_NAME[method] ?? method}; ${family}. P values are multiplicity adjusted for that family.`,
    elsewhere: "Changing the family (all pairs vs vs-control vs selected pairs) changes every adjusted P; "
      + "pairwise t tests elsewhere are often uncorrected." });

  switch (kind) {
    case "column_statistics": {
      items.push({ topic: "Percentiles (quartiles, median CI)",
        used: o.percentileMethod === "prism"
          ? "Rank (n + 1)p (Hyndman & Fan definition 6), as GraphPad Prism computes them."
          : "Linear interpolation between order statistics (Hyndman & Fan definition 7).",
        elsewhere: "Definition 7 is the default in R (quantile type 7), NumPy and Excel "
          + "PERCENTILE.INC; Prism and Excel PERCENTILE.EXC use definition 6. Switch under "
          + "the analysis options to match." });
      items.push({ topic: "Normality tests",
        used: "Shapiro-Wilk, D'Agostino-Pearson (needs n ≥ 8) and Anderson-Darling as selected; "
          + "Kolmogorov-Smirnov uses the Lilliefors P.",
        elsewhere: "A plain Kolmogorov-Smirnov test against a normal with estimated mean and SD "
          + "gives much larger P values than the Lilliefors version." });
      if (String(o.hypothetical ?? "").trim()) {
        items.push(TWO_TAILED);
        items.push({ topic: "Wilcoxon signed-rank: values equal to the hypothetical",
          used: o.zeroMethod === "pratt" ? "Ranked, then ignored (Pratt)." : "Dropped before ranking (Wilcoxon).",
          elsewhere: "R's wilcox.test drops them; some programs use Pratt's method." });
      }
      break;
    }
    case "ttest:unpaired": case "ttest:welch": case "ttest:paired": case "ttest:ratio_paired":
      items.push(TWO_TAILED);
      items.push({ topic: "Equal SDs",
        used: kind === "ttest:welch" ? "Not assumed (Welch): Welch-Satterthwaite df, usually not a whole number."
          : kind === "ttest:unpaired" ? "Assumed (pooled SD), df = n1 + n2 − 2." : "Not applicable (paired).",
        elsewhere: "R's t.test uses Welch by default (var.equal = FALSE); Excel T.TEST type 2 is pooled, type 3 Welch." });
      if (kind === "ttest:ratio_paired") {
        items.push({ topic: "Ratio paired t test", used: "Paired t test on log10(B/A); the ratio and its CI are back-transformed (geometric mean).",
          elsewhere: "A paired t test on the raw values tests differences, not ratios." });
      }
      break;
    case "ttest:mann_whitney": case "ttest:wilcoxon":
      items.push(TWO_TAILED);
      items.push({ topic: "Exact or approximate P",
        used: `${pMethod(r) ?? "Exact when feasible"}${kind === "ttest:mann_whitney"
          ? " (exact, ties included, when the smaller group has up to 100 values)"
          : " (exact, ties included, with fewer than 200 pairs)"}.`,
        elsewhere: "R's wilcox.test switches to the normal approximation with a continuity "
          + "correction as soon as there are ties; SPSS reports the asymptotic P by default." });
      if (kind === "ttest:wilcoxon") {
        items.push({ topic: "Zero differences",
          used: o.zeroMethod === "pratt" ? "Ranked, then ignored (Pratt)." : "Dropped before ranking (Wilcoxon).",
          elsewhere: "SciPy's default drops them too; Pratt's method keeps them in the ranking." });
      }
      break;
    case "ttest:kolmogorov_smirnov":
      items.push(TWO_TAILED, { topic: "Exact or approximate P", used: pMethod(r) ?? "As reported in the results.",
        elsewhere: "Asymptotic P values from other programs differ with small samples." });
      break;
    case "anova":
      mcFamily(String(o.comparisons ?? "tukey"), o.comparisons === "dunnett"
        ? "each group vs the control" : "every pair");
      items.push({ topic: "Error term", used: "Comparisons use the pooled residual MS of the whole ANOVA.",
        elsewhere: "Separate t tests on each pair use only those two groups' SDs." });
      break;
    case "welch_anova":
      mcFamily(String(o.unequalComparisons ?? "games_howell"), o.unequalFamily === "control"
        ? "each group vs the control" : "every pair");
      items.push({ topic: "Overall test", used: "Welch's W and the Brown-Forsythe F* (SDs not assumed equal).",
        elsewhere: "R's oneway.test(var.equal = FALSE) gives Welch's W; aov() assumes equal SDs." });
      break;
    case "kruskal":
      items.push({ topic: "Ties", used: "Kruskal-Wallis H corrected for ties; chi-square approximation for P.",
        elsewhere: "Exact Kruskal-Wallis P values (some programs, small samples) differ." });
      items.push({ topic: "Dunn's test", used: o.dunnCorrected === false
        ? "Two-sided P values, not corrected for multiple comparisons."
        : "Two-sided P values multiplied by the number of comparisons (Bonferroni-style), every pair.",
      elsewhere: "R's dunn.test reports one-sided P by default (half the value) and no adjustment; "
          + "FSA::dunnTest uses Holm." });
      break;
    case "rm_anova":
      items.push({ topic: "Sphericity", used: "Geisser-Greenhouse corrected P reported (and the P assuming sphericity).",
        elsewhere: "R's aov() with an Error() term gives only the uncorrected P; SPSS shows several corrections." });
      items.push({ topic: "Missing values", used: "Rows with any missing value are dropped.",
        elsewhere: "Mixed-effects models keep incomplete subjects and give different results." });
      break;
    case "friedman":
      items.push({ topic: "Exact or approximate P",
        used: o.rmExact ? "Exact P when the design is small enough, else chi-square." : "Chi-square approximation.",
        elsewhere: "Small designs give noticeably different exact P values." });
      items.push({ topic: "Dunn's test", used: "Two-sided, multiplicity adjusted.",
        elsewhere: "Some packages compare rank sums with other post hoc tests (Nemenyi, Conover)." });
      break;
    case "two_way_anova": case "grouped_two_way": {
      const rm = kind === "grouped_two_way" && o.design && o.design !== "none";
      items.push({ topic: "Sums of squares",
        used: r?.type ? `Type ${String(r.type)}.` : "Type III (general linear model).",
        elsewhere: "R's aov()/anova() use sequential Type I sums of squares: with unequal n the "
          + "main-effect P values differ (car::Anova(type = 3) with sum-to-zero contrasts matches)." });
      const cmp = String((kind === "two_way_anova" ? o.twoWayComparisons : o.comparisons) ?? "none");
      if (cmp !== "none") {
        items.push({ topic: "Comparisons", used: `${METHOD_NAME[cmp] ?? cmp}; family = ${String(o.twoWayDirection
          ?? o.direction ?? "columns_within_rows").replace(/_/g, " ")}; pooled error term from the full model.`,
        elsewhere: "emmeans in R also uses the pooled error; separate t tests per row do not, and "
            + "a different family definition changes every adjusted P." });
      }
      if (rm) {
        items.push({ topic: "Sphericity", used: "Geisser-Greenhouse correction applied; mixed-effects model (REML) when values are missing.",
          elsewhere: "Uncorrected RM ANOVA, or a mixed model with another covariance structure or "
            + "df method (Kenward-Roger, Satterthwaite), gives different P values." });
      }
      break;
    }
    case "grouped_three_way":
      items.push({ topic: "Sums of squares", used: "Type III (general linear model).",
        elsewhere: "Sequential (Type I) sums of squares differ with unequal n." });
      break;
    case "grouped_multiple_t":
      items.push(TWO_TAILED, { topic: "Multiplicity", used: "As chosen in the options (Holm-Šídák or a false discovery rate).",
        elsewhere: "Uncorrected per-row t tests give smaller P values." });
      break;
    case "nested_ttest": case "nested_anova":
      items.push({ topic: "Model", used: "Mixed model with the subgroup as a random effect, fitted by REML; "
        + "df from the containment rule (subgroups − groups).",
      elsewhere: "lmerTest in R uses Satterthwaite df by default (Kenward-Roger optional); an ordinary "
          + "t test on all values ignores the nesting and gives a much smaller P." });
      break;
    case "nonlin": {
      const ci = String(o.ciMethod ?? "asymptotic");
      items.push({ topic: "Confidence interval of the IC50/EC50",
        used: ci === "profile" ? "Profile likelihood (asymmetric)."
          : "Asymptotic on log(IC50), back-transformed: asymmetric in concentration units.",
        elsewhere: "R's drc::ED(interval = \"delta\") gives a symmetric delta-method interval on the "
          + "IC50 scale; profile intervals differ from asymptotic ones when data are sparse." });
      items.push({ topic: "Which IC50", used: "Relative IC50/EC50: halfway between the fitted Top and Bottom.",
        elsewhere: "The absolute IC50 (50% of control) differs unless Top and Bottom equal the controls." });
      items.push({ topic: "Constraints and X",
        used: [o.top?.enabled ? `Top = ${o.top.value}` : "Top free",
          o.bottom?.enabled ? `Bottom = ${o.bottom.value}` : "Bottom free",
          o.hillSlope?.enabled ? `Hill slope = ${o.hillSlope.value}` : "Hill slope free",
          o.xIsLog ? "X entered as log10" : "X entered as concentration (log taken)",
          o.weighting && o.weighting !== "none" ? `weighting ${o.weighting}` : "no weighting",
          o.normalize?.enabled ? "normalised before fitting" : "not normalised"].join("; ") + ".",
        elsewhere: "Different constraints, weighting or normalisation change every parameter." });
      break;
    }
    case "contingency":
      items.push({ topic: "Chi-square", used: "Without Yates' correction (Yates' value shown separately for 2×2).",
        elsewhere: "R's chisq.test applies Yates' correction to 2×2 tables by default (larger P)." });
      items.push({ topic: "Fisher's exact test", used: "Two-sided P: sum of all tables as or less likely than the observed one.",
        elsewhere: "Doubling the one-sided P (some older programs) gives a different value." });
      break;
    case "survival":
      items.push({ topic: "Curve comparison", used: "Log-rank (Mantel-Cox) in two forms, Peto Σ(O−E)²/E and the variance form, plus Gehan-Breslow-Wilcoxon.",
        elsewhere: "R's survdiff(rho = 0) prints the variance form of the log-rank test; GraphPad Prism reports the Peto form. rho = 1 is the Peto-Peto variant, not Gehan." });
      items.push({ topic: "Hazard ratio", used: "Mantel-Haenszel method, HR = exp((O − E)/V).",
        elsewhere: "Cox regression (R's coxph) and the logrank O/E ratio give slightly different HRs." });
      items.push({ topic: "Confidence bands", used: "Greenwood variance with the log-log transformation.",
        elsewhere: "R's survfit defaults to the log transformation (conf.type = \"log\")." });
      break;
    case "correlation":
      items.push(TWO_TAILED, { topic: "CI of r", used: "Fisher z transformation.",
        elsewhere: "Bootstrap intervals differ; Spearman's P may be exact or approximate." });
      break;
    default:
      return [];
  }
  return items;
}
