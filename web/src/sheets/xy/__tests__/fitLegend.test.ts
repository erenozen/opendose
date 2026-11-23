// The figure legend of a curve-fit graph (fitLegend.ts) on engine fits
// made by engine/tests/reference/fit_graph.py. The wording is scientific
// output (ruling 10): these strings are pinned. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { DEFAULT_XY_GRAPH } from "../fitGraph.ts";
import {
  fitCaption, fitLegendClause, modelWords, weightingWords, xyN,
} from "../fitLegend.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "fitGraph.fixtures.json"), "utf8"));

const X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
const rows = X.map((_, r) => (r === 4 ? ["30.0", "48.7", "50.9"] : ["50", "50", "50"]));
const table: DataTableModel = normalizeTable({ type: "xy", x: X, xUnit: "M",
  datasets: [{ name: "Drug A", rows }] });

const ACCEPT = "Points show the mean of the replicates with error bars showing the standard "
  + "deviation (SD). The curve is the log(inhibitor) vs. response, variable slope (four "
  + "parameters) model fitted to every replicate value, weighted by 1/Y²; the shaded band is its "
  + "95% confidence band. ROUT (Q = 1%) removed 1 point from the fit, drawn as × "
  + "(Drug A, X = -7, Y = 30).";

test("P-24 acceptance: model, what was fitted and weighting, band, ROUT, in that order", () => {
  const text = fitLegendClause(table, ref.cases.legend_4pl,
    { errorBars: "sd", bands: "confidence" }, DEFAULT_XY_GRAPH);
  assert.equal(text, ACCEPT);
  const at = (s: string) => text.indexOf(s);
  assert.ok(at("log(inhibitor)") < at("weighted by 1/Y²"));
  assert.ok(at("weighted by 1/Y²") < at("95% confidence band"));
  assert.ok(at("95% confidence band") < at("ROUT"));
});

test("unweighted fit, no band, no ROUT; prediction band", () => {
  assert.equal(fitLegendClause(table, ref.cases.relative_4pl, { errorBars: "sem" }, DEFAULT_XY_GRAPH),
    "Points show the mean of the replicates with error bars showing the standard error of the "
    + "mean (SEM). The curve is the log(inhibitor) vs. response, variable slope (four parameters) "
    + "model fitted to every replicate value, unweighted.");
  const pred = fitLegendClause(table, ref.cases.legend_4pl, { bands: "prediction" }, DEFAULT_XY_GRAPH);
  assert.ok(pred.includes("; the shaded band is its 95% prediction band (where 95% of new values "
    + "are expected)."), pred);
});

test("ROUT with no outlier says so; drop lines follow the fit", () => {
  const r = structuredClone(ref.cases.legend_4pl);
  r.datasets[0].rout.outliers = [];
  r.datasets[0].rout.n_outliers = 0;
  assert.ok(fitLegendClause(table, r, {}, DEFAULT_XY_GRAPH).endsWith("ROUT (Q = 1%) found no outliers."));
  const withLines = fitLegendClause(table, ref.cases.extrapolated, {},
    { ...DEFAULT_XY_GRAPH, dropLines: true });
  assert.ok(withLines.endsWith("unweighted. No IC50 lines for Drug A: the IC50 lies above the "
    + "highest concentration tested."), withLines);
});

test("summary data: the means with SD and n, or the means only", () => {
  const sum = normalizeTable({ type: "xy", x: ["1", "2"], subcolumnFormat: "mean_sd_n",
    datasets: [{ name: "A", rows: [["1", "0.1", "3"], ["2", "0.2", "3"]] }] });
  assert.ok(fitLegendClause(sum, ref.cases.relative_4pl, {}, DEFAULT_XY_GRAPH)
    .includes("fitted to the entered means, SDs and n (the same fit as to every replicate value)"));
  assert.ok(fitLegendClause(sum, ref.cases.relative_4pl, { summaryReplicates: "means_only" },
    DEFAULT_XY_GRAPH).includes("fitted to the means only (one point per X value)"));
});

test("nothing to say without a fitted curve", () => {
  assert.equal(fitLegendClause(table, null, {}, DEFAULT_XY_GRAPH), "");
  assert.equal(fitLegendClause(table, { error: "x" }, {}, DEFAULT_XY_GRAPH), "");
  assert.equal(fitLegendClause(table, { datasets: [{ name: "A", error: "no fit" }] }, {},
    DEFAULT_XY_GRAPH), "");
  assert.equal(fitCaption(table, null, {}, DEFAULT_XY_GRAPH), "");
});

test("words: model label, weighting, n per X value, the caption", () => {
  assert.equal(modelWords("log(inhibitor) vs. response -- Variable slope (four parameters)"),
    "log(inhibitor) vs. response, variable slope (four parameters)");
  assert.equal(modelWords("Absolute IC50, X is log(concentration)"),
    "Absolute IC50 (X is log(concentration))");
  assert.equal(modelWords("Michaelis-Menten"), "Michaelis-Menten");
  assert.equal(weightingWords("none"), "unweighted");
  assert.equal(weightingWords("1/Y^1.5"), "weighted by 1/Y^1.5");
  assert.equal(weightingWords("1/SD2"), "weighted by 1/SD²");
  assert.equal(xyN(table), "n = 3 replicates per X value");
  assert.equal(fitCaption(table, ref.cases.legend_4pl, { bands: "confidence" }, DEFAULT_XY_GRAPH),
    `${ACCEPT} n = 3 replicates per X value.`);
});
