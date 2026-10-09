// Log-scale analysis: when it applies, payloads, chips and phrases.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { columnPayload, residualsPayload } from "../run.ts";
import {
  comparisonFolds, droppedValues, foldPhrase, logLegendClause, logMethodsSentence,
  logScaleApplies, logScaleOptions, scaleSuggestion, ttestFold,
} from "../logScale.ts";
import { hasLogY, withLogY } from "../logAxis.ts";
import { resultSentences } from "../../../report/sentences.ts";
import { describeResult } from "../../../report/describe.ts";

const o = (patch: Partial<ColumnOptionsState>) => ({ ...DEFAULT_COLUMN_OPTIONS, ...patch });
const table = normalizeTable({
  type: "column",
  datasets: [
    { name: "Control", rows: [["10"], ["20"], ["0"]] },
    { name: "Treated", rows: [["100"], ["30"], ["50"]] },
  ],
});

// Engine output (engine/opendose/api.py _ttest with log_scale), Treated vs. Control
const logT = {
  analysis: "ttest", test: "unpaired_t", names: ["Treated", "Control"],
  t: 4.263102245171385, df: 9, p_two_tailed: 0.0021015302214833194,
  difference: 0.47202710368140477, ci_difference: [0.22155234792408585, 0.7225018594387237],
  log_scale: { base: "log10", values_dropped: { Treated: 1, Control: 0 }, n_dropped: 1 },
  geometric_means: [
    { name: "Treated", n: 5, geometric_mean: 41.94824597338978, ci: [23.16, 75.96] },
    { name: "Control", n: 6, geometric_mean: 14.147728020825058, ci: [9.61, 20.84] },
  ],
  ratio: 2.9650164260751364, ratio_ci: [1.6655295712087437, 5.278394667298011],
};

test("the option applies to unpaired / Welch t tests and ordinary one-way ANOVA", () => {
  assert.equal(logScaleApplies(o({ analysis: "ttest", ttestKind: "unpaired" })), true);
  assert.equal(logScaleApplies(o({ analysis: "ttest", ttestKind: "welch" })), true);
  assert.equal(logScaleApplies(o({ analysis: "ttest", ttestKind: "paired" })), false);
  assert.equal(logScaleApplies(o({ analysis: "ttest", ttestKind: "mann_whitney" })), false);
  assert.equal(logScaleApplies(o({ analysis: "anova" })), true);
  assert.equal(logScaleApplies(o({ analysis: "anova", anovaSd: "unequal" })), false);
  assert.equal(logScaleApplies(o({ analysis: "anova", anovaKind: "nonparametric" })), false);
  assert.equal(logScaleApplies(o({ analysis: "anova" }), true), false, "summary data");
  assert.deepEqual(logScaleOptions(o({ analysis: "anova" })), {});
  assert.deepEqual(logScaleOptions(o({ analysis: "anova", logScale: true })), { log_scale: true });
  assert.deepEqual(logScaleOptions(o({ analysis: "ttest", ttestKind: "paired", logScale: true })), {});
});

test("payloads carry log_scale only when switched on", () => {
  assert.deepEqual(columnPayload(table, o({ analysis: "ttest" })).options,
    { kind: "unpaired", welch: false, dataset_a: 0, dataset_b: 1 });
  assert.deepEqual(columnPayload(table, o({ analysis: "ttest", ttestKind: "welch", logScale: true })).options,
    { kind: "unpaired", welch: true, dataset_a: 0, dataset_b: 1, log_scale: true });
  assert.deepEqual(columnPayload(table, o({ analysis: "anova", logScale: true })).options,
    { kind: "parametric", comparisons: "tukey", control_index: 0, log_scale: true });
});

test("residuals on the log scale are those of log10(values), zeros left out", () => {
  const p = residualsPayload(table, o({ analysis: "ttest", logScale: true })) as
    { data: { datasets: { ys: (number | null)[][] }[] } };
  assert.deepEqual(p.data.datasets[0].ys.map((r) => r[0]), [1, Math.log10(20), null]);
  const raw = residualsPayload(table, o({ analysis: "ttest" })) as
    { data: { datasets: { ys: (number | null)[][] }[] } };
  assert.deepEqual(raw.data.datasets[0].ys.map((r) => r[0]), [10, 20, 0]);
});

