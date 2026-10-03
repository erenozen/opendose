// Column analysis payloads. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { columnPayload } from "../run.ts";

const table = normalizeTable({
  type: "column",
  datasets: [
    { name: "A", rows: [["1"], ["2"], ["3"]] },
    { name: "B", rows: [["4"], ["5"], ["7"]] },
  ],
});
const o = (patch: Partial<ColumnOptionsState>) => ({ ...DEFAULT_COLUMN_OPTIONS, ...patch });

test("default options send the original payloads", () => {
  assert.deepEqual(columnPayload(table, o({})).options, { hypothetical: null });
  assert.deepEqual(columnPayload(table, o({ analysis: "anova" })).options,
    { kind: "parametric", comparisons: "tukey", control_index: 0 });
  assert.deepEqual(columnPayload(table, o({ analysis: "ttest", ttestKind: "wilcoxon" })).options,
    { kind: "wilcoxon", welch: false, dataset_a: 0, dataset_b: 1 });
  assert.deepEqual(columnPayload(table, o({ analysis: "rm_anova", rmKind: "nonparametric" })).options,
    { kind: "nonparametric" });
});

test("new choices map to the engine's handlers and options", () => {
  const welch = columnPayload(table, o({ analysis: "anova", anovaSd: "unequal" }));
  assert.equal(welch.analysis, "anova_unequal_var");
  assert.deepEqual(welch.options, { comparisons: "games_howell", family: "all", control_index: 0 });
  const t3 = columnPayload(table, o({ analysis: "anova", anovaSd: "unequal",
    unequalComparisons: "dunnett_t3", unequalFamily: "control", controlIndex: 1 }));
  assert.deepEqual(t3.options, { comparisons: "dunnett_t3", family: "control", control_index: 1 });
  assert.deepEqual(columnPayload(table, o({ analysis: "anova", anovaKind: "nonparametric",
    dunnCorrected: false })).options,
  { kind: "nonparametric", comparisons: "tukey", control_index: 0, dunn_corrected: false });
  assert.equal(columnPayload(table, o({ analysis: "median_test" })).analysis, "median_test");
  assert.deepEqual(columnPayload(table, o({ analysis: "ttest", ttestKind: "kolmogorov_smirnov" })).options,
    { kind: "kolmogorov_smirnov", welch: false, dataset_a: 0, dataset_b: 1 });
  assert.deepEqual(columnPayload(table, o({ analysis: "ttest", ttestKind: "wilcoxon", zeroMethod: "pratt" })).options,
    { kind: "wilcoxon", welch: false, dataset_a: 0, dataset_b: 1, zero_method: "pratt" });
  assert.deepEqual(columnPayload(table, o({ normalityTests: ["shapiro_wilk", "kolmogorov_smirnov"],
    percentileMethod: "prism", descriptiveExtras: true, trimK: "1" })).options, {
    hypothetical: null, normality_tests: ["shapiro_wilk", "kolmogorov_smirnov"],
    percentile_method: "prism", extras: true, trim_k: 1 });
  assert.deepEqual(columnPayload(table, o({ analysis: "rm_anova", rmKind: "nonparametric", rmExact: true })).options,
    { kind: "nonparametric", exact: true });
});
