// Flow summary module: FlowJo headers, the sample-name split into donor
// and condition, the flow_summary payload, the linked column table and
// the project set-up of its statistics and SuperPlot. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDataSheet, makeGraphSheet, makeProject, makeResultsSheet } from "../../../../project/ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../../../project/prefs.ts";
import {
  conditionOrder, DEFAULT_FLOW_OPTIONS, flowPayload, flowStatsOptions, flowTable, guessBackground,
  guessPartRoles, normalizeFlowOptions, parseStatHeader, readFlow, runFlow, setupFlowOutput,
  statTitle, tableFromFlowJo, unitSingular,
} from "../model.ts";
import { FLOW_EXAMPLE_CSV, flowSample } from "../sample.ts";
import { legendFor } from "../../../../report/legendFor.ts";
import { DEFAULT_REPORT } from "../../../../report/prefs.ts";

test("FlowJo headers: gate path and statistic", () => {
  const c = parseStatHeader("Lymphocytes/Single Cells/Live/CD4+/CD69+ | Freq. of Parent", 1);
  assert.equal(c.gate, "Lymphocytes/Single Cells/Live/CD4+/CD69+");
  assert.equal(c.statistic, "Freq. of Parent");
  assert.equal(c.label, "CD69+ · Freq. of Parent");
  assert.equal(c.kind, "freq");
  assert.equal(statTitle(c), "% CD69+ (Freq. of Parent)");
  const m = parseStatHeader("Lymphocytes/CD4+/CD69+ | Median (BV421-A)");
  assert.equal(m.kind, "median");
  assert.equal(statTitle(m), "CD69+ Median (BV421-A)");
  assert.equal(parseStatHeader("Count").kind, "count");
});

test("the example: 12 samples, 3 donors × 4 conditions, % CD69+ by default", () => {
  const t = flowSample();
  assert.equal(t.datasets[0].name, "Sample");
  assert.equal(t.x.length, 12);
  const d = readFlow(t, DEFAULT_FLOW_OPTIONS);
  assert.equal(d.problem, null);
  assert.equal(d.delimiter, "_");
  assert.deepEqual(d.parts, ["experiment", "condition", "skip"]);
  assert.deepEqual(d.experiments, ["D1", "D2", "D3"]);
  assert.deepEqual(d.conditions, ["Unstim", "aCD3", "aCD3+aCD28", "PMA+Iono"]);
  assert.equal(d.stat?.label, "CD69+ · Freq. of Parent");
  assert.equal(d.stats.length, 3);
  assert.deepEqual(d.samples[0], { row: 0, sample: "D1_Unstim_001.fcs", experiment: "D1", condition: "Unstim", value: "2.1" });
  assert.match(FLOW_EXAMPLE_CSV, /\nMean,/);
});

test("part roles: donor-like part, the condition, tube numbers skipped", () => {
  assert.deepEqual(guessPartRoles([["Unstim", "Donor1", "01"], ["IL2", "Donor2", "02"]]),
    ["condition", "experiment", "skip"]);
  assert.deepEqual(guessPartRoles([["A", "x"], ["B", "y"]]), ["experiment", "condition"]);
  assert.deepEqual(guessBackground(["Unstim", "FMO CD69", "aCD3"]), { kind: "fmo", condition: "FMO CD69" });
  assert.deepEqual(guessBackground(["Isotype", "aCD3"]), { kind: "isotype", condition: "Isotype" });
  assert.deepEqual(guessBackground(["Unstim"]), { kind: "none", condition: "" });
});

test("payload: the chosen statistic, the control first, the background left out", () => {
  const t = flowSample();
  const o = normalizeFlowOptions({ statistic: "Lymphocytes/Single Cells/Live/CD4+/CD69+ | Median (BV421-A)",
    control: "aCD3", background: { kind: "fmo", condition: "Unstim" } });
  const d = readFlow(t, o);
  assert.deepEqual(conditionOrder(d, o), ["aCD3", "aCD3+aCD28", "PMA+Iono"]);
  const p = flowPayload(d, o);
  assert.equal(p.analysis, "flow_summary");
  assert.equal(p.data.records.length, 12);
  assert.deepEqual(p.data.records[1], { sample: "D1_aCD3_002.fcs", experiment: "D1", condition: "aCD3",
    gate: "Lymphocytes/Single Cells/Live/CD4+/CD69+", statistic: "Median (BV421-A)", value: "1830" });
  assert.deepEqual(p.options.background, { kind: "fmo", condition: "Unstim" });
  assert.deepEqual(p.options.experiments, ["D1", "D2", "D3"]);
  // a background condition that is not there is refused
  const bad = normalizeFlowOptions({ background: { kind: "fmo", condition: "FMO" } });
  assert.match(String(runFlow(() => ({}), t, bad).error), /FMO \/ isotype control condition/);
});

