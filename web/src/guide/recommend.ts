// "Which test?" recommender: plain-language design answers plus the data
// checks that could be run on the current table -> one recommended test
// with its reason, the alternatives and when they apply, the post hoc
// family for the question, and the analysis to open (table type, analysis
// id, options). Pure (no React, no engine): unit-tested in __tests__.
//
// The rules follow the GraphPad Prism statistics guide's "choosing a test"
// pages and standard practice (sources in ./sources.ts):
//  - two independent groups: Welch's t test unless the SDs are known to be
//    equal; ordinary t only when the user says the SDs are equal;
//  - nonparametric only when the answers or the data justify it and n is
//    large enough for a rank test to reach significance;
//  - technical replicates or cells within animals: nested t / nested ANOVA
//    (or average to the biological unit first);
//  - paired data whose effect is a consistent ratio (lognormal): ratio
//    paired t test; data normalised to a control of 1 (or 100): one-sample
//    t test on the logs (ratio t test against 1), never a two-sample test
//    against a control column whose SD is 0;
//  - repeated measures: RM ANOVA with the Geisser-Greenhouse correction, a
//    mixed-effects model when values are missing.
import { SRC, type Source } from "./sources.ts";

export type Outcome = "continuous" | "counts" | "survival" | "curve";
export type GroupCount = "one" | "two" | "three_plus";
export type Factors = "one" | "two" | "three";
/** Two factors: which of them is measured repeatedly on the same subjects. */
export type RepeatedFactor = "none" | "one" | "both";
export type Replicates = "independent" | "technical" | "cells";
export type Distribution = "unsure" | "normal" | "lognormal" | "not_normal";
export type EqualSD = "unsure" | "equal" | "unequal";
export type Question = "all" | "control" | "selected";
export type Direction = "either" | "predicted";
export type SampleSize = "unknown" | "tiny" | "small" | "medium" | "large";
export type CurveGoal = "ic50" | "standard" | "compare" | "other";

export interface Design {
  outcome: Outcome;
  groups: GroupCount;
  factors: Factors;
  /** Measurements paired, matched or repeated on the same subjects. */
  paired: boolean;
  repeated: RepeatedFactor;
  replicates: Replicates;
  distribution: Distribution;
  equalSD: EqualSD;
  question: Question;
  direction: Direction;
  /** Values per group as the user describes it (overridden by the data). */
  sampleSize: SampleSize;
  /** Paired data: the treatment multiplies rather than adds. */
  ratioEffect: boolean;
  /** Values are expressed relative to a control set to 1 (or 100). */
  normalised: boolean;
  /** Counts: two outcome categories (else more). */
  twoOutcomes: boolean;
  /** Counts / survival: groups have a natural order (doses, ages). */
  ordered: boolean;
  /** Counts: 2x2 tables from several strata (sites, experiments). */
  stratified: boolean;
  curveGoal: CurveGoal;
  agonist: boolean;
  /** One group: the value to compare against. */
  hypothetical: string;
}

export const DEFAULT_DESIGN: Design = {
  outcome: "continuous", groups: "two", factors: "one", paired: false,
  repeated: "none", replicates: "independent", distribution: "unsure",
  equalSD: "unsure", question: "all", direction: "either", sampleSize: "unknown",
  ratioEffect: false, normalised: false, twoOutcomes: true, ordered: false,
  stratified: false, curveGoal: "ic50", agonist: false, hypothetical: "0",
};

/** One group of the current table, as the data checks see it. */
export interface GroupCheck {
  name: string;
  n: number;
  mean: number | null;
  sd: number | null;
  /** Shapiro-Wilk P from the engine (null: not computed / n too small). */
  normalityP: number | null;
  allPositive: boolean;
}

export interface DataChecks {
  tableType: string;
  groups: GroupCheck[];
  /** Blank cells inside rows that hold other values. */
  missing: boolean;
}

export interface DerivedChecks {
  minN: number | null;
  maxN: number | null;
  unequalN: boolean;
  sdRatio: number | null;
  zeroVariance: string[];
  normalisedControl: string | null;
  nonNormal: string[];
  skewedPositive: boolean;
}

export function deriveChecks(c: DataChecks | null): DerivedChecks | null {
  if (!c || !c.groups.length) return null;
  const used = c.groups.filter((g) => g.n > 0);
  if (!used.length) return null;
  const ns = used.map((g) => g.n);
  const sds = used.map((g) => g.sd).filter((s): s is number => s !== null && s > 0);
  const zero = used.filter((g) => g.n >= 2 && g.sd === 0);
  const ctrl = zero.find((g) => g.mean !== null
    && (Math.abs(g.mean - 1) < 1e-9 || Math.abs(g.mean - 100) < 1e-9));
  const nonNormal = used.filter((g) => g.normalityP !== null && g.normalityP < 0.05);
  return {
    minN: Math.min(...ns),
    maxN: Math.max(...ns),
    unequalN: new Set(ns).size > 1,
    sdRatio: sds.length >= 2 ? Math.max(...sds) / Math.min(...sds) : null,
    zeroVariance: zero.map((g) => g.name),
    normalisedControl: ctrl ? ctrl.name : null,
    nonNormal: nonNormal.map((g) => g.name),
    skewedPositive: nonNormal.length > 0 && nonNormal.every((g) => g.allPositive),
  };
}

/** Where the recommended analysis lives and how it is set up. */
export interface Target {
  tableType: string;
  analysisId: string;
  /** Patched over the analysis' default options. */
  options: Record<string, unknown>;
  /** What the table should look like, for a new table of this type. */
  layout: string;
}

export interface Alternative { test: string; when: string }

export interface PostHoc {
  family: "all pairs" | "vs control" | "selected pairs";
  method: string;
  why: string;
  /** What the analysis OpenDose opens does, when it differs from the
   *  ideal family (e.g. it corrects for every pair). */
  inOpenDose?: string;
}

export interface Recommendation {
  /** Stable rule id (tests and analytics-free logging). */
  rule: string;
  test: string;
  reason: string;
  target: Target | null;
  alternatives: Alternative[];
  postHoc: PostHoc | null;
  tails: string;
  /** Observations from the data checks, worded as advice. */
  notes: string[];
  sources: Source[];
  /** Explainer ids (./explainers.ts) worth reading next. */
  explainers: string[];
}

