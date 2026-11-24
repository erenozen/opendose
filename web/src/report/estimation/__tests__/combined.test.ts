// The mini-meta and delta-delta on the estimation plot (P-93): options,
// payloads, the results row, methods and legend text, and the plot's
// combined column. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ESTIMATION, canCombine, columnEstimationPayload, groupedEstimationPayload, normalizeEstimation,
} from "../run.ts";
import { combinedLegend, combinedMethods, combinedRow } from "../combined.ts";
import { estimationFigure } from "../figure.ts";
import { whatIsPlotted } from "../../legend.ts";
import { legendFor } from "../../legendFor.ts";
import { tableP } from "../../pformat.ts";
import { CHROME_LIGHT } from "../../../lib/palette.ts";
import type { DataTableModel } from "../../../project/types.ts";

// The engine's result for DABEST's seeded three-repeat data
// (engine/tests/reference/estimation_minimeta.json): DABEST 2025.03.27
// gives the weighted delta -1.7409 (BCa -2.462 to -1.071); the engine's
// own BCa limits agree within Monte Carlo error.
const MM = JSON.parse(readFileSync(new URL("./minimeta-result.json", import.meta.url), "utf8"));
const PROJECT = JSON.parse(readFileSync(new URL("../../../../e2e-fixtures/stage/estimation-minimeta.json",
  import.meta.url), "utf8"));
const repeats = PROJECT.sheets[0].table as DataTableModel;

test("normalize keeps the combined effect, defaulting to none", () => {
  assert.equal(normalizeEstimation({}).combine, "none");
  assert.equal(normalizeEstimation({ combine: "mini_meta" }).combine, "mini_meta");
  assert.equal(normalizeEstimation({ combine: "pooled" }).combine, "none");
});

test("payloads: grouped tables send the combined effect; column tables only for independent pairs", () => {
  const g = groupedEstimationPayload(repeats, { ...DEFAULT_ESTIMATION, combine: "mini_meta" });
  assert.equal((g.options as Record<string, unknown>).combine, "mini_meta");
  assert.deepEqual(g.options.pairs, [[0, 1], [2, 3], [4, 5]]);
  assert.equal(g.data.datasets[0].name, "Repeat 1: Control");
  const col = { ...repeats, type: "column", rowTitles: [""], x: [""] } as unknown as DataTableModel;
  const shared = columnEstimationPayload(col, { ...DEFAULT_ESTIMATION, combine: "mini_meta" });
  assert.equal("combine" in shared.options, false);
  const multi = columnEstimationPayload(col, { ...DEFAULT_ESTIMATION, design: "multi_two_group",
    combine: "delta_delta" });
  assert.equal((multi.options as Record<string, unknown>).combine, "delta_delta");
  assert.equal(canCombine("grouped", DEFAULT_ESTIMATION), true);
  assert.equal(canCombine("column", DEFAULT_ESTIMATION), false);
});

test("results row, weights and methods of the mini-meta", () => {
  const row = combinedRow(MM.combined);
  assert.equal(row.label, "Mini-meta of 3 repeats");
  assert.equal(row.value, "-1.741");
  assert.equal(row.ci, "-2.446 to -1.092");
  assert.equal(row.p, tableP(MM.combined.permutation.p));
  assert.match(row.weights, /^Weights \(inverse pooled group variance\): Repeat 1: Drug minus Repeat 1: Control 25\.37%/);
  const m = combinedMethods(MM);
  assert.match(m, /3 independent repeats were combined into a weighted mean difference \(DABEST mini-meta/);
  assert.match(m, /95% BCa bootstrap confidence interval/);
  assert.equal(combinedMethods({}), "");
});

test("delta-delta strings: no P, the order of the subtraction", () => {
  const dd = { kind: "delta_delta", difference: 5.942460317460322, ci: [2.38, 9.73], ci_level: 0.95,
    ci_type: "bca", comparisons: [{ control: "W: Placebo", test: "W: Drug", difference: -7.365 },
      { control: "M: Placebo", test: "M: Drug", difference: -1.4225 }] };
  const row = combinedRow(dd);
  assert.equal(row.label, "(M: Drug minus M: Placebo) minus (W: Drug minus W: Placebo)");
  assert.equal(row.p, "n/a");
  assert.match(combinedMethods({ combined: dd }), /no P value is given for it/);
  assert.match(combinedLegend({ combined: dd }), /the second mean difference minus the first/);
});

test("the plot adds the weighted delta column with its CI on the difference axis", () => {
  const fig = estimationFigure({ result: MM, chrome: CHROME_LIGHT, font: "Inter", yTitle: "Response",
    color: () => "#1f77b4", symbol: () => "circle", dsOf: (g) => (g.endsWith("Drug") ? 1 : 0) });
  const dot = fig.traces.find((t: any) => t.name === "combined-effect") as any;
  assert.ok(dot);
  assert.equal(dot.yaxis, "y2");
  assert.equal(dot.y[0], MM.combined.difference);
  assert.equal(dot.y[0] - dot.error_y.arrayminus[0], MM.combined.ci[0]);
  assert.ok(Math.abs(dot.y[0] + dot.error_y.array[0] - MM.combined.ci[1]) < 1e-12);
  assert.ok(fig.traces.some((t: any) => t.name === "combined-distribution"));
  const ax = fig.layout.xaxis as any;
  assert.equal(ax.ticktext.at(-1), "Weighted delta");
  assert.ok(ax.range[1] > dot.x[0]);
  const plain = estimationFigure({ result: { ...MM, combined: undefined }, chrome: CHROME_LIGHT, font: "Inter",
    yTitle: "", color: () => "#000", symbol: () => "circle", dsOf: () => 0 });
  assert.equal(plain.traces.some((t: any) => t.name === "combined-effect"), false);
});

test("the legend names the rightmost column", () => {
  const text = whatIsPlotted("estimation", { estimation: MM });
  assert.match(text ?? "", /The rightmost column is the weighted mean difference of the independent repeats/);
});

test("the grouped estimation graph's legend is the estimation clause, not a bar legend", () => {
  const text = legendFor({ data: PROJECT.sheets[0], table: repeats, graph: PROJECT.sheets[2], result: MM,
    options: { combine: "mini_meta" }, prefs: { pStyle: "gp", hideNs: false } as never, software: "OpenDose" });
  assert.match(text, /^Upper panel: individual values/);
  assert.match(text, /The rightmost column is the weighted mean difference/);
  assert.doesNotMatch(text, /Mean ± SD \(bars\)/);
});
