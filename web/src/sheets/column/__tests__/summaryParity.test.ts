// P-84: data entered as mean, SD and N get planned families, Holm and the
// log scale (stated as approximate); Compare a parameter takes them too.
// Engine values: engine/tests/test_summary_parity.py (reference
// engine/tests/reference/summary_parity.py). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { runColumn } from "../run.ts";
import { familyTarget } from "../comparisonsFamily.ts";
import {
  approximateLog, logLegendClause, logMethodsSentence, logScaleApplies, logScaleOptions,
} from "../logScale.ts";
import { modelMeta } from "../../../lib/modelLibrary.ts";
import { compareParameterPayload, runParameter, summaryFitOptions } from "../../xy/compareParameter.ts";
import { statsRows } from "../../../report/statsTable.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const o = (patch: Partial<ColumnOptionsState>) =>
  ({ ...DEFAULT_COLUMN_OPTIONS, ...patch } as ColumnOptionsState);

// The acceptance test: four groups entered as mean, SD, N.
const summaryTable = (fmt = "mean_sd_n") => ({
  ...normalizeTable({
    type: "column",
    datasets: [["Control", "12", "2.5", "6"], ["Low", "14.1", "3", "6"], ["Mid", "17.8", "3.6", "5"],
      ["High", "22.4", "4.9", "6"]].map(([name, m, s, n]) => ({ name, rows: [[m, s, n]] })),
  }),
  subcolumnFormat: fmt,
} as DataTableModel);

function spy() {
  const seen: any[] = [];
  return { seen, engine: { analyze: (p: any) => { seen.push(p); return { analysis: p.analysis }; } } };
}

test("planned families and the log scale apply to mean / SD / N data", () => {
  assert.equal(familyTarget(o({ analysis: "anova", comparisons: "holm" }), true), "posthoc");
  assert.equal(familyTarget(o({ analysis: "anova", comparisons: "tukey" }), true), null);
  assert.equal(familyTarget(o({ analysis: "rm_anova", comparisons: "holm" }), true), null);
  assert.equal(logScaleApplies(o({ analysis: "anova" }), true), true);
  assert.equal(logScaleApplies(o({ analysis: "ttest", ttestKind: "welch" }), true), true);
  assert.equal(logScaleApplies(o({ analysis: "anova", anovaSd: "unequal" }), true), false);
  assert.equal(logScaleApplies(o({ analysis: "rm_anova" }), true), false);
  assert.deepEqual(logScaleOptions(o({ analysis: "anova", logScale: true }), true), { log_scale: true });
});

test("the summary ANOVA payload carries the family, Holm and the log scale", () => {
  const { seen, engine } = spy();
  runColumn(engine as any, summaryTable(), o({ analysis: "anova", comparisons: "holm",
    comparisonsFamily: "control", controlIndex: 0, logScale: true }));
  assert.equal(seen[0].analysis, "anova_summary");
  assert.deepEqual(seen[0].options, { kind: "parametric", comparisons: "holm", control_index: 0,
    comparisons_family: "control", log_scale: true });
  assert.deepEqual(seen[0].data.datasets[2], { name: "Mid", rows: [[17.8, 3.6, 5]] });
  const pairs = spy();
  runColumn(pairs.engine as any, summaryTable(), o({ analysis: "anova", comparisons: "sidak",
    comparisonsFamily: "pairs", plannedPairs: [[3, 0], [2, 1]] }));
  assert.deepEqual(pairs.seen[0].options.pairs, [[3, 0], [2, 1]]);
  assert.equal(pairs.seen[0].options.comparisons_family, "pairs");
  const t = spy();
  runColumn(t.engine as any, summaryTable(), o({ analysis: "ttest", logScale: true }));
  assert.equal(t.seen[0].analysis, "ttest_summary");
  assert.equal(t.seen[0].options.log_scale, true);
});

// Engine output (anova_summary, log_scale) as the results read it.
const approx = {
  analysis: "anova", from_summary: true,
  log_scale: { base: "log10", values_dropped: {}, n_dropped: 0, approximate: true },
  geometric_means: [], multiple_comparisons: { comparisons: [] },
};

test("a log-scale result from means and SDs says it is approximate, with its source", () => {
  assert.match(approximateLog(approx), /^Approximate: computed from the entered means and SDs/);
  assert.equal(approximateLog({ ...approx, log_scale: { base: "log10" } }), "");
  const m = logMethodsSentence(approx);
  assert.match(m, /lognormal moment conversion \(Higgins, White & Anzures-Cabrera 2008, Stat Med 27:6072\), so the results are approximate\.$/);
  assert.match(logLegendClause(approx), /Approximate: estimated from means and SDs/);
  assert.doesNotMatch(logMethodsSentence({ ...approx, log_scale: { base: "log10" } }), /approximate/);
});

const xyTable = (fmt: string) => ({
  ...normalizeTable({
    type: "xy", x: ["-9", "-8", "-7", "-6"],
    datasets: [{ name: "A", rows: [["2", "1", "3"], ["20", "2", "3"], ["70", "3", "3"], ["98", "1", "3"]] },
      { name: "B", rows: [["1", "1", "3"], ["8", "2", "3"], ["45", "3", "3"], ["95", "1", "3"]] }],
  }),
  subcolumnFormat: fmt,
} as DataTableModel);

test("Compare a parameter sends a mean / SD / N table to the engine with its format", () => {
  const input = { model: modelMeta("log_agonist_vs_response_4pl"), held: {}, parameter: "logEC50",
    datasetA: 0, datasetB: 1, xIsLog: true, errorBars: "sd" };
  const p = compareParameterPayload(xyTable("mean_sd_n"), input);
  assert.equal(p.options.summary_format, "mean_sd_n");
  assert.deepEqual(summaryFitOptions(xyTable("mean_sem_n")),
    { summary_format: "mean_sem_n", replicates: "account" });
  assert.deepEqual(summaryFitOptions(xyTable("replicates")), {});
  const { seen, engine } = spy();
  const r = runParameter(engine, xyTable("mean_sd_n"), input);
  assert.equal(r.error, undefined);
  assert.equal(seen[0].analysis, "compare_parameter");
  assert.equal(seen[1].analysis, "dose_response");
  assert.equal(seen[1].options.summary_format, "mean_sd_n");
  assert.equal(seen[1].options.replicates, "account");
  // a format without N cannot be compared: say what to do
  assert.match(runParameter(engine, xyTable("mean_sd"), input).error,
    /needs N with the means \(this table is Mean, SD\): change the format to one with N/);
});

test("the statistics table notes the approximation on every row", () => {
  const result = { ...approx, kind: "parametric",
    table: { F: 9.53, df_between: 3, df_within: 19, p: 0.00047 },
    group_summaries: [{ name: "Control", n: 6 }, { name: "High", n: 6 }] };
  const entry = { sheet: "S", data: "D", analysisId: "column", analysisLabel: "One-way ANOVA", panels: [] };
  const rows = statsRows({ ...entry, result });
  assert.ok(rows.length >= 1);
  for (const r of rows) assert.match(r.note, /approximate: log scale estimated from means and SDs/);
  const plain = statsRows({ ...entry, result: { ...result, log_scale: { base: "log10" } } });
  assert.equal(plain[0].note, "");
});