// engine flow_summary on the example (no background): values[donor][condition]
const RESULT = {
  analysis: "flow_summary", statistic: "Freq. of Parent", conditions: ["Unstim", "aCD3", "aCD3+aCD28", "PMA+Iono"],
  experiments: ["D1", "D2", "D3"],
  values: [[2.1, 18.5, 35.2, 78.4], [3.4, 24.2, 41.7, 85.1], [1.6, 14.8, 29.9, 71.6]],
  table: { datasets: [], row_titles: ["D1", "D2", "D3"] }, y_title: "% CD69+ (Freq. of Parent)", unit: "donors",
};

test("linked table: donors as rows, an experiment column and one data set per condition", () => {
  const t = flowTable(RESULT)!;
  assert.equal(t.type, "column");
  assert.deepEqual(t.rowTitles, ["D1", "D2", "D3"]);
  assert.deepEqual(t.datasets.map((d) => d.name), ["Donor", "Unstim", "aCD3", "aCD3+aCD28", "PMA+Iono"]);
  assert.deepEqual(t.datasets[0].rows.map((r) => r[0]), ["D1", "D2", "D3"]);
  assert.deepEqual(t.datasets[4].rows.map((r) => r[0]), ["78.4", "85.1", "71.6"]);
  assert.deepEqual(t.replicates, { by: "column", column: 0, unit: "donors" });
  assert.equal(t.yTitle, "% CD69+ (Freq. of Parent)");
  assert.equal(flowTable({ error: "x" }), null);
  assert.equal(unitSingular("mice"), "Mouse");
  assert.equal(unitSingular("donors"), "Donor");
  assert.equal(flowStatsOptions(2).test, "paired");
  assert.equal(flowStatsOptions(4).test, "rm_anova");
});

test("set-up: replicate-means statistics, a SuperPlot graph and n counted in donors", () => {
  const linked = makeDataSheet("t", "% CD69+ of Flow", flowTable(RESULT)!);
  let p = makeProject(projectPrefs(DEFAULT_PREFS), [linked,
    makeResultsSheet("r", "t", "column", {}, "Column stats of % CD69+ of Flow"),
    makeGraphSheet("g", "t", "r", "scatter", { titles: { x: "", y: "" } } as never, "Graph")]);
  p = setupFlowOutput(p, "t", "donors");
  const r = p.sheets.find((s) => s.id === "r")!;
  assert.equal(r.kind === "results" && r.analysis, "column_replicate_means");
  assert.equal(r.kind === "results" && (r.options as { test: string }).test, "rm_anova");
  assert.equal(r.name, "RM one-way ANOVA of % CD69+ of Flow");
  const g = p.sheets.find((s) => s.id === "g")!;
  assert.deepEqual(g.kind === "graph" && (g.settings.column as { superplot: unknown }).superplot,
    { center: "mean", error: "sd", encode: "both", link: true, on: true });
  const t = p.sheets.find((s) => s.id === "t")!;
  assert.deepEqual(t.kind === "data" && t.report, { unit: "donors", valueIs: "experiment" });
});

test("legend: n counts donors once on donor means", () => {
  const data = { ...makeDataSheet("t", "Per donor", flowTable(RESULT)!), report: { unit: "donors" } };
  const legend = legendFor({ data, table: data.table, graph: null, options: {}, prefs: DEFAULT_REPORT,
    software: "OpenDose", result: { analysis: "rm_one_way_anova", superplot: { n: 3, replicates: ["D1", "D2", "D3"] } } });
  assert.match(legend, /n = 3 donors per group\./);
  assert.doesNotMatch(legend, /independent experiments/);
});

test("import: a pasted FlowJo table becomes the input layout", () => {
  const r = tableFromFlowJo(FLOW_EXAMPLE_CSV)!;
  assert.equal(r.samples, 12);
  assert.deepEqual(r.table.datasets.map((d) => d.varType), ["categorical", "continuous", "continuous", "continuous"]);
  assert.equal(tableFromFlowJo(""), null);
});
