import { test } from "node:test";
import assert from "node:assert/strict";
import { DENSE_POINTS, DENSE_TRACE_MIN, densify, hasWebglTraces, markerPoints } from "../dense.ts";

const pts = (n: number) => Array.from({ length: n }, (_, i) => i);

test("marker points per trace", () => {
  assert.equal(markerPoints({ y: pts(10) }), 10);                         // default scatter
  assert.equal(markerPoints({ y: pts(10), mode: "lines" }), 0);
  assert.equal(markerPoints({ y: pts(10), mode: "lines+markers", type: "scatter" }), 10);
  assert.equal(markerPoints({ y: pts(10), type: "bar" }), 0);
  assert.equal(markerPoints({ y: pts(10), type: "box", boxpoints: "all" }), 10);
  assert.equal(markerPoints({ y: pts(10), type: "box" }), 0);
  assert.equal(markerPoints({ y: new Float64Array(7), type: "violin", points: "all" }), 7);
});

test("at or below the threshold nothing changes (same array)", () => {
  const traces = [{ x: pts(DENSE_POINTS), y: pts(DENSE_POINTS), mode: "markers" }];
  const out = densify(traces);
  assert.equal(out.traces, traces);
  assert.equal(out.webgl, false);
  assert.equal(out.points, DENSE_POINTS);
});

test("above it, large marker traces draw with WebGL; lines, fits and small marks stay SVG", () => {
  const big = { x: pts(60000), y: pts(60000), mode: "markers", cliponaxis: false, meta: { ds: 0 } };
  const fit = { x: pts(200), y: pts(200), mode: "lines" };
  const mean = { x: [0], y: [5], mode: "markers", marker: { symbol: "line-ew" } };
  const band = { x: pts(400), y: pts(400), mode: "lines+markers", fill: "tonexty" };
  const spline = { x: pts(DENSE_TRACE_MIN), y: pts(DENSE_TRACE_MIN), mode: "lines+markers", line: { shape: "spline" } };
  const out = densify([big, fit, mean, band, spline]);
  assert.equal(out.webgl, true);
  const [g, f, m, b, s] = out.traces as Record<string, unknown>[];
  assert.equal(g.type, "scattergl");
  assert.equal("cliponaxis" in g, false);
  assert.deepEqual(g.meta, { ds: 0 });       // the format layer's tag survives
  assert.equal(f, fit);
  assert.equal(m, mean);
  assert.equal(b, band);                     // filled: stays SVG
  assert.equal(s, spline);                   // spline: stays SVG
  assert.equal(big.mode, "markers");         // inputs are not mutated
  assert.equal((big as Record<string, unknown>).type, undefined);
});

test("dense box and violin plots show outliers instead of every point", () => {
  const out = densify([{ type: "box", y: pts(6000), boxpoints: "all" },
    { type: "violin", y: pts(6000), points: "all" }]);
  const [b, v] = out.traces as Record<string, unknown>[];
  assert.equal(b.boxpoints, "outliers");
  assert.equal(v.points, "outliers");
  assert.equal(out.webgl, false);
});

test("hasWebglTraces reads a drawn graph", () => {
  assert.equal(hasWebglTraces({ _fullData: [{ type: "scatter" }, { type: "scattergl" }] }), true);
  assert.equal(hasWebglTraces({ _fullData: [{ type: "scatter" }] }), false);
  assert.equal(hasWebglTraces(null), false);
});
