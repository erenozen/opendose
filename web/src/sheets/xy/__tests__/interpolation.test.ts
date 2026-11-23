// Interpolated unknowns (P-22): the engine's interpolation block read into
// the typeset rows and the graph markers. The numbers are the BCA
// reference (engine/tests/reference/interpolate_unknowns.json: statsmodels
// OLS quadratic and investr's inversion intervals), the shape the engine
// returns (engine/tests/test_interpolate_unknowns.py pins the same).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpolationTable, rangeText, unknownMarkers } from "../interpolation.ts";
import { fitLegendClause } from "../fitLegend.ts";
import { DEFAULT_XY_GRAPH } from "../fitGraph.ts";
import { normalizeTable } from "../../../project/table.ts";

const REF = JSON.parse(readFileSync(new URL(
  "../../../../../engine/tests/reference/interpolate_unknowns.json", import.meta.url), "utf8"));
const bca = REF.bca;

const items = bca.results.map((u: Record<string, unknown>, i: number) => (i < 3
  ? { ...u, source: "row", row: 7 + i, sub: 0, m: 1, crossings: 1 }
  : { ...u, source: "typed", index: i - 3, m: 1, crossings: u.x === null ? 0 : 1,
    ...(u.x === null ? { side: "above" } : {}) }));
const result = {
  analysis: "dose_response",
  datasets: [{ name: "BCA", interpolation: {
    ci_level: 0.95, x_is_log: false, data_range: [0, 2000], search_range: [-1000, 3000],
    prediction: true, items } }],
};
const table = { rowTitles: ["", "", "", "", "", "", "", "Sample 1", "", "Sample 3"],
  datasets: [{ rows: Array.from({ length: 10 }, () => [""]) }] };

test("acceptance: three unknowns with X, 95% CI and prediction interval", () => {
  const t = interpolationTable(result, table)!;
  assert.equal(t.xIsLog, false);
  assert.equal(t.prediction, true);
  const [a, b, c] = t.rows;
  assert.deepEqual([a.unknown, b.unknown, c.unknown], ["Sample 1", "Row 9", "Sample 3"]);
  assert.deepEqual([a.y, a.x, a.ci, a.pi], ["0.42", "373", "368.6 to 377.3", "362.8 to 383.2"]);
  assert.deepEqual([b.x, b.ci], ["811.4", "804.5 to 818.4"]);
  assert.deepEqual([c.x, c.ci], ["1574", "1565 to 1583"]);
  assert.ok([a, b, c].every((r) => r.position === "within" && r.note === "" && r.conc === null));
});

test("outside the standards: flagged, never a plain number", () => {
  const t = interpolationTable(result, table)!;
  const [up, down, none] = t.rows.slice(3);
  assert.equal(up.unknown, "Typed Y 1");
  assert.equal(up.position, "extrapolated");
  assert.equal(up.x, "2417");
  assert.match(up.note, /^Extrapolated: X lies outside the standards \(0 to 2000\)/);
  assert.equal(down.position, "extrapolated");
  assert.equal(down.x, "-56.93");
  assert.equal(none.position, "none");
  assert.deepEqual([none.x, none.ci, none.pi], ["—", "—", "—"]);
  assert.equal(none.note, "Not reached: Y is above every value the curve takes, so it has no X.");
});

test("log-X models show the concentration; replicates and repeats are named", () => {
  const log = { analysis: "dose_response", datasets: [{ name: "A", interpolation: {
    x_is_log: true, prediction: false, data_range: [-9, -5.5], items: [
      { source: "row", row: 8, sub: 1, y: 50, x: -7.2, x_conc: 10 ** -7.2,
        ci: [-7.3, -7.1], ci_conc: [10 ** -7.3, 10 ** -7.1], pi: null, position: "within", crossings: 2 }] } }] };
  const t = interpolationTable(log, { rowTitles: [], datasets: [{ rows: [["", ""]] }] })!;
  const r = t.rows[0];
  assert.equal(t.xIsLog, true);
  assert.equal(t.prediction, false);
  assert.equal(r.unknown, "Row 9, replicate 2");
  assert.equal(r.x, "-7.2");
  assert.equal(r.conc, "6.310e-8");
  assert.equal(r.ci, "5.012e-8 to 7.943e-8");
  assert.equal(r.pi, "n/a");
  assert.match(r.note, /reaches this Y 2 times; the first inside the standards is reported\.$/);
});

test("open CI limits read (very wide); nothing to show gives null", () => {
  assert.equal(rangeText([null, 3.5]), "(very wide) to 3.5");
  assert.equal(rangeText(null), "n/a");
  assert.equal(interpolationTable({ analysis: "dose_response", datasets: [{ name: "A" }] }), null);
  assert.equal(interpolationTable({ error: "x" }), null);
});

test("markers sit at (X, Y) with the CI as horizontal bars; none without an X", () => {
  const m = unknownMarkers(result);
  assert.equal(m.length, 5);
  const a = m[0];
  assert.equal(a.x, bca.results[0].x);
  assert.equal(a.y, 0.42);
  assert.ok(Math.abs(a.minus - (bca.results[0].x - bca.results[0].ci[0])) < 1e-9);
  assert.ok(Math.abs(a.plus - (bca.results[0].ci[1] - bca.results[0].x)) < 1e-9);
  assert.equal(a.label, "Row 8");
  assert.deepEqual(m.map((k) => k.extrapolated), [false, false, false, true, true]);
  assert.deepEqual(unknownMarkers(null), []);
});

test("the figure legend names the unknowns' marks; nothing without them", () => {
  const t = normalizeTable({ type: "xy", x: ["0", "125"], datasets: [{ name: "BCA", rows: [["0.1"], ["0.2"]] }] });
  const fit = { label: "Second order polynomial", weighting: "none" };
  const withFit = { ...result, datasets: [{ ...result.datasets[0], fit }] };
  const text = fitLegendClause(t, withFit, { errorBars: "sd" }, DEFAULT_XY_GRAPH);
  assert.ok(text.endsWith("Open diamonds mark 5 unknowns read off the curve at their measured Y, with "
    + "horizontal bars for the 95% CI of X (2 beyond the standards, extrapolated)."), text);
  const plain = fitLegendClause(t, { analysis: "dose_response", datasets: [{ name: "BCA", fit }] },
    { errorBars: "sd" }, DEFAULT_XY_GRAPH);
  assert.ok(!plain.includes("diamonds"), plain);
});
