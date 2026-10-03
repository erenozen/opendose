// "Which test?" rule table. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DESIGN, deriveChecks, recommend, type DataChecks, type Design, type GroupCheck,
} from "../recommend.ts";

const d = (patch: Partial<Design>): Design => ({ ...DEFAULT_DESIGN, ...patch });
const g = (name: string, n: number, mean: number, sd: number, p: number | null = 0.5,
  allPositive = true): GroupCheck => ({ name, n, mean, sd, normalityP: p, allPositive });
const data = (groups: GroupCheck[], missing = false): DataChecks =>
  ({ tableType: "column", groups, missing });

// scenario -> [rule, test name, table type, analysis id, key options]
const CASES: [string, Design, DataChecks | null, string, string, string, string,
  Record<string, unknown>][] = [
  ["2 independent groups, defaults", d({}), null,
    "welch_t", "Unpaired t test with Welch's correction", "column", "column",
    { analysis: "ttest", ttestKind: "welch" }],
  ["2 independent groups, SDs known equal", d({ equalSD: "equal" }), null,
    "unpaired_t", "Unpaired t test", "column", "column", { ttestKind: "unpaired" }],
  ["2 independent groups, SDs unequal", d({ equalSD: "unequal" }), null,
    "welch_t", "Unpaired t test with Welch's correction", "column", "column", { ttestKind: "welch" }],
  ["2 independent groups, not Gaussian, n 8", d({ distribution: "not_normal" }),
    data([g("A", 8, 5, 2), g("B", 8, 7, 2)]),
    "mann_whitney", "Mann-Whitney test", "column", "column", { ttestKind: "mann_whitney" }],
  ["2 independent groups, not Gaussian, n 3 (rank test powerless)",
    d({ distribution: "not_normal" }), data([g("A", 3, 5, 2), g("B", 3, 7, 2)]),
    "welch_t", "Unpaired t test with Welch's correction", "column", "column", { ttestKind: "welch" }],
  ["2 independent groups, normality fails at n 15 (advice only)", d({}),
    data([g("A", 15, 5, 2, 0.01, false), g("B", 15, 7, 2, 0.3, false)]),
    "welch_t", "Unpaired t test with Welch's correction", "column", "column", { ttestKind: "welch" }],
  ["2 independent groups, normality fails at n 40 (robust)", d({}),
    data([g("A", 40, 5, 2, 0.001), g("B", 40, 7, 2)]),
    "welch_t", "Unpaired t test with Welch's correction", "column", "column", { ttestKind: "welch" }],
  ["2 independent groups, lognormal", d({ distribution: "lognormal" }), null,
    "welch_t", "Unpaired t test with Welch's correction", "column", "column", { ttestKind: "welch" }],
  ["2 paired groups", d({ paired: true }), null,
    "paired_t", "Paired t test", "column", "column", { ttestKind: "paired" }],
  ["2 paired groups, consistent ratio", d({ paired: true, ratioEffect: true }), null,
    "ratio_paired_t", "Ratio paired t test", "column", "column", { ttestKind: "ratio_paired" }],
  ["2 paired groups, lognormal", d({ paired: true, distribution: "lognormal" }), null,
    "ratio_paired_t", "Ratio paired t test", "column", "column", { ttestKind: "ratio_paired" }],
  ["2 paired groups, not Gaussian, 10 pairs", d({ paired: true, distribution: "not_normal" }),
    data([g("Before", 10, 5, 1), g("After", 10, 6, 1)]),
    "wilcoxon_pairs", "Wilcoxon matched-pairs signed-rank test", "column", "column",
    { ttestKind: "wilcoxon" }],
  ["2 paired groups, control normalised to 1", d({ paired: true }),
    data([g("Control", 5, 1, 0), g("Treated", 5, 1.8, 0.4)]),
    "paired_normalised", "One-sample t test on the logs (ratio t test against 1) of the normalised values",
    "column", "column", { analysis: "column_statistics", hypothetical: "1", ratioT: true }],
  ["2 unpaired groups, control normalised to 100", d({}),
    data([g("Control", 6, 100, 0), g("Treated", 6, 140, 20)]),
    "unpaired_normalised", "One-sample t test on the logs (ratio t test against 1) of the treated group",
    "column", "column", { hypothetical: "100", ratioT: true }],
  ["1 group vs hypothetical", d({ groups: "one", hypothetical: "5" }), null,
    "one_sample_t", "One-sample t test against 5", "column", "column",
    { analysis: "column_statistics", hypothetical: "5" }],
  ["1 group, not Gaussian, n 12", d({ groups: "one", distribution: "not_normal" }),
    data([g("A", 12, 3, 1)]),
    "wilcoxon_signed_rank", "Wilcoxon signed-rank test", "column", "column", { hypothetical: "0" }],
  ["1 group normalised (fold change)", d({ groups: "one", normalised: true }), null,
    "one_sample_log", "One-sample t test on the logs (ratio t test against 1)", "column", "column",
    { hypothetical: "1", ratioT: true }],
  ["2 groups, technical replicates", d({ replicates: "technical" }), null,
    "nested_t", "Nested t test", "nested", "nested_ttest", {}],
  ["2 groups, cells within animals", d({ replicates: "cells" }), null,
    "nested_t", "Nested t test", "nested", "nested_ttest", {}],
  ["3 groups, technical replicates, vs control", d({ groups: "three_plus", replicates: "technical",
    question: "control" }), null,
  "nested_anova", "Nested one-way ANOVA", "nested", "nested_anova", { comparisons: "dunnett" }],
  ["3 groups, all pairs", d({ groups: "three_plus" }), null,
    "one_way_anova", "Ordinary one-way ANOVA", "column", "column",
    { analysis: "anova", anovaKind: "parametric", comparisons: "tukey" }],
  ["3 groups, vs control", d({ groups: "three_plus", question: "control" }), null,
    "one_way_anova", "Ordinary one-way ANOVA", "column", "column", { comparisons: "dunnett" }],
  ["3 groups, selected pairs", d({ groups: "three_plus", question: "selected" }), null,
    "one_way_anova", "Ordinary one-way ANOVA", "column", "column", { comparisons: "sidak" }],
  ["3 groups, SDs unequal, n 6", d({ groups: "three_plus", equalSD: "unequal" }),
    data([g("A", 6, 5, 1), g("B", 6, 7, 3), g("C", 6, 9, 5)]),
    "welch_anova", "Welch's one-way ANOVA", "column", "column",
    { anovaSd: "unequal", unequalComparisons: "dunnett_t3", unequalFamily: "all" }],
  ["3 groups, SDs unequal, n 60", d({ groups: "three_plus", equalSD: "unequal" }),
    data([g("A", 60, 5, 1), g("B", 60, 7, 3), g("C", 60, 9, 5)]),
    "welch_anova", "Welch's one-way ANOVA", "column", "column",
    { unequalComparisons: "games_howell" }],
  ["3 groups, SD ratio 5 but SDs not declared unequal (note only)",
    d({ groups: "three_plus" }), data([g("A", 6, 5, 1), g("B", 6, 7, 3), g("C", 6, 9, 5)]),
    "one_way_anova", "Ordinary one-way ANOVA", "column", "column", { anovaSd: "equal" }],
  ["3 groups, not Gaussian", d({ groups: "three_plus", distribution: "not_normal" }), null,
    "kruskal_wallis", "Kruskal-Wallis test", "column", "column", { anovaKind: "nonparametric" }],
  ["3 groups repeated", d({ groups: "three_plus", paired: true }), null,
    "rm_one_way", "Repeated-measures one-way ANOVA", "column", "column",
    { analysis: "rm_anova", rmKind: "parametric" }],
  ["3 groups repeated with missing values", d({ groups: "three_plus", paired: true }),
    data([g("A", 6, 5, 1), g("B", 5, 6, 1), g("C", 6, 7, 1)], true),
    "rm_one_way_missing", "Repeated-measures one-way ANOVA", "column", "column",
    { analysis: "rm_anova" }],
  ["3 groups repeated, not Gaussian", d({ groups: "three_plus", paired: true,
    distribution: "not_normal" }), null,
  "friedman", "Friedman test", "column", "column", { rmKind: "nonparametric" }],
  ["3 groups, control normalised to 1", d({ groups: "three_plus" }),
    data([g("Control", 4, 1, 0), g("A", 4, 1.5, 0.2), g("B", 4, 2, 0.3)]),
    "multi_normalised", "One-sample t tests on the logs (ratio t test vs 1), one per treated group",
    "column", "column", { hypothetical: "1", ratioT: true }],
  ["two factors, independent", d({ factors: "two" }), null,
    "two_way", "Two-way ANOVA", "grouped", "grouped_two_way",
    { design: "none", comparisons: "tukey" }],
  ["two factors, one repeated, vs control", d({ factors: "two", repeated: "one",
    question: "control" }), null,
  "two_way_rm", "Two-way repeated-measures ANOVA", "grouped", "grouped_two_way",
  { design: "rm_rows", comparisons: "sidak" }],
  ["two factors, both repeated", d({ factors: "two", repeated: "both" }), null,
    "two_way_rm", "Two-way repeated-measures ANOVA", "grouped", "grouped_two_way",
    { design: "rm_both" }],
  ["two factors repeated with missing values", d({ factors: "two", repeated: "one" }),
    data([g("A", 5, 1, 1)], true),
    "two_way_mixed", "Two-way repeated-measures analysis (mixed-effects model)", "grouped",
    "grouped_two_way", { design: "rm_rows" }],
  ["three factors", d({ factors: "three" }), null,
    "three_way", "Three-way ANOVA", "grouped", "grouped_three_way", {}],
  ["counts 2x2 independent", d({ outcome: "counts" }), null,
    "fisher", "Fisher's exact test", "contingency", "contingency", {}],
  ["counts 2x2 paired", d({ outcome: "counts", paired: true }), null,
    "mcnemar", "McNemar's test", "contingency", "mcnemar", {}],
  ["counts, ordered groups", d({ outcome: "counts", groups: "three_plus", ordered: true }), null,
    "chisq_trend", "Chi-square test for trend", "contingency", "contingency", { trend: true }],
  ["counts, larger table", d({ outcome: "counts", groups: "three_plus", twoOutcomes: false }), null,
    "chisq", "Chi-square test", "contingency", "contingency", {}],
  ["counts, strata", d({ outcome: "counts", stratified: true }), null,
    "cmh", "Cochran-Mantel-Haenszel test", "contingency", "cmh", {}],
  ["counts, one group, two outcomes", d({ outcome: "counts", groups: "one" }), null,
    "binomial", "Binomial test of one proportion", "contingency", "proportions", {}],
  ["counts, one group, many categories", d({ outcome: "counts", groups: "one",
    twoOutcomes: false }), null,
  "chisq_gof", "Chi-square goodness of fit", "partsofwhole", "chisq_goodness_of_fit", {}],
  ["counts pooled from animals", d({ outcome: "counts", replicates: "cells" }), null,
    "proportion_per_unit", "Proportion per biological replicate, then a t test or ANOVA",
    "column", "column", { analysis: "ttest", ttestKind: "welch" }],
  ["survival, two groups", d({ outcome: "survival" }), null,
    "logrank", "Kaplan-Meier curves with the log-rank (Mantel-Cox) test", "survival", "survival", {}],
  ["survival, one group", d({ outcome: "survival", groups: "one" }), null,
    "km", "Kaplan-Meier survival curve", "survival", "survival", {}],
  ["survival, three groups", d({ outcome: "survival", groups: "three_plus" }), null,
    "logrank_multi", "Kaplan-Meier curves with the log-rank (Mantel-Cox) test", "survival",
    "survival", {}],
  ["dose-response inhibitor", d({ outcome: "curve" }), null,
    "ic50", "Nonlinear regression: log(inhibitor) vs. response, variable slope (4PL)", "xy", "nonlin",
    { model: "log_inhibitor_vs_response_4pl" }],
  ["dose-response agonist", d({ outcome: "curve", agonist: true }), null,
    "ec50", "Nonlinear regression: log(agonist) vs. response, variable slope (4PL)", "xy", "nonlin",
    { model: "log_agonist_vs_response_4pl" }],
  ["standard curve", d({ outcome: "curve", curveGoal: "standard" }), null,
    "standard_curve", "Nonlinear regression (4PL) and interpolation of unknowns", "xy", "nonlin", {}],
  ["compare curves, one experiment", d({ outcome: "curve", curveGoal: "compare" }), null,
    "compare_curves_global",
    "Nonlinear regression (log(inhibitor) vs. response, variable slope (4PL)) with the parameter shared between data sets",
    "xy", "nonlin", {}],
  ["compare IC50 across repeated experiments", d({ outcome: "curve", curveGoal: "compare",
    paired: true }), null,
  "compare_logic50_experiments",
  "Fit each experiment, then a paired t test (or RM ANOVA) on the LogIC50 values", "column", "column",
  { ttestKind: "paired" }],
];

