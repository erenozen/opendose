// The drawn curve's range (P-52): the curve split at the ends of the data
// (the parts beyond drawn dotted), the engine options built from the
// typed fields, and the legend sentence that says what the dots are.
import { test } from "node:test";
import assert from "node:assert/strict";
import { beyondData, curveOptions, splitCurve } from "../curveRange.ts";
import { fitLegendClause } from "../fitLegend.ts";
import { DEFAULT_XY_GRAPH } from "../fitGraph.ts";
import { normalizeTable } from "../../../project/table.ts";

const curve = { x: [-11, -10, -9, -7, -5, -4.5], y: [100, 99, 98, 50, 2, 1], data_range: [-9, -5] as [number, number] };

test("the curve splits at the data's ends, each part sharing its end point", () => {
  const s = splitCurve(curve);
  assert.deepEqual(s.within, { x: [-9, -7, -5], y: [98, 50, 2] });
  assert.deepEqual(s.beyond, [{ x: [-11, -10, -9], y: [100, 99, 98] }, { x: [-5, -4.5], y: [2, 1] }]);
  assert.equal(beyondData(curve), true);
});

test("without a range the curve is drawn whole, as before", () => {
  const plain = { x: [1, 2, 3], y: [4, 5, 6] };
  const s = splitCurve(plain);
  assert.equal(s.within.x, plain.x);
  assert.equal(s.within.y, plain.y);
  assert.deepEqual(s.beyond, []);
  assert.equal(beyondData(plain), false);
  assert.equal(beyondData(null), false);
  // a range inside the data: nothing beyond it
  assert.equal(beyondData({ x: [-8, -7, -6], y: [1, 2, 3], data_range: [-9, -5] }), false);
});

test("engine options from the typed fields; blanks keep the default curve", () => {
  assert.deepEqual(curveOptions({}), {});
  assert.deepEqual(curveOptions({ curveFrom: "", curveTo: " ", curvePoints: "" }), {});
  assert.deepEqual(curveOptions({ curveFrom: "-11" }), { curve_range: [-11, null] });
  assert.deepEqual(curveOptions({ curveTo: "-4,5", curvePoints: "500" }),
    { curve_range: [null, -4.5], curve_points: 500 });
});

test("the legend says the dotted part is the model's extrapolation", () => {
  const t = normalizeTable({ type: "xy", x: ["1e-9"], datasets: [{ name: "A", rows: [["1"]] }] });
  const fit = { label: "log(inhibitor) vs. response -- Variable slope (four parameters)", weighting: "none", curve };
  const text = fitLegendClause(t, { analysis: "dose_response", datasets: [{ name: "A", fit }] },
    { errorBars: "sd" }, DEFAULT_XY_GRAPH);
  assert.ok(text.includes("model fitted to every replicate value, unweighted. Beyond the X values tested "
    + "the curve is dotted: there it is the model's extrapolation, not a measurement."), text);
  const inside = fitLegendClause(t, { analysis: "dose_response", datasets: [{ name: "A",
    fit: { ...fit, curve: { x: [1, 2], y: [1, 2] } } }] }, { errorBars: "sd" }, DEFAULT_XY_GRAPH);
  assert.ok(!inside.includes("dotted"), inside);
});