test("the scale chip reads the engine's scale_check", () => {
  const two = { analysis: "ttest", scale_check: { suggest_log: true, sd_ratio_max_min: 4.7062,
    pearson_r_sd_mean: null, groups: [{ sd: 27 }, { sd: 5.8 }], reason: "the larger mean has a 4.7-fold larger SD (> 3)" } };
  assert.equal(scaleSuggestion(two)?.label, "SD grows with the mean (SD ratio 4.7): analyse on the log scale?");
  const three = { analysis: "anova", scale_check: { suggest_log: true, sd_ratio_max_min: 11.75,
    pearson_r_sd_mean: 0.99994, groups: [{ sd: 5.8 }, { sd: 20.7 }, { sd: 68.5 }] } };
  assert.equal(scaleSuggestion(three)?.label, "SD grows with the mean (r(SD, mean) = 1.00): analyse on the log scale?");
  assert.equal(scaleSuggestion({ scale_check: { suggest_log: false } }), null);
  assert.equal(scaleSuggestion(logT), null, "already on the log scale");
});

test("values <= 0 left out are counted", () => {
  const d = droppedValues(logT);
  assert.equal(d?.count, 1);
  assert.deepEqual(d?.groups, [["Treated", 1]]);
  assert.equal(d?.label, "1 value ≤ 0 was left out: logarithms are undefined");
  assert.equal(droppedValues({ log_scale: { n_dropped: 0 } }), null);
  assert.match(droppedValues({ log_scale: { n_dropped: 3, values_dropped: { A: 3 } } })!.label,
    /^3 values ≤ 0 were left out/);
});

test("fold phrases, methods and legend", () => {
  assert.equal(foldPhrase("Treated", "Control", 2.4, [1.6, 3.5]), "Treated/Control = 2.4-fold (95% CI 1.6–3.5)");
  assert.equal(ttestFold(logT), "Treated/Control = 2.97-fold (95% CI 1.67–5.28)");
  assert.deepEqual(comparisonFolds({ log_scale: {}, multiple_comparisons: { comparisons: [
    { pair: "Low vs. Control", ratio: 2.8488, ratio_ci: [1.5678, 5.1763] }] } }),
  ["Low/Control = 2.85-fold (95% CI 1.57–5.18)"]);
  assert.match(logMethodsSentence(logT), /analysed on log10-transformed values; back-transformed geometric means and ratios of geometric means/);
  assert.match(logMethodsSentence(logT), /1 value ≤ 0 \(no logarithm\) was left out/);
  assert.match(logLegendClause(logT), /Treated\/Control = 2.97-fold/);
  assert.equal(logMethodsSentence({ analysis: "ttest" }), "");
});

test("sentences, methods and the test name on the log scale", () => {
  const s = resultSentences(logT)[0];
  assert.match(s, /^Treated\/Control = 2.97-fold \(95% CI 1.67–5.28\)/);
  assert.match(s, /unpaired t test on log10-transformed values, two-tailed/);
  assert.match(s, /P = 0.0021/);
  assert.equal(describeResult(logT).test, "unpaired t test on log10-transformed values");
  const anova = { analysis: "anova", kind: "parametric", log_scale: { base: "log10", n_dropped: 0 },
    table: { F: 38.05, df_between: 2, df_within: 15, p: 1.33e-6 },
    geometric_means: [{ name: "Control", geometric_mean: 14.15 }, { name: "High", geometric_mean: 119.7 }],
    multiple_comparisons: { method: "dunnett", comparisons: [{ pair: "High vs. Control",
      ratio: 8.464, ratio_ci: [4.658, 15.38], p_adjusted: 5.7e-7, p_unadjusted: 2.9e-7, family_size: 1, method: "dunnett" }],
    family: { size: 1, method: "dunnett", label: "Dunnett, 1 comparison (each of 1 groups vs. the control Control)" } } };
  const as = resultSentences(anova);
  assert.match(as[0], /one-way ANOVA on log10-transformed values/);
  assert.match(as[1], /High\/Control = 8.46-fold \(95% CI 4.66–15.4\)/);
});

test("one-click log Y axis on the graph format", () => {
  assert.equal(hasLogY({}), false);
  const f = withLogY({ y: { min: 0, max: 100, grid: true } });
  assert.deepEqual(f.y, { scale: "log10", grid: true });
  assert.equal(hasLogY(f), true);
  assert.deepEqual(withLogY({ y: { min: 1, max: 1000 } }).y, { min: 1, max: 1000, scale: "log10" });
});