test(`the rule table has ${CASES.length} scenarios (>= 30)`, () => {
  assert.ok(CASES.length >= 30);
});

for (const [name, design, checks, rule, testName, tableType, analysisId, opts] of CASES) {
  test(`which test: ${name}`, () => {
    const r = recommend(design, checks);
    assert.equal(r.rule, rule);
    assert.equal(r.test, testName);
    assert.equal(r.target?.tableType, tableType);
    assert.equal(r.target?.analysisId, analysisId);
    for (const [k, v] of Object.entries(opts)) assert.deepEqual(r.target?.options[k], v, k);
    assert.ok(r.reason.length > 60, "reason is a paragraph");
    assert.ok(r.sources.length > 0, "every rule cites a source");
    for (const s of r.sources) assert.match(s.url, /^https:\/\//);
  });
}

test("post hoc family follows the question", () => {
  assert.equal(recommend(d({ groups: "three_plus" })).postHoc?.method, "Tukey");
  assert.equal(recommend(d({ groups: "three_plus", question: "control" })).postHoc?.method, "Dunnett");
  assert.match(recommend(d({ groups: "three_plus", question: "selected" })).postHoc?.method ?? "",
    /Šídák/);
  assert.equal(recommend(d({ groups: "three_plus", question: "selected" })).postHoc?.family,
    "selected pairs");
  assert.equal(recommend(d({ groups: "three_plus", distribution: "not_normal" })).postHoc?.method,
    "Dunn's test");
  assert.equal(recommend(d({})).postHoc, null);
});

test("data checks become notes, never silent switches", () => {
  const r = recommend(d({}), data([g("A", 15, 5, 2, 0.01, false), g("B", 15, 7, 2)]));
  assert.ok(r.notes.some((n) => n.includes("normality test failed for A")));
  const sd = recommend(d({ groups: "three_plus" }),
    data([g("A", 6, 5, 1), g("B", 6, 7, 3), g("C", 6, 9, 5)]));
  assert.ok(sd.notes.some((n) => n.includes("largest SD is 5.0×")));
  const small = recommend(d({}), data([g("A", 2, 5, 1), g("B", 2, 6, 1)]));
  assert.ok(small.notes.some((n) => n.includes("n = 2")));
  const tails = recommend(d({ direction: "predicted" }));
  assert.match(tails.tails, /decided before the data/);
});

test("derived checks", () => {
  const k = deriveChecks(data([g("Ctl", 4, 100, 0), g("A", 6, 120, 10), g("B", 6, 90, 30)]))!;
  assert.equal(k.minN, 4);
  assert.equal(k.unequalN, true);
  assert.equal(k.normalisedControl, "Ctl");
  assert.deepEqual(k.zeroVariance, ["Ctl"]);
  assert.equal(k.sdRatio, 3);
  assert.equal(deriveChecks(null), null);
});