const COLUMN = "column";
const A_COLUMN = "column";

/** Sample size bucket: the data win over the answer. */
export function sizeOf(d: Design, k: DerivedChecks | null): SampleSize {
  const n = k?.minN;
  if (n == null) return d.sampleSize;
  if (n <= 3) return "tiny";
  if (n <= 7) return "small";
  if (n < 30) return "medium";
  return "large";
}

/** Is a rank test justified? Only when the user judges the variable not
 *  Gaussian (ordinal scores, off-scale values, clearly skewed) and n is
 *  large enough for ranks to reach P < 0.05. A failed normality test is
 *  reported as advice but never switches the test by itself (GraphPad:
 *  "Don't automate the decision to use a nonparametric test"). */
function rankTest(d: Design, k: DerivedChecks | null, size: SampleSize):
  { use: boolean; note: string | null } {
  if (d.distribution === "not_normal") {
    if (size === "tiny") {
      return { use: false, note: "With 3 or fewer values per group a rank test cannot "
        + "reach P < 0.05 (Mann-Whitney with 3 vs 3: smallest two-tailed P = 0.10), "
        + "so the parametric test is kept; if the data are skewed, analyse log(values)." };
    }
    return { use: true, note: null };
  }
  if (!k || !k.nonNormal.length || d.distribution !== "unsure") return { use: false, note: null };
  const groups = k.nonNormal.join(", ");
  if (size === "tiny" || size === "small") {
    return { use: false, note: `The normality test failed for ${groups}, but with fewer than `
      + "a dozen values a normality test says little either way, and rank tests have little "
      + "power at this size: decide from what you know about the variable (skewed, "
      + "bounded, ordinal?) rather than from this test." };
  }
  if (size === "large") {
    return { use: false, note: `The normality test failed for ${groups}; with 30 or more `
      + "values per group the parametric test is robust to moderate departures, and "
      + "normality tests flag even trivial ones." };
  }
  if (k.skewedPositive) {
    return { use: false, note: `The normality test failed for ${groups} and every value is `
      + "positive: if the data are skewed to the right they may be lognormal; analysing "
      + "log(values) with the parametric test usually beats switching to ranks. If you "
      + "judge the variable not Gaussian, answer \"Not Gaussian\" to get the rank test." };
  }
  return { use: false, note: `The normality test failed for ${groups} (Shapiro-Wilk P < 0.05). `
    + "This is a reason to look at the data, not an automatic switch: if the variable is "
    + "ordinal or clearly non-Gaussian, answer \"Not Gaussian\" to get the rank-based test." };
}

function tails(d: Design): string {
  return d.direction === "predicted"
    ? "Two-tailed P is still recommended. A one-tailed P is only legitimate when the "
      + "direction was decided before the data were collected and a difference in the "
      + "other direction would be treated exactly like no difference."
    : "Two-tailed P (the default here and in most journals).";
}

function postHocFor(d: Design, kind: "ordinary" | "welch" | "rank" | "twoway" | "nested" | "rm",
  minN: number | null = null): PostHoc {
  const fam = d.question === "all" ? "all pairs" : d.question === "control" ? "vs control"
    : "selected pairs";
  if (kind === "rank") {
    return { family: fam, method: "Dunn's test",
      why: "Dunn's test compares mean ranks after Kruskal-Wallis or Friedman and reports "
        + "multiplicity-adjusted P values; it works for every pair or for a subset.",
      ...(d.question !== "all" ? { inOpenDose: "OpenDose's Dunn's test corrects for every "
        + "pair, which is conservative when you only need some of them." } : {}) };
  }
  if (kind === "rm" && d.question !== "selected") {
    return { family: fam, method: d.question === "all" ? "Tukey" : "Dunnett",
      why: d.question === "all" ? "Tukey's test compares every condition with every other."
        : "Dunnett's test compares each condition with the control condition.",
      inOpenDose: "OpenDose's repeated-measures one-way ANOVA reports the overall test only; "
        + "for pairwise comparisons that keep the matching, run paired t tests on the pairs "
        + "you need and correct for their number (Šídák)." };
  }
  if (d.question === "all") {
    if (kind === "welch") {
      const big = (minN ?? 0) >= 50;
      return { family: fam, method: big ? "Games-Howell" : "Dunnett's T3",
        why: "Without assuming equal SDs: Games-Howell for large samples, Dunnett's T3 when "
          + "groups have fewer than 50 values (GraphPad's advice)." };
    }
    return { family: fam, method: "Tukey",
      why: "Tukey's test is designed for comparing every mean with every other mean and "
        + "keeps the familywise error rate at 5% for that whole family." };
  }
  if (d.question === "control") {
    if (kind === "twoway") {
      return { family: fam, method: "Šídák (planned comparisons with the control)",
        why: "Comparing each group with the control within each row is a smaller family "
          + "than all pairs; Šídák's correction for just those comparisons has more power "
          + "than Tukey's for all pairs." };
    }
    if (kind === "welch") {
      return { family: fam, method: "Dunnett's T3 (vs control)",
        why: "With unequal SDs, Dunnett's T3 restricted to the comparisons with the control." };
    }
    return { family: fam, method: "Dunnett",
      why: "Dunnett's test compares every group with one control and has more power than "
        + "Tukey's because the family is smaller." };
  }
  return { family: fam, method: "Šídák (Bonferroni-Šídák)",
    why: "When you planned a few specific comparisons, correct for exactly those: Šídák's "
      + "method is slightly more powerful than Bonferroni's. Choose the pairs before looking "
      + "at the data.",
    inOpenDose: kind === "welch"
      ? "OpenDose opens Dunnett's T3 over every pair; for a few planned pairs, the Šídák "
        + "correction for just those pairs is less conservative."
      : kind === "rm"
        ? "OpenDose's repeated-measures one-way ANOVA reports the overall test only; for "
          + "pairwise comparisons, run paired t tests on the planned pairs and correct for "
          + "their number."
        : "OpenDose applies Šídák's correction to every pair in the results; if you planned "
          + "fewer comparisons, the correct adjustment for your family is smaller than the "
          + "one shown." };
}

function src(...keys: (keyof typeof SRC)[]): Source[] {
  return keys.map((k) => SRC[k]);
}

