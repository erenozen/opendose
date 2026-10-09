// "What this means" (report/meaning.ts) against native engine results:
// the example tables (fixtures.json) and meaning-fixtures.json (Cox,
// logistic, multiple and linear regression, a t test whose CI spans 0,
// three survival curves).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fmt, meaningOf, unitFromTitle, MEANING_SOURCES, type MeaningTable } from "../meaning.ts";

const here = dirname(fileURLToPath(import.meta.url));
type Fx = Record<string, { options: unknown; result: Record<string, unknown> }>;
const FX: Fx = {
  ...JSON.parse(readFileSync(join(here, "fixtures.json"), "utf8")),
  ...JSON.parse(readFileSync(join(here, "meaning-fixtures.json"), "utf8")),
};
const mean = (k: string, table: MeaningTable | null = null, analysisId?: string) => {
  const m = meaningOf({ result: FX[k].result, options: FX[k].options, table, analysisId });
  assert.ok(m, `${k}: a meaning`);
  return m;
};
// "compatible with no difference" is the honest reading (Amrhein et al.
// 2019); "there was no difference", "proves" and "a trend" are not.
const FORBIDDEN = /\bprove[sd]?\b|\b(is|was|were|are|shows?|showed|found) no (difference|effect|association)\b|\btrend\b(?!”)/i;

test("unit from a Y title; numbers as the results sheet shows them", () => {
  assert.equal(unitFromTitle("Tumour volume (mm³)"), "mm³");
  assert.equal(unitFromTitle("Weight"), "");
  assert.equal(unitFromTitle(""), "");
  assert.equal(fmt(-5.2), "−5.2");
});

test("unpaired t test: direction, the difference in units and %, the CI and what P means", () => {
  const m = mean("ttest_unpaired", { yTitle: "Tumour volume (mm³)" });
  assert.match(m.sentence, /^On average Treated A was 5\.2 mm³ higher than Control \(mean 29\.17 vs\. 23\.97, 22% higher\)/);
  assert.match(m.sentence, /95% CI 3\.129 to 7\.271 mm³ higher/);
  assert.match(m.sentence, /a difference this large would be unusual \(P = 0\.0002\) if the groups did not differ\./);
  assert.match(m.misreading ?? "", /is the probability that there is no real difference/);
  assert.match(m.test ?? "", /^Unpaired t test: compares the means of two independent groups/);
  assert.ok(m.sources.some((s) => s.url === MEANING_SOURCES.greenland2016.url));
  assert.doesNotMatch(m.sentence, FORBIDDEN);
});

test("a non-significant t test is never 'no difference': the CI says what is compatible", () => {
  const m = mean("ttest_ns", { yTitle: "Weight (g)" });
  assert.match(m.sentence, /^Drug averaged 0\.35 g higher than Vehicle/);
  assert.match(m.sentence, /the data do not show a difference \(P = 0\.6802\)/);
  assert.match(m.sentence, /the 95% CI runs from 1\.496 g lower to 2\.196 g higher/);
  assert.doesNotMatch(m.sentence, FORBIDDEN);
  assert.match(m.misreading ?? "", /“no difference” or “a trend”/);
  assert.ok(m.sources.some((s) => s.url === MEANING_SOURCES.amrhein2019.url));
  assert.match(m.test ?? "", /Welch/);
});

test("paired, ratio paired, Mann-Whitney and Wilcoxon", () => {
  assert.match(mean("ttest_paired").sentence,
    /^Within each pair, Treated A was on average 5\.2 higher than Control across 6 pairs \(95% CI 3\.766 to 6\.634 higher\)/);
  assert.match(mean("ttest_ratio_paired").sentence, /^On average Control was 0\.8209 times Treated A within a pair \(95% CI 0\.7762 to 0\.8682\)/);
  const mw = mean("mann_whitney");
  assert.match(mw.sentence, /^Values in Treated A tended to be higher than in Control \(median 28\.9 vs\. 24\)/);
  assert.match(mw.misreading ?? "", /compares the whole distributions by rank/);
  assert.match(mean("wilcoxon").sentence, /^Within pairs, Treated A tended to be higher than Control/);
});

