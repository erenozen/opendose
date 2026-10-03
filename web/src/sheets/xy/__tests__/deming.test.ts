// Deming regression payloads and result shape. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_DEMING, demingPayload, demingResult, rowPoints } from "../deming.ts";

const table = normalizeTable({
  type: "xy", x: ["1", "2", "3"],
  datasets: [{ name: "A", rows: [["2", "4"], ["3", ""], ["7", "5"]] }],
});

test("error models map to the engine's options", () => {
  const eq = demingPayload(table, DEFAULT_DEMING);
  assert.deepEqual("options" in eq && eq.options, { se_method: "prism", equal_errors: true });
  const lam = demingPayload(table, { ...DEFAULT_DEMING, errorModel: "lambda", lambda: "4", x0: "2",
    compareIdentity: true, seMethod: "jackknife" });
  assert.deepEqual("options" in lam && lam.options,
    { se_method: "jackknife", lambda: 4, x0: 2, compare_identity: true });
  const sd = demingPayload(table, { ...DEFAULT_DEMING, errorModel: "sd", sdX: "0.5", sdY: "1" });
  assert.deepEqual("options" in sd && sd.options, { se_method: "prism", sd_x: 0.5, sd_y: 1 });
  assert.ok("error" in demingPayload(table, { ...DEFAULT_DEMING, errorModel: "sd", sdX: "" }));
});

test("points are row means with SD bars; the line becomes the fitted curve", () => {
  const pts = rowPoints(table)[0];
  assert.deepEqual(pts.bars.map((b) => b.mean), [3, 3, 6]);
  assert.equal(pts.bars[1].lo, null);
  const r = demingResult({ analysis: "deming", datasets: [{ name: "A", fit: {
    slope: { value: 2, se: 0.1, ci: [1.8, 2.2] }, y_intercept: { value: 0.5, se: 0.2, ci: [0, 1] },
    x_intercept: -0.25, y_at_x0: { x0: 0, value: 0.5 }, df: 3, n: 5,
    equation: "Y = 2*X + 0.5", curve: { x: [1, 3], y: [2.5, 6.5] } } }] }, table);
  const ds = r.datasets[0];
  assert.deepEqual(ds.fit.param_order, ["Slope", "Y intercept", "X intercept"]);
  assert.equal(ds.fit.params.Slope.value, 2);
  assert.deepEqual(ds.fit.curve, { x: [1, 3], y: [2.5, 6.5] });
  assert.equal(ds.deming.df, 3);
});