const LAYOUT = {
  column: "Column table: one column per group, values down the rows.",
  columnPaired: "Column table: one column per condition, one row per subject (or matched pair).",
  nested: "Nested table: one column per group, one subcolumn per biological unit (animal, "
    + "culture, experiment), its technical replicates or cells down the rows.",
  grouped: "Grouped table: rows = levels of one factor, columns = levels of the other, "
    + "replicates side by side in subcolumns.",
  groupedRm: "Grouped table: rows = the repeated factor (e.g. time), columns = groups, one "
    + "subcolumn per subject.",
  contingency: "Contingency table: rows = groups, columns = outcomes, each cell a count of "
    + "subjects (not percentages).",
  pow: "Parts-of-whole table: one row per category with its observed count.",
  survival: "Survival table: one row per subject with the time followed and 1 = event, "
    + "0 = censored, one data set per group.",
  xy: "XY table: concentration (or log concentration) in X, responses in Y, replicates side "
    + "by side.",
};

/** The recommendation for a design, refined by the data checks. */
export function recommend(d: Design, checks: DataChecks | null = null): Recommendation {
  const k = deriveChecks(checks);
  const notes: string[] = [];
  if (k) {
    if (k.minN !== null && k.minN < 3) {
      notes.push(`A group has n = ${k.minN}: with fewer than 3 values per group no test can `
        + "say much; report the values themselves.");
    }
    if (k.zeroVariance.length && !k.normalisedControl) {
      notes.push(`${k.zeroVariance.join(", ")} has SD 0 (all values identical): check for `
        + "pasted constants or values normalised to themselves.");
    }
    if (k.unequalN && d.outcome === "continuous") {
      notes.push("Group sizes differ: tests still work, but unequal SDs matter more when n "
        + "differs, which is one more reason to prefer Welch-type methods.");
    }
    if (k.sdRatio !== null && k.sdRatio >= 2 && d.outcome === "continuous"
      && d.equalSD !== "unequal") {
      notes.push(`The largest SD is ${k.sdRatio.toFixed(1)}× the smallest: the SDs may well `
        + "differ (a ratio of 2 or more is a common rule of thumb, but SDs from small samples "
        + "vary a lot).");
    }
  }
  const normalised = d.normalised || !!k?.normalisedControl;
  if (k?.normalisedControl && !d.normalised) {
    notes.push(`${k.normalisedControl} has every value equal to ${checks!.groups.find(
      (g) => g.name === k.normalisedControl)?.mean === 100 ? "100" : "1"} (SD 0): the data look `
      + "normalised to that control, so the recommendation treats them as ratios.");
  }
  const size = sizeOf(d, k);
  const base = { notes, tails: tails(d) };

  if (d.outcome === "counts") return counts(d, base);
  if (d.outcome === "survival") return survival(d, base);
  if (d.outcome === "curve") return curve(d, base);

  // ---------------------------------------------------------- continuous
  const rank = rankTest(d, k, size);
  if (rank.note) notes.push(rank.note);
  const nested = d.replicates !== "independent";
  const unit = d.replicates === "cells" ? "cells" : "technical replicates";

  if (d.factors === "three") {
    return { ...base, rule: "three_way", test: "Three-way ANOVA",
      reason: "Three factors at once (for example genotype × treatment × sex) need a "
        + "three-way ANOVA, which tests each factor, each two-way interaction and the "
        + "three-way interaction. OpenDose runs it on a Grouped table with 2 × 2 × k levels.",
      target: { tableType: "grouped", analysisId: "grouped_three_way", options: {},
        layout: "Grouped table: rows = levels of factor A, four columns = the 2 × 2 "
          + "combinations of factors B and C." },
      alternatives: [{ test: "Two-way ANOVA on a subset",
        when: "when one factor is only a nuisance (e.g. experiment day) or has a single "
          + "level of interest" }],
      postHoc: postHocFor(d, "ordinary"), sources: src("gpThreeWay", "gpChooseTest"),
      explainers: ["posthoc", "exact-adjusted"] };
  }

  if (d.factors === "two") {
    const rm = d.repeated !== "none" || d.paired;
    const design = d.repeated === "both" ? "rm_both" : rm ? "rm_rows" : "none";
    const cmp = d.question === "all" ? "tukey" : "sidak";
    const target: Target = { tableType: "grouped", analysisId: "grouped_two_way",
      options: { design, comparisons: cmp, direction: "columns_within_rows" },
      layout: rm ? LAYOUT.groupedRm : LAYOUT.grouped };
    if (nested) {
      notes.push(`Average the ${unit} within each biological unit first and enter one value `
        + "per animal, culture or experiment as the replicates: the ANOVA's n must be the "
        + "number of independent units.");
    }
    if (d.distribution === "not_normal") {
      notes.push("There is no standard nonparametric two-way ANOVA. If the data are skewed "
        + "and positive, analyse log(values); otherwise two-way ANOVA is reasonably robust "
        + "with balanced groups.");
    }
    const alts: Alternative[] = [
      { test: rm ? "Two-way ANOVA without repeated measures"
        : "Two-way repeated-measures ANOVA / mixed model",
      when: rm ? "if every value comes from a different subject"
        : "if the same subjects are measured at every level of a factor" },
      { test: "Multiple t tests (one per row)",
        when: "only when the rows are separate experiments you are not comparing; correct "
          + "for multiple comparisons (Holm-Šídák or FDR)" },
    ];
    if (d.distribution === "lognormal") {
      notes.push("Lognormal data: transform Y = log(Y) (Analyze › Transform) and run the ANOVA "
        + "on the logs; differences of logs are ratios.");
    }
    return { ...base,
      rule: rm ? (checks?.missing ? "two_way_mixed" : "two_way_rm") : "two_way",
      test: rm ? (checks?.missing ? "Two-way repeated-measures analysis (mixed-effects model)"
        : "Two-way repeated-measures ANOVA") : "Two-way ANOVA",
      reason: rm
        ? "Two factors with the same subjects measured repeatedly: the repeated-measures "
          + "ANOVA separates subject-to-subject variation from the effects, which gives more "
          + "power than treating every value as independent. OpenDose reports the Geisser-"
          + "Greenhouse correction, so sphericity is not assumed, and switches to a mixed-"
          + "effects model automatically when values are missing."
        : "Two grouping factors (for example genotype and treatment) with independent "
          + "values: two-way ANOVA tests each factor and their interaction, i.e. whether "
          + "the effect of one factor depends on the level of the other.",
      target, alternatives: alts, postHoc: postHocFor(d, "twoway"),
      sources: src("gpTwoWay", "gpTwoWayMc", ...(rm ? ["gpSphericity", "gpMixed"] as const : [])),
      explainers: rm ? ["sphericity", "posthoc", "exact-adjusted"] : ["posthoc", "exact-adjusted"] };
  }

  // one factor
  if (d.groups === "one") {
    const hyp = normalised ? "1" : d.hypothetical.trim() || "0";
    const ratio = normalised || d.distribution === "lognormal";
    const ctrl = normalised && k?.normalisedControl
      ? checks!.groups.find((g) => g.name === k.normalisedControl)?.mean : null;
    const hv = ratio && ctrl === 100 ? "100" : hyp;
    if (nested) {
      notes.push(`Average the ${unit} within each biological unit first: n is the number of `
        + "animals, cultures or experiments, not the number of measurements.");
    }
    if (ratio) {
      return { ...base, rule: "one_sample_log",
        test: `One-sample t test on the logs (ratio t test against ${hv})`,
        reason: `Values expressed relative to a control (fold change, % of control) are `
          + "ratios: they are bounded below by zero and usually skewed. Testing log(value) "
          + `against log(${hv}) asks whether the geometric mean ratio differs from ${hv}, and `
          + "the logs are much closer to Gaussian than the ratios themselves.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "column_statistics", hypothetical: hv, ratioT: true },
          layout: LAYOUT.column },
        alternatives: [
          { test: `One-sample t test against ${hv}`, when: "if the values are differences "
            + "rather than ratios and roughly Gaussian" },
          { test: "Wilcoxon signed-rank test", when: "for ordinal scores or clearly "
            + "non-Gaussian data with n of 6 or more" },
          { test: "Ratio paired t test on the raw values", when: "if you still have the "
            + "un-normalised control and treated values: it keeps the control's variability" },
        ],
        postHoc: null, sources: src("gpRatioT", "gpNormalizeFaq", "gpOneSample"),
        explainers: ["normalised-control", "sd-sem-ci", "tails"] };
    }
    if (rank.use) {
      return { ...base, rule: "wilcoxon_signed_rank", test: "Wilcoxon signed-rank test",
        reason: `The values do not look Gaussian, so the median is compared with ${hv} using `
          + "ranks of the differences rather than the mean.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "column_statistics", hypothetical: hv }, layout: LAYOUT.column },
        alternatives: [{ test: `One-sample t test against ${hv}`,
          when: "if the values are roughly Gaussian (the results show both)" }],
        postHoc: null, sources: src("gpNonparametric", "gpOneSample"),
        explainers: ["tails"] };
    }
    return { ...base, rule: "one_sample_t", test: `One-sample t test against ${hv}`,
      reason: `One group compared with a theoretical value (${hv}): the one-sample t test `
        + "asks whether the mean differs from it, with a confidence interval of the "
        + "difference.",
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: "column_statistics", hypothetical: hv }, layout: LAYOUT.column },
      alternatives: [
        { test: "Wilcoxon signed-rank test", when: "for clearly non-Gaussian data or ordinal "
          + "scores with n of 6 or more" },
        { test: "One-sample t test on the logs", when: "if the values are ratios or skewed "
          + "positive values" },
      ],
      postHoc: null, sources: src("gpOneSample", "gpChooseTest"), explainers: ["tails", "sd-sem-ci"] };
  }

  if (nested && !d.paired) {
    const two = d.groups === "two";
    return { ...base, rule: two ? "nested_t" : "nested_anova",
      test: two ? "Nested t test" : "Nested one-way ANOVA",
      reason: `You have ${unit} within each biological unit. Treating every ${
        d.replicates === "cells" ? "cell" : "measurement"} as independent inflates n and gives `
        + "falsely small P values. A nested analysis (a mixed model with the unit as a random "
        + "effect) uses the variation between units as the error, so n is effectively the "
        + "number of animals, cultures or experiments.",
      target: { tableType: "nested", analysisId: two ? "nested_ttest" : "nested_anova",
        options: two ? {} : { comparisons: d.question === "control" ? "dunnett"
          : d.question === "selected" ? "sidak" : "tukey" }, layout: LAYOUT.nested },
      alternatives: [
        { test: two ? "Welch's t test on the unit means" : "One-way ANOVA on the unit means",
          when: "equivalent when every unit has the same number of replicates: average each "
            + "unit, then test the means (a SuperPlot shows both levels)" },
      ],
      postHoc: two ? null : postHocFor(d, "nested"),
      sources: src("gpNested", "lord2020"), explainers: ["replicates", "superplots"] };
  }

  if (d.groups === "two") {
    if (d.paired) {
      if (nested) {
        notes.push(`Average the ${unit} within each subject first, then pair the subject means.`);
      }
      if (normalised) {
        return { ...base, rule: "paired_normalised", test: "One-sample t test on the logs "
          + "(ratio t test against 1) of the normalised values",
        reason: "Each treated value was divided by its own control, so the control column "
          + "is all 1 (or 100) with SD 0. A paired or unpaired t test against that column "
          + "pretends the control was measured without error. Test whether the log of the "
          + "treated/control ratios differs from 0 (ratio = 1) instead.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "column_statistics", hypothetical:
            k?.normalisedControl && checks!.groups.find((g) => g.name === k.normalisedControl)
              ?.mean === 100 ? "100" : "1", ratioT: true },
          layout: LAYOUT.column },
        alternatives: [{ test: "Ratio paired t test on the raw values",
          when: "if you have the un-normalised control and treated values" }],
        postHoc: null, sources: src("gpRatioT", "gpNormalizeFaq"),
        explainers: ["normalised-control"] };
      }
      if (d.ratioEffect || d.distribution === "lognormal") {
        return { ...base, rule: "ratio_paired_t", test: "Ratio paired t test",
          reason: "The treatment changes values by a consistent factor (e.g. doubles them) "
            + "rather than by a consistent amount, so the paired ratios are the effect. The "
            + "ratio paired t test analyses log(treated/control) and reports the geometric "
            + "mean ratio with its confidence interval.",
          target: { tableType: COLUMN, analysisId: A_COLUMN,
            options: { analysis: "ttest", ttestKind: "ratio_paired" }, layout: LAYOUT.columnPaired },
          alternatives: [{ test: "Paired t test", when: "if the differences, not the ratios, "
            + "are consistent across pairs" },
          { test: "Wilcoxon matched-pairs signed-rank test", when: "for ordinal or clearly "
            + "non-Gaussian differences with 6 or more pairs" }],
          postHoc: null, sources: src("gpRatioPaired", "gpChooseT"), explainers: ["tails"] };
      }
      if (rank.use) {
        return { ...base, rule: "wilcoxon_pairs", test: "Wilcoxon matched-pairs signed-rank test",
          reason: "Paired measurements whose differences are not Gaussian: the Wilcoxon test "
            + "ranks the paired differences and compares their median with zero.",
          target: { tableType: COLUMN, analysisId: A_COLUMN,
            options: { analysis: "ttest", ttestKind: "wilcoxon" }, layout: LAYOUT.columnPaired },
          alternatives: [{ test: "Paired t test", when: "if the differences are roughly Gaussian" },
            { test: "Ratio paired t test", when: "if the effect is a consistent ratio" }],
          postHoc: null, sources: src("gpNonparametric", "gpChooseT"), explainers: ["tails"] };
      }
      return { ...base, rule: "paired_t", test: "Paired t test",
        reason: "The two measurements come in pairs (before/after, left/right, the same "
          + "experiment). The paired t test analyses the difference within each pair, which "
          + "removes the variation between pairs and gives more power than an unpaired test.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "ttest", ttestKind: "paired" }, layout: LAYOUT.columnPaired },
        alternatives: [
          { test: "Ratio paired t test", when: "if the treatment multiplies values (consistent "
            + "fold change), which is common with concentrations and enzyme activities" },
          { test: "Wilcoxon matched-pairs signed-rank test", when: "for ordinal or clearly "
            + "non-Gaussian differences with 6 or more pairs" },
        ],
        postHoc: null, sources: src("gpChooseT", "gpPairedT"), explainers: ["tails", "sd-sem-ci"] };
    }
    if (normalised) {
      return { ...base, rule: "unpaired_normalised",
        test: "One-sample t test on the logs (ratio t test against 1) of the treated group",
        reason: "The control group was set to 1 (or 100) so it has no variability left; an "
          + "unpaired t test against it is not valid. Test whether the treated values, as "
          + "log ratios, differ from 0 (ratio 1). Better still, analyse the raw values.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "column_statistics", hypothetical:
            k?.normalisedControl && checks!.groups.find((g) => g.name === k.normalisedControl)
              ?.mean === 100 ? "100" : "1", ratioT: true },
          layout: LAYOUT.column },
        alternatives: [{ test: "Welch's t test on the raw values",
          when: "if you have the un-normalised measurements" }],
        postHoc: null, sources: src("gpRatioT", "gpNormalizeFaq"), explainers: ["normalised-control"] };
    }
    if (d.distribution === "lognormal") {
      notes.push("Lognormal data: transform Y = log(Y) (Analyze › Transform) and run this test "
        + "on the logs; the difference of logs is the ratio of geometric means.");
    }
    if (rank.use) {
      return { ...base, rule: "mann_whitney", test: "Mann-Whitney test",
        reason: "Two independent groups whose values are not Gaussian (by your answer or the "
          + "normality test at a sample size where it means something): the Mann-Whitney "
          + "test compares the distributions by ranks.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "ttest", ttestKind: "mann_whitney" }, layout: LAYOUT.column },
        alternatives: [
          { test: "Welch's t test", when: "if the data are roughly Gaussian, or skewed but "
            + "Gaussian after a log transform" },
          { test: "Kolmogorov-Smirnov test", when: "if any difference in distribution shape "
            + "matters, not only location" },
        ],
        postHoc: null, sources: src("gpNonparametric", "gpNormalityChoice", "gpChooseT"), explainers: ["tails"] };
    }
    if (d.equalSD === "equal") {
      return { ...base, rule: "unpaired_t", test: "Unpaired t test",
        reason: "Two independent groups, Gaussian enough, and you know from the design or "
          + "earlier data that the SDs are equal: the ordinary (pooled-variance) unpaired t "
          + "test has slightly more power than Welch's when that holds.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "ttest", ttestKind: "unpaired" }, layout: LAYOUT.column },
        alternatives: [{ test: "Welch's t test", when: "whenever you are not sure the SDs are "
          + "equal; it loses almost nothing when they are" },
        { test: "Mann-Whitney test", when: "for ordinal or clearly non-Gaussian data with 4 "
          + "or more per group" }],
        postHoc: null, sources: src("gpChooseT", "gpWelch"), explainers: ["tails", "sd-sem-ci"] };
    }
    return { ...base, rule: "welch_t", test: "Unpaired t test with Welch's correction",
      reason: "Two independent groups. Welch's t test does not assume the two populations "
        + "have equal SDs, loses very little power when they do, and keeps the P value "
        + "honest when they do not (especially with unequal n), so it is the safer default "
        + "unless you know the SDs are equal.",
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: "ttest", ttestKind: "welch" }, layout: LAYOUT.column },
      alternatives: [
        { test: "Unpaired t test (pooled SD)", when: "if the design guarantees equal SDs" },
        { test: "Mann-Whitney test", when: "for ordinal or clearly non-Gaussian data with 4 "
          + "or more per group" },
        { test: "Paired t test", when: "if each value in one group is matched with one in "
          + "the other (same subject, same experiment)" },
      ],
      postHoc: null, sources: src("gpWelch", "gpWelchQa", "gpChooseT"), explainers: ["tails", "sd-sem-ci"] };
  }

  // three or more groups, one factor
  if (d.paired) {
    if (nested) {
      notes.push(`Average the ${unit} within each subject first; the subject means are the `
        + "repeated measurements.");
    }
    if (normalised) {
      notes.push("The control column is normalised (SD 0): leave it out of the ANOVA and test "
        + "each treated column's log ratio against 0, correcting for the number of tests, or "
        + "analyse the raw values with experiment as the matching factor.");
    }
    if (rank.use) {
      return { ...base, rule: "friedman", test: "Friedman test",
        reason: "The same subjects (or matched sets) were measured under every condition and "
          + "the values are not Gaussian: the Friedman test ranks the values within each "
          + "subject.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "rm_anova", rmKind: "nonparametric" }, layout: LAYOUT.columnPaired },
        alternatives: [{ test: "Repeated-measures one-way ANOVA", when: "if the values are "
          + "roughly Gaussian" }],
        postHoc: postHocFor(d, "rank"), sources: src("gpNonparametric", "gpRmAnova"),
        explainers: ["posthoc", "exact-adjusted"] };
    }
    return { ...base, rule: checks?.missing ? "rm_one_way_missing" : "rm_one_way",
      test: "Repeated-measures one-way ANOVA",
      reason: "The same subjects (or matched sets, such as one experiment run on every "
        + "condition) were measured under every condition. Repeated-measures ANOVA removes "
        + "the subject-to-subject variation; OpenDose reports the Geisser-Greenhouse "
        + "corrected P, so sphericity is not assumed."
        + (checks?.missing ? " Some values are missing: RM ANOVA uses complete rows only, "
          + "so subjects with a missing value are left out; a mixed-effects model keeps them "
          + "(OpenDose fits one for two-factor repeated-measures designs)." : ""),
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: "rm_anova", rmKind: "parametric" }, layout: LAYOUT.columnPaired },
      alternatives: [
        { test: "Friedman test", when: "for ordinal or clearly non-Gaussian data" },
        { test: "Mixed-effects model", when: "when some subjects miss a measurement" },
      ],
      postHoc: postHocFor(d, "rm"), sources: src("gpRmAnova", "gpSphericity", "gpMixed"),
      explainers: ["sphericity", "posthoc"] };
  }
  if (normalised) {
    notes.push("A control normalised to 1 (or 100) has SD 0 and must not enter the ANOVA as "
      + "if it were measured: test each treated group's log ratio against 0 (ratio t test vs 1) "
      + "with a correction for the number of groups, or analyse the raw values.");
    return { ...base, rule: "multi_normalised",
      test: "One-sample t tests on the logs (ratio t test vs 1), one per treated group",
      reason: "Every value was divided by the control, so the control column carries no "
        + "variability. One-way ANOVA would treat it as a measured group. Testing each treated "
        + "group's log ratio against 0, with Šídák's correction for the number of groups, "
        + "asks the question you have.",
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: "column_statistics", hypothetical:
          k?.normalisedControl && checks!.groups.find((g) => g.name === k.normalisedControl)
            ?.mean === 100 ? "100" : "1", ratioT: true },
        layout: LAYOUT.column },
      alternatives: [{ test: "Repeated-measures one-way ANOVA on the raw values",
        when: "if each experiment contributed one control and one value per treatment" }],
      postHoc: null, sources: src("gpRatioT", "gpNormalizeFaq"), explainers: ["normalised-control"] };
  }
  if (rank.use) {
    const ph = postHocFor(d, "rank");
    return { ...base, rule: "kruskal_wallis", test: "Kruskal-Wallis test",
      reason: "Three or more independent groups whose values are not Gaussian: the "
        + "Kruskal-Wallis test compares them by ranks, followed by Dunn's multiple "
        + "comparisons.",
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: "anova", anovaKind: "nonparametric", dunnCorrected: true },
        layout: LAYOUT.column },
      alternatives: [
        { test: "One-way ANOVA", when: "if the data are roughly Gaussian (or Gaussian after a "
          + "log transform)" },
        { test: "Welch's ANOVA", when: "if the data are Gaussian but the SDs differ" },
      ],
      postHoc: ph, sources: src("gpNonparametric", "gpNormalityChoice", "gpChooseAnova"),
      explainers: ["posthoc", "exact-adjusted"] };
  }
  // Equal SDs are a design decision, not something to test on the data
  // (GraphPad, "Q&A: choosing a test to compare two groups"); the data's
  // SD ratio is reported as a note above.
  const sdUnequal = d.equalSD === "unequal";
  if (d.distribution === "lognormal") {
    notes.push("Lognormal data: transform Y = log(Y) (Analyze › Transform) and run the ANOVA on "
      + "the logs.");
  }
  if (sdUnequal) {
    const ph = postHocFor(d, "welch", k?.minN ?? null);
    return { ...base, rule: "welch_anova", test: "Welch's one-way ANOVA",
      reason: "Three or more independent groups whose SDs you expect to differ: Welch's ANOVA "
        + "does not assume equal SDs (the results also show the Brown-Forsythe ANOVA), and "
        + "the comparisons that follow it do not either. Kruskal-Wallis is not a fix for "
        + "unequal SDs: it assumes equal spread too.",
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: "anova", anovaKind: "parametric", anovaSd: "unequal",
          unequalComparisons: d.question === "all" && (k?.minN ?? 0) >= 50
            ? "games_howell" : "dunnett_t3",
          unequalFamily: d.question === "control" ? "control" : "all" },
        layout: LAYOUT.column },
      alternatives: [
        { test: "Ordinary one-way ANOVA", when: "if the SDs are similar" },
        { test: "Kruskal-Wallis test", when: "for ordinal or clearly non-Gaussian data" },
      ],
      postHoc: ph, sources: src("gpChooseAnova", "gpWelchAnova"),
      explainers: ["posthoc", "exact-adjusted"] };
  }
  return { ...base, rule: "one_way_anova", test: "Ordinary one-way ANOVA",
    reason: "Three or more independent groups with roughly Gaussian values: one-way ANOVA "
      + "tests whether all the means are equal, and the multiple comparisons that follow "
      + "answer which groups differ, with P values adjusted for the number of comparisons. "
      + "Running separate t tests instead would inflate the chance of a false positive.",
    target: { tableType: COLUMN, analysisId: A_COLUMN,
      options: { analysis: "anova", anovaKind: "parametric", anovaSd: "equal",
        comparisons: d.question === "all" ? "tukey" : d.question === "control" ? "dunnett"
          : "sidak" },
      layout: LAYOUT.column },
    alternatives: [
      { test: "Welch's ANOVA", when: "if the SDs differ markedly (the results report the "
        + "Brown-Forsythe test of equal SDs)" },
      { test: "Kruskal-Wallis test", when: "for ordinal or clearly non-Gaussian data with 5 "
        + "or more per group" },
      { test: "Repeated-measures ANOVA", when: "if the same subjects were measured in every "
        + "group" },
    ],
    postHoc: postHocFor(d, "ordinary"), sources: src("gpChooseAnova", "gpMultipleComparisons", "gpMcHowTo"),
    explainers: ["posthoc", "exact-adjusted"] };
}