test("one-way ANOVA says the means are not all equal and names the clearest pair", () => {
  const m = mean("anova_tukey", { yTitle: "Score (AU)" });
  assert.match(m.sentence, /^The 3 group means \(Control, Treated A and Treated B\) are not all the same/);
  assert.match(m.sentence, /by Tukey's multiple comparisons test, 3 of 3 pairs differ, most clearly Treated B above Control by 11\.53 AU \(95% CI 9\.229 to 13\.84 AU\)/);
  assert.match(m.misreading ?? "", /every group differs from every other/);
  assert.match(mean("kruskal").sentence, /group distributions .* 1 of 3 pairs differs/);
  assert.match(mean("welch_anova").test ?? "", /Welch's ANOVA/);
  assert.match(mean("rm_anova").test ?? "", /same subjects/);
  assert.match(mean("friedman").test ?? "", /Friedman/);
});

test("two-way ANOVA: the interaction in the user's factors and levels", () => {
  const m = mean("two_way", { yTitle: "Tumour volume (mm³)" });
  assert.match(m.sentence, /^The effect of Treatment differed between levels of Day \(interaction P < 0\.0001\)/);
  assert.match(m.sentence, /the difference Drug − Vehicle was −4\.667 mm³ at Day 7 but −246\.3 mm³ at Day 21/);
  assert.match(m.misreading ?? "", /main effect/);
  // repeated measures: factor names from the table when the result has none
  const rm = mean("rm_two_way", { factorNames: { rows: "Day", datasets: "Treatment" } });
  assert.match(rm.sentence, /^The effect of Treatment differed between levels of Day \(interaction P = 0\.0003\)/);
});

test("correlation: what r means, and not causation", () => {
  const m = mean("correlation");
  assert.match(m.sentence, /^The data do not show a correlation between Control and Treated A \(P = 0\.1681\): r = 0\.6434 with a 95% CI from −0\.352 to 0\.9558/);
  assert.match(m.test ?? "", /Pearson/);
  const sig = meaningOf({ result: { ...FX.correlation.result, p_two_tailed: 0.001 } });
  assert.match(sig?.sentence ?? "", /tend to rise together .* about 41% of the variation/);
  assert.match(sig?.misreading ?? "", /causes|causation/);
});

test("curve fit: the IC50 in the table's units and what the Hill slope means", () => {
  const m = mean("dose_response", { xUnit: "M" });
  assert.match(m.sentence, /^Drug A gives a response halfway between its plateaus \(Bottom 0\.9802, Top 99\.86\) at 104 nM, its IC50 \(95% CI 96\.95 nM to 111\.5 nM\)/);
  assert.match(m.sentence, /Hill slope of −1\.103 .* 53\.6-fold rise in concentration \(81-fold for a slope of 1, so this curve is steeper\)/);
  assert.match(m.misreading ?? "", /It is relative/);
  // a midpoint outside the doses tested is not reported as a number
  const ds = (FX.dose_response.result.datasets as Record<string, unknown>[])[0];
  const fit = { ...(ds.fit as object), range_flags: { ec50_above_range: true } };
  const out = meaningOf({ result: { ...FX.dose_response.result, datasets: [{ ...ds, fit }] } });
  assert.match(out?.sentence ?? "", /above the highest concentration tested, so the IC50 is not determined/);
});

test("survival: the hazard ratio in the user's groups, the CI including 1, medians", () => {
  const m = mean("survival", { xUnit: "days" });
  assert.match(m.sentence, /^At any moment, Control's rate of the event \(hazard\) was 2\.251 times Treated's \(95% CI 0\.739 to 6\.859\)/);
  assert.match(m.sentence, /the CI includes 1, so the data do not show a difference in risk \(log-rank P = 0\.1781\)/);
  assert.match(m.sentence, /median survival Control 37 days and Treated 46 days\.$/);
  assert.match(m.misreading ?? "", /median survival times/);
  assert.ok(m.sources.some((s) => /hazard_ratio/.test(s.url)));
  // a hazard ratio below 1 reads as a percentage of the other group's
  const low = meaningOf({ result: { ...FX.survival.result, hazard_ratio: { value: 0.45, ci: [0.25, 0.81] } } });
  assert.match(low?.sentence ?? "", /Control's rate of the event \(hazard\) was 45% of Treated's \(hazard ratio 0\.45, 95% CI 0\.25 to 0\.81\)/);
  assert.doesNotMatch(low?.sentence ?? "", /includes 1/);
  const three = mean("survival_three");
  assert.match(three.sentence, /^The data do not show that the survival of A, B and C differs \(log-rank P = 0\.0824\); median survival A 7, B 10 and C 20\.$/);
});

test("Cox regression: the group's hazard ratio holding the other covariates constant", () => {
  const m = mean("cox", null, "cox");
  assert.match(m.sentence, /^At any moment, the rate of the event \(hazard\) in Treated was 33% of that in Control \(hazard ratio 0\.3289, 95% CI 0\.09448 to 1\.145\), holding Age constant; the CI includes 1/);
  assert.match(m.test ?? "", /Cox proportional-hazards/);
});

test("contingency: relative risk in the user's rows and columns; odds ratio misreading", () => {
  const m = mean("contingency_2x2", { rowTitles: ["Treated", "Placebo"], datasets: [{ name: "Recovered" }, { name: "Not recovered" }] });
  assert.match(m.sentence, /^“Recovered” in 33% of Treated vs\. 83% of Placebo: the risk in Treated was 40% of that in Placebo \(relative risk 0\.4, 95% CI 0\.2353 to 0\.6801; odds ratio 0\.1\)/);
  assert.match(m.misreading ?? "", /odds ratio as a relative risk/);
  assert.match(mean("contingency_2x3").sentence, /chi-square test/);
  assert.match(mean("proportions").sentence, /^33% of Group 1 vs\. 67% of Group 2/);
  assert.match(mean("kappa").sentence, /71% of the agreement possible beyond chance/);
  assert.match(mean("mcnemar").sentence, /20 went one way and 5 the other/);
});

test("nested: the df come from the subcolumns, not the values", () => {
  const m = mean("nested_t");
  assert.match(m.sentence, /^Diet A averaged 6\.917 higher than Control, but the data do not show a difference \(P = 0\.0503\)/);
  assert.match(m.sentence, /counts the 6 subcolumns, 3 per group, not the 24 values, so its df is 4/);
  assert.match(m.misreading ?? "", /independent replicate/);
  assert.match(mean("nested_anova").sentence, /9 subcolumns, 3 per group, not the 36 values, so its df is 6/);
});

test("regressions, multiple t tests, estimation, Deming, one-sample t", () => {
  assert.match(mean("linear_regression", { xTitle: "Time" }).sentence, /^Each one-unit increase in Time goes with a change of 2\.02 in Rate \(95% CI 1\.901 to 2\.139\)/);
  const lg = mean("logistic");
  assert.match(lg.sentence, /^Each one-unit increase in Dose multiplies the odds of Response by 2\.264 \(95% CI 1\.315 to 5\.814\), holding Sex constant/);
  assert.match(lg.misreading ?? "", /multiplies the odds/);
  assert.match(mean("multiple_regression").sentence, /^Each one-unit increase in Dose goes with a change of 1\.115 in Weight/);
  assert.match(mean("multi_t").sentence, /^2 of 3 rows differ after the Holm-Šídák/);
  assert.match(mean("estimation_two").misreading ?? "", /95% chance that the true difference/);
  assert.match(mean("deming").sentence, /the methods differ systematically/);
  assert.match(mean("column_statistics").sentence, /^Control \(mean 23\.97\) differs from 20/);
});

test("no meaning for failed or descriptive results; withheld P is explained", () => {
  assert.equal(meaningOf({ result: { error: "x" } }), null);
  assert.equal(meaningOf({ result: null }), null);
  assert.equal(meaningOf({ result: { analysis: "transform" } }), null);
  const w = meaningOf({ result: { ...FX.ttest_unpaired.result, p_two_tailed: null,
    withheld: { reason: "one value", min_n: 1, groups: [{ name: "Control", n: 1 }] } } });
  if (w) assert.match(w.sentence, /no estimate of the variability within groups/);
});

test("a t test on log values reads as a ratio of geometric means, never a difference of logs", () => {
  // engine output of a log-scale unpaired t test (sheets/column/__tests__/logScale.test.ts)
  const logT = {
    analysis: "ttest", test: "unpaired_t", names: ["Treated", "Control"],
    t: 4.263102245171385, df: 9, p_two_tailed: 0.0021015302214833194,
    difference: 0.47202710368140477, ci_difference: [0.22155234792408585, 0.7225018594387237],
    log_scale: { base: "log10" }, mean_a: 1.62, mean_b: 1.15,
    ratio: 2.9650164260751364, ratio_ci: [1.6655295712087437, 5.278394667298011],
  };
  const m = meaningOf({ result: logT, table: { yTitle: "IL-6 (pg/mL)" } });
  assert.match(m?.sentence ?? "", /^The geometric mean of Treated was 2\.97 times that of Control \(95% CI 1\.67–5\.28-fold\); a ratio this far from 1 would be unusual \(P = 0\.0021\)/);
  assert.doesNotMatch(m?.sentence ?? "", /0\.472|pg\/mL higher/);
  const anova = { analysis: "anova", kind: "parametric", log_scale: { base: "log10" }, table: { p: 0.001 },
    group_summaries: [{ name: "A" }, { name: "B" }, { name: "C" }],
    multiple_comparisons: { method: "tukey", comparisons: [{ pair: "A vs. C", difference: -0.4, ci: [-0.6, -0.2],
      p_adjusted: 0.002, ratio: 0.398, ratio_ci: [0.25, 0.63] }] } };
  const a = meaningOf({ result: anova });
  assert.match(a?.sentence ?? "", /group geometric means .* most clearly A\/C = 0\.398-fold \(95% CI 0\.25–0\.63\)/);
});

test("P values follow the project's style", () => {
  const m = meaningOf({ result: FX.ttest_unpaired.result, style: "apa" });
  assert.match(m?.sentence ?? "", /\(p < \.001\)/);
});

test("every meaning of every fixture is one sentence with sources, and never says 'proves'", () => {
  for (const [k, v] of Object.entries(FX)) {
    const m = meaningOf({ result: v.result, options: v.options, analysisId: k === "cox" ? "cox" : undefined });
    if (!m) continue;
    assert.ok(m.sources.length > 0, `${k}: sources`);
    assert.doesNotMatch(m.sentence, FORBIDDEN, k);
    const stops = m.sentence.replace(/\bvs\./g, "vs").match(/[.;]?\.(\s|$)/g) ?? [];
    assert.ok(stops.length <= 1, `${k}: one sentence: ${m.sentence}`);
  }
});
