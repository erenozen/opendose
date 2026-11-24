// The zero dose left of an X axis break (P-104): which rows go there, how
// the segment is laid out, and what the legend and the zero-dose note say.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_XY_OPTIONS, type AnalysisResult, type OptionsState } from "../../../types.ts";
import { addZeroSegment, zeroBreakLegend, zeroPoints, ZERO_SEGMENT } from "../zeroBreak.ts";
import { heldEverywhere, heldMethodsClause, zeroDoseOption, zeroDosePlan } from "../zeroDose.ts";

const O: OptionsState = { ...DEFAULT_XY_OPTIONS, model: "log_inhibitor_vs_response_4pl" };

// rows: 0 = vehicle (X 0), 1..2 doses; row 3 has no X at all
const ds = (name: string, vehicle: number, top: number, held?: number) => ({
  name,
  points: { x: [null, -8, -7, null], bars: [
    { mean: vehicle, lo: vehicle - 2, hi: vehicle + 2 }, { mean: 90, lo: 88, hi: 92 },
    { mean: 20, lo: 18, hi: 22 }, { mean: 55, lo: 50, hi: 60 }] },
  fit: { params: { Top: { value: top }, Bottom: { value: 5 } } },
  log_x_dropped: { n_values: 3, x_values: [0], mean_y: vehicle, rows: [0], row_x: [0] },
  ...(held !== undefined ? { zero_dose_constraint: { param: "Top", value: held, n_values: 3, x_values: [0] } } : {}),
});
const res = (...d: unknown[]) => ({ analysis: "dose_response", datasets: d }) as unknown as AnalysisResult;

test("zeroPoints: the rows the engine left out, at their entered X, with their bars", () => {
  const p = zeroPoints(res(ds("A", 100.5, 101), ds("B", 86.2, 87)));
  assert.deepEqual(p, [
    { ds: 0, row: 0, x: 0, y: 100.5, plus: 2, minus: 2 },
    { ds: 1, row: 0, x: 0, y: 86.2, plus: 2, minus: 2 },
  ]);
  // the row without an X is not a zero dose: never drawn in the segment
  assert.ok(!p.some((q) => q.row === 3));
  // older results without rows: nothing (no row is guessed)
  const old = res({ ...ds("A", 100, 100), log_x_dropped: { n_values: 3, x_values: [0], mean_y: 100 } });
  assert.deepEqual(zeroPoints(old), []);
  assert.deepEqual(zeroPoints({ error: "x" }), []);
});

const pointsTrace = (ds: number, color: string) => ({
  x: [-8, -7], y: [90, 20], mode: "markers", name: `S${ds}`,
  marker: { color, symbol: "circle", size: 9 },
  error_y: { type: "data", array: [2, 2], arrayminus: [2, 2], color, visible: true },
  meta: { odTag: { ds, role: "points", rows: [1, 2] } },
});
const fitTrace = { x: [-9, -6], y: [100, 5], mode: "lines", meta: { odTag: { ds: 0, role: "fit" } } };

test("addZeroSegment: a left segment, the points copied from their data set, break marks", () => {
  const traces = [fitTrace, pointsTrace(0, "#111111"), pointsTrace(1, "#222222")];
  const layout = { xaxis: { title: { text: "log[C]" }, linecolor: "#333333" }, yaxis: {},
    shapes: [], annotations: [] };
  const out = addZeroSegment(traces, layout, zeroPoints(res(ds("A", 100.5, 101), ds("B", 86.2, 87))),
    { zeroBreak: true }, { unit: "µM", ink: "#000000" });
  const z = out.traces.filter((t) => t.xaxis === "x3");
  assert.equal(z.length, 2);
  assert.deepEqual(z.map((t) => [t.x, t.y]), [[[0], [100.5]], [[0], [86.2]]]);
  assert.equal(z[0].marker.color, "#111111");
  assert.deepEqual(z[0].error_y.array, [2]);
  assert.deepEqual(z[0].meta.odTag.rows, [0]);
  assert.equal(z[0].showlegend, false);
  // the curve is never moved into the segment
  assert.ok(!out.traces.some((t) => t.xaxis === "x3" && t.meta?.odTag?.role === "fit"));
  const L = out.layout as Record<string, any>;
  const share = ZERO_SEGMENT * (1 - 0.035);
  assert.deepEqual(L.xaxis3.domain, [0, share]);
  assert.ok(Math.abs(L.xaxis.domain[0] - (share + 0.035)) < 1e-12 && L.xaxis.domain[1] === 1);
  assert.deepEqual(L.xaxis3.ticktext, ["0 µM"]);
  assert.equal(L.xaxis3.title, undefined);
  assert.equal(L.xaxis.title.text, "log[C]");
  assert.equal(L.yaxis.anchor, "x3");
  const marks = L.shapes.filter((s: { name: string }) => s.name.startsWith("xbreak"));
  assert.equal(marks.length, 2);
  assert.deepEqual(marks.map((m: { xanchor: number }) => m.xanchor), [share, share + 0.035]);
  assert.ok(marks.every((m: { line: { color: string } }) => m.line.color === "#333333"));
});