type Base = { notes: string[]; tails: string };

function counts(d: Design, base: Base): Recommendation {
  if (d.replicates !== "independent") {
    return { ...base, rule: "proportion_per_unit",
      test: "Proportion per biological replicate, then a t test or ANOVA",
      reason: "The counts were pooled from several animals, cultures or experiments. A "
        + "chi-square or Fisher test on the pooled counts treats every cell or event as "
        + "independent and ignores the variation between replicates. Compute the proportion "
        + "(or %) for each biological replicate and compare those values: one per replicate.",
      target: { tableType: COLUMN, analysisId: A_COLUMN,
        options: { analysis: d.groups === "two" ? "ttest" : "anova",
          ...(d.groups === "two" ? { ttestKind: d.paired ? "paired" : "welch" } : {}) },
        layout: "Column table: one column per group, one row per biological replicate holding "
          + "its proportion." },
      alternatives: [{ test: "Cochran-Mantel-Haenszel test", when: "for 2×2 tables repeated "
        + "in each experiment, keeping experiments as strata" }],
      postHoc: null, sources: src("lord2020", "gpContingency"), explainers: ["replicates"] };
  }
  if (d.groups === "one") {
    if (d.twoOutcomes) {
      return { ...base, rule: "binomial", test: "Binomial test of one proportion",
        reason: "One group with two outcomes compared with an expected proportion: the exact "
          + "binomial test, with a confidence interval of the proportion.",
        target: { tableType: "contingency", analysisId: "proportions", options: {},
          layout: "Contingency table: one row, two columns (successes, failures)." },
        alternatives: [{ test: "Chi-square goodness of fit", when: "for three or more categories" }],
        postHoc: null, sources: src("gpContingency"), explainers: [] };
    }
    return { ...base, rule: "chisq_gof", test: "Chi-square goodness of fit",
      reason: "Counts in three or more categories compared with expected proportions (for "
        + "example a 9:3:3:1 ratio).",
      target: { tableType: "partsofwhole", analysisId: "chisq_goodness_of_fit", options: {},
        layout: LAYOUT.pow },
      alternatives: [{ test: "Binomial test", when: "for two categories" }],
      postHoc: null, sources: src("gpContingency"), explainers: [] };
  }
  if (d.paired) {
    return { ...base, rule: "mcnemar", test: "McNemar's test",
      reason: "Each subject was classified twice (before/after, two tests) or the subjects are "
        + "matched pairs: McNemar's test uses only the discordant pairs, which an ordinary "
        + "chi-square test would treat as independent.",
      target: { tableType: "contingency", analysisId: "mcnemar", options: {},
        layout: "Contingency table 2×2: rows = outcome of the first test, columns = outcome of "
          + "the second; each cell counts pairs." },
      alternatives: [{ test: "Cohen's kappa", when: "to measure agreement rather than test a change" }],
      postHoc: null, sources: src("gpContingency"), explainers: [] };
  }
  if (d.stratified) {
    return { ...base, rule: "cmh", test: "Cochran-Mantel-Haenszel test",
      reason: "The same 2×2 comparison was made in several strata (sites, experiments, "
        + "litters): the CMH test combines them without pooling the counts, so differences "
        + "between strata cannot create or hide an association.",
      target: { tableType: "contingency", analysisId: "cmh", options: {},
        layout: "Contingency table: two outcome columns, two consecutive rows per stratum." },
      alternatives: [{ test: "Fisher's exact test per stratum", when: "to look at each stratum alone" }],
      postHoc: null, sources: src("gpContingency"), explainers: [] };
  }
  if (d.groups === "two" && d.twoOutcomes) {
    return { ...base, rule: "fisher", test: "Fisher's exact test",
      reason: "Two independent groups and two outcomes (a 2×2 table): Fisher's exact test "
        + "computes the P value exactly, so it is valid with small counts where the chi-square "
        + "approximation is not; with a computer there is no reason to prefer chi-square for "
        + "a 2×2 table. Report the relative risk or odds ratio with its CI too.",
      target: { tableType: "contingency", analysisId: "contingency", options: { effectSizes: true },
        layout: LAYOUT.contingency },
      alternatives: [{ test: "Chi-square test", when: "for large counts it gives nearly the same "
        + "P value" }, { test: "McNemar's test", when: "if the data are paired" }],
      postHoc: null, sources: src("gpContingency"), explainers: [] };
  }
  if (d.ordered && d.twoOutcomes) {
    return { ...base, rule: "chisq_trend", test: "Chi-square test for trend",
      reason: "Three or more ordered groups (doses, age bands) with two outcomes: the test for "
        + "trend asks whether the proportion rises or falls with the order, which is more "
        + "powerful than the overall chi-square test for that question.",
      target: { tableType: "contingency", analysisId: "contingency", options: { trend: true },
        layout: LAYOUT.contingency },
      alternatives: [{ test: "Chi-square test", when: "if the groups have no natural order" }],
      postHoc: null, sources: src("gpContingency"), explainers: [] };
  }
  return { ...base, rule: "chisq", test: "Chi-square test",
    reason: "A table larger than 2×2 of independent counts: the chi-square test asks whether "
      + "the distribution of outcomes differs between groups. If many expected counts are "
      + "below 5 the approximation is poor: combine categories or use an exact method.",
    target: { tableType: "contingency", analysisId: "contingency", options: { effectSizes: true },
      layout: LAYOUT.contingency },
    alternatives: [{ test: "Chi-square test for trend", when: "if the groups are ordered and "
      + "there are two outcomes" }],
    postHoc: null, sources: src("gpContingency"), explainers: [] };
}

