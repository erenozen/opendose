// Smooth / spline (P-103): options, payload, result shape and methods.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  DEFAULT_SMOOTH, normalizeSmooth, smoothMethods, smoothPayload, smoothProblems, smoothResult, smoothRows,
} from "../smooth.ts";

const table = normalizeTable({
  type: "xy", x: ["1", "2", "3", "4"],
  datasets: [{ name: "A", rows: [["2", "4"], ["3", ""], ["7", "5"], ["8", "8"]] },
    { name: "B", rows: [["1"], [""], [""], [""]] }],
});

test("options from older or foreign files fall back to LOWESS with R's defaults", () => {
  assert.deepEqual(normalizeSmooth(undefined), DEFAULT_SMOOTH);
  assert.deepEqual(normalizeSmooth({ method: "loess", span: 3, smoothing: "x" }), DEFAULT_SMOOTH);
  assert.equal(normalizeSmooth({ method: "pchip" }).method, "pchip");
});

test("payload: blanks leave R's defaults to the engine; typed values pass through", () => {
  const p = smoothPayload(table, DEFAULT_SMOOTH);
  assert.ok("options" in p);
  assert.deepEqual(p.options, { method: "lowess" });
  const q = smoothPayload(table, { ...DEFAULT_SMOOTH, span: "0,5", iterations: "2" });
  assert.ok("options" in q);
  assert.deepEqual(q.options, { method: "lowess", span: 0.5, iterations: 2 });
  const s = smoothPayload(table, { ...DEFAULT_SMOOTH, method: "smoothing_spline", smoothing: "df", df: "4.5" });
  assert.ok("options" in s);
  assert.deepEqual(s.options, { method: "smoothing_spline", df: 4.5 });
  // GCV sends no df
  const g = smoothPayload(table, { ...DEFAULT_SMOOTH, method: "smoothing_spline", df: "4.5" });
  assert.ok("options" in g);
  assert.deepEqual(g.options, { method: "smoothing_spline" });
});

test("problems say what to enter, and only for the method in use", () => {
  assert.equal(smoothProblems({ ...DEFAULT_SMOOTH, span: "1.5" }).span,
    "Enter a fraction more than 0 and at most 1");
  assert.equal(smoothProblems({ ...DEFAULT_SMOOTH, iterations: "2.5" }).iterations,
    "Enter a whole number from 0 to 10");
  assert.equal(smoothProblems({ ...DEFAULT_SMOOTH, smoothing: "df", df: "2" }).df,
    "Enter degrees of freedom more than 2");
  const p = smoothPayload(table, { ...DEFAULT_SMOOTH, span: "0" });
  assert.deepEqual(p, { error: "Enter a fraction more than 0 and at most 1." });
  // a bad span does not block another method
  assert.ok("options" in smoothPayload(table, { ...DEFAULT_SMOOTH, method: "linear", span: "0" }));
});

const engineFit = {
  method: "smoothing_spline", label: "Smoothing spline (natural cubic, penalised)", n: 7, n_x: 4,
  interpolating: false, no_model_ci: true, notes: [], x: [1, 2, 3, 4], y_mean: [3, 3, 6, 8],
  fitted: [2.9, 3.4, 5.8, 8.0], curve: { x: [1, 2.5, 4], y: [2.9, 4.5, 8] },
  lambda: 0.012345, df: 3.21, chosen_by: "gcv", gcv: 1.5, residual_sd: 0.9, rss: 4.2,
};

test("result: the curve becomes the graph's fitted curve, with no parameters and no CI", () => {
  const r = smoothResult({ analysis: "smooth_xy", method: "smoothing_spline", no_model_ci: true,
    note: "no model-based confidence interval.", datasets: [{ name: "A", fit: engineFit },
      { name: "B", error: "A curve needs at least 2 distinct X values." }] }, table);
  assert.equal(r.no_model_ci, true);
  assert.deepEqual(r.datasets[0].fit.curve, engineFit.curve);
  assert.deepEqual(r.datasets[0].fit.params, {});
  assert.deepEqual(r.datasets[0].points.bars.map((b: { mean: number | null }) => b.mean), [3, 3, 6, 8]);
  assert.equal(r.datasets[1].error, "A curve needs at least 2 distinct X values.");
  assert.deepEqual(smoothResult({ error: "boom" }, table), { error: "boom" });
});

test("rows and methods name the smoothing and say there is no CI", () => {
  const rows = Object.fromEntries(smoothRows(engineFit));
  assert.equal(rows["Equivalent degrees of freedom"], "3.21");
  assert.equal(rows["λ (X scaled to 0 to 1)"], "0.01235");
  assert.equal(rows["Smoothness chosen by"], "GCV");
  const lw = Object.fromEntries(smoothRows({ method: "lowess", span: 2 / 3, points_per_fit: 33,
    iterations: 3, rss: 10, n: 50, n_x: 19, interpolating: false }));
  assert.equal(lw["Span f (fraction of points in each local fit)"], "0.6667");
  assert.equal(lw["Points in each local fit"], "33");
  const ip = Object.fromEntries(smoothRows({ method: "pchip", rss: 1, n: 5, n_x: 3, interpolating: true }));
  assert.equal(ip["Sum of squared residuals"], undefined);
  const text = smoothMethods({ datasets: [{ name: "A", smooth: engineFit },
    { name: "B", smooth: { ...engineFit, df: 4.5 } }] });
  assert.match(text, /A: a natural cubic smoothing spline .* 3\.21 equivalent degrees of freedom/);
  assert.match(text, /B: .* 4\.5 equivalent degrees/);
  assert.match(text, /no confidence interval is computed/);
  assert.equal(smoothMethods({ datasets: [{ name: "A", error: "x" }] }), "");
});