test("addZeroSegment: chosen share and label; a split Y axis gets the points on both segments", () => {
  const layout = { xaxis: { domain: [0.035, 1] }, yaxis: { domain: [0, 0.5] }, yaxis3: { domain: [0.55, 1], anchor: "x" } };
  const out = addZeroSegment([pointsTrace(0, "#111111")], layout,
    zeroPoints(res(ds("A", 100, 101))), { zeroBreak: true, segment: 0.25, zeroLabel: "Vehicle" },
    { unit: "", ink: "#000000" });
  const L = out.layout as Record<string, any>;
  assert.ok(Math.abs(L.xaxis3.domain[1] - (0.035 + 0.25 * 0.965 * 0.965)) < 1e-12);
  assert.deepEqual(L.xaxis3.ticktext, ["Vehicle"]);
  assert.equal(L.yaxis3.anchor, "x3");
  assert.deepEqual(out.traces.filter((t) => t.xaxis === "x3").map((t) => t.yaxis ?? "y"), ["y", "y3"]);
});

test("addZeroSegment: nothing to draw leaves the figure as it was", () => {
  const traces = [pointsTrace(0, "#111111")];
  const layout = { xaxis: {} };
  const out = addZeroSegment(traces, layout, [], { zeroBreak: true }, { unit: "", ink: "#000" });
  assert.equal(out.traces, traces);
  assert.equal(out.layout, layout);
  // a hidden data set: no copy
  const hidden = addZeroSegment([{ ...pointsTrace(0, "#111111"), visible: false }], layout,
    zeroPoints(res(ds("A", 100, 101))), { zeroBreak: true }, { unit: "", ink: "#000" });
  assert.equal(hidden.layout, layout);
});

test("legend: what the points left of the break are, and how the fit used them", () => {
  const two = res(ds("A", 100.5, 101), ds("B", 86.2, 87));
  assert.equal(zeroBreakLegend(two, O), "Points left of the break in the X axis are at X = 0, which "
    + "has no logarithm: they are not points on the curve, and the curve was fitted without them.");
  const held = res(ds("A", 100.5, 100.5, 100.5), ds("B", 86.2, 86.2, 86.2));
  const opt = { ...O, zeroDosePlateau: { param: "Top" as const, reason: "Vehicle wells" } };
  assert.equal(zeroBreakLegend(held, opt), "Points left of the break in the X axis are at X = 0, which "
    + "has no logarithm: they are not points on the curve, and each curve's Top is held at the mean "
    + "of its own wells there.");
  assert.equal(zeroBreakLegend(res(fitTrace), O), "");
});

test("several curves: hold each curve's plateau at its own wells", () => {
  const two = res(ds("A", 100.5, 101), ds("B", 86.2, 87));
  const p = zeroDosePlan(two, O)!;
  assert.equal(p.perCurve, "Top");
  assert.equal(p.active, null);
  // curves that disagree on which plateau the zero dose is: not offered
  const mixed = res(ds("A", 100.5, 101), { ...ds("B", 6, 87) });
  assert.equal(zeroDosePlan(mixed, O)!.perCurve, null);
  // a global fit cannot take it
  assert.equal(zeroDosePlan(two, { ...O, sharedParams: ["HillSlope"] })!.perCurve, null);
  // the engine option, only for a model with that plateau
  const opt = { ...O, zeroDosePlateau: { param: "Top" as const, reason: "Vehicle wells" } };
  assert.deepEqual(zeroDoseOption(opt), { zero_dose_plateau: { param: "Top" } });
  assert.deepEqual(zeroDoseOption(O), {});
  assert.deepEqual(zeroDoseOption({ ...opt, model: "michaelis_menten" }), {});
});

test("methods: each curve's held value and the stated reason", () => {
  const held = res(ds("A", 100.6667, 100.6667, 100.66666666666667), ds("B", 86.2, 86.2, 86.2));
  const opt = { ...O, zeroDosePlateau: { param: "Top" as const, reason: "Vehicle wells are no drug." } };
  const plan = zeroDosePlan(held, opt);
  assert.equal(heldMethodsClause(plan), "Top of each curve held at the mean of that data set's own "
    + "zero-dose wells (A 100.7, n = 3; B 86.2, n = 3; stated reason: Vehicle wells are no drug), "
    + "those wells not being points on the curve as X = 0 has no logarithm");
  assert.equal(heldEverywhere(plan, held), true);
  assert.equal(heldMethodsClause(zeroDosePlan(res(ds("A", 100, 101), ds("B", 86, 87)), O)), null);
});