function survival(d: Design, base: Base): Recommendation {
  const target: Target = { tableType: "survival", analysisId: "survival", options: {},
    layout: LAYOUT.survival };
  if (d.groups === "one") {
    return { ...base, rule: "km", test: "Kaplan-Meier survival curve",
      reason: "One group followed over time with censoring: the Kaplan-Meier estimate gives "
        + "the survival curve and the median survival with its confidence interval.",
      target, alternatives: [], postHoc: null, sources: src("gpMedianSurvival", "gpSurvival"),
      explainers: ["survival"] };
  }
  return { ...base, rule: d.groups === "two" ? "logrank" : "logrank_multi",
    test: "Kaplan-Meier curves with the log-rank (Mantel-Cox) test",
    reason: "Time-to-event data with censoring: the log-rank test compares the whole survival "
      + "curves and is most powerful when the hazard ratio is constant over time. The results "
      + "also show the Gehan-Breslow-Wilcoxon test, the median survival per group and"
      + (d.groups === "two" ? " the hazard ratio." : ", for pairwise comparisons, P values "
        + "that need correcting for the number of pairs (Bonferroni or Šídák).")
      + (d.ordered ? " With ordered groups, a log-rank test for trend asks whether survival "
        + "changes with the order." : ""),
    target,
    alternatives: [
      { test: "Gehan-Breslow-Wilcoxon test", when: "if early differences matter more, or the "
        + "hazards are not proportional (it weights early deaths, when more subjects are at risk)" },
      { test: "Cox regression", when: "to adjust for covariates (not in OpenDose yet)" },
    ],
    postHoc: null, sources: src("gpLogrankGehan", "gpHazardRatio", "gpSurvival"), explainers: ["survival"] };
}

function curve(d: Design, base: Base): Recommendation {
  const model = d.agonist ? "log_agonist_vs_response_4pl" : "log_inhibitor_vs_response_4pl";
  const name = d.agonist ? "log(agonist) vs. response, variable slope (4PL)"
    : "log(inhibitor) vs. response, variable slope (4PL)";
  if (d.curveGoal === "standard") {
    return { ...base, rule: "standard_curve",
      test: "Nonlinear regression (4PL) and interpolation of unknowns",
      reason: "A standard curve: fit a sigmoidal 4PL (or asymmetric 5PL when the curve is not "
        + "symmetric) to the standards and read the unknowns off it. Unknowns outside the "
        + "range of the standards cannot be interpolated reliably.",
      target: { tableType: "xy", analysisId: "nonlin",
        options: { model: "log_agonist_vs_response_4pl" }, layout: LAYOUT.xy },
      alternatives: [{ test: "Asymmetric 5PL", when: "when the top and bottom approach the "
        + "plateaus differently (common in ELISA)" },
      { test: "Linear regression", when: "only within a range where the response is linear" }],
      postHoc: null, sources: src("gpInterpolate", "gpR2"), explainers: ["r2", "ambiguous"] };
  }
  if (d.curveGoal === "compare") {
    if (d.replicates !== "independent" || d.paired) {
      return { ...base, rule: "compare_logic50_experiments",
        test: "Fit each experiment, then a paired t test (or RM ANOVA) on the LogIC50 values",
        reason: "When each experiment produced its own curve, the experiments are the "
          + "replicates. Fit every curve, collect one LogIC50 (or LogEC50) per experiment and "
          + "condition, and compare them with a paired t test (two conditions) or "
          + "repeated-measures ANOVA, matching by experiment. Use the logs: IC50s are lognormal.",
        target: { tableType: COLUMN, analysisId: A_COLUMN,
          options: { analysis: "ttest", ttestKind: "paired" },
          layout: "Column table: one column per condition, one row per experiment holding its "
            + "LogIC50." },
        alternatives: [{ test: "Global fit with a shared LogIC50", when: "when all the points "
          + "come from one experiment" }],
        postHoc: null, sources: src("gpCompareCurves", "gpRelAbsIc50"),
        explainers: ["relative-absolute-ic50", "replicates"] };
    }
    return { ...base, rule: "compare_curves_global",
      test: `Nonlinear regression (${name}) with the parameter shared between data sets`,
      reason: "To ask whether two curves differ in one parameter (usually LogIC50), fit them "
        + "together with that parameter shared and compare with fitting each separately (extra "
        + "sum-of-squares F test). OpenDose fits the shared model; compare the two fits' sums of "
        + "squares, or report each LogIC50 with its 95% CI.",
      target: { tableType: "xy", analysisId: "nonlin", options: { model }, layout: LAYOUT.xy },
      alternatives: [{ test: "t test on LogIC50 values", when: "when you have three or more "
        + "independent experiments per condition" }],
      postHoc: null, sources: src("gpCompareCurves", "gpGlobalFit"),
      explainers: ["relative-absolute-ic50", "ambiguous"] };
  }
  if (d.curveGoal === "other") {
    return { ...base, rule: "nonlin_other", test: "Nonlinear regression (choose a model)",
      reason: "Pick the model from the mechanism (binding, enzyme kinetics, exponential "
        + "decay, growth), not from which curve looks best. Check that the parameters are "
        + "defined (no 'ambiguous' flag) and the residuals show no pattern.",
      target: { tableType: "xy", analysisId: "nonlin", options: {}, layout: LAYOUT.xy },
      alternatives: [{ test: "Linear regression", when: "when theory predicts a straight line" }],
      postHoc: null, sources: src("gpR2", "gpAmbiguous"), explainers: ["r2", "ambiguous"] };
  }
  return { ...base, rule: d.agonist ? "ec50" : "ic50",
    test: `Nonlinear regression: ${name}`,
    reason: `A dose-response experiment: fit the ${d.agonist ? "agonist" : "inhibitor"} `
      + "model with a variable slope against log concentration. Leave Top and Bottom free if "
      + "the data reach both plateaus; constrain them to the control values (e.g. 100 and 0 "
      + "after normalising) only when the controls define them well and the curve does not. "
      + "The fitted IC50 is relative (midway between the plateaus); use the absolute IC50 if "
      + "you need the concentration giving 50% of control.",
    target: { tableType: "xy", analysisId: "nonlin", options: { model }, layout: LAYOUT.xy },
    alternatives: [
      { test: "Hill slope fixed (3-parameter model)", when: "with few concentrations, if the "
        + "standard slope (-1 or 1) is plausible" },
      { test: "Asymmetric 5PL", when: "when the curve is clearly asymmetric and you have many "
        + "points" },
    ],
    postHoc: null, sources: src("gpRelAbsIc50", "gpAmbiguous", "gpR2"),
    explainers: ["relative-absolute-ic50", "ambiguous", "r2"] };
}
