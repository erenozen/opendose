// The Schild plot's reading of the engine result (schild.ts, P-49): the
// results card's numbers, the slope sentence and the linked XY table.
// Reference: engine/tests/reference/schild_plot.py (statsmodels OLS).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readSchild, schildTable, slopeSentence } from "../schild.ts";

const REF = JSON.parse(readFileSync(new URL("../../../../../engine/tests/reference/schild_example.json",
  import.meta.url), "utf8"));
const o = REF.ols;
const names = REF.data.names as string[];

/** The engine's schild_plot for the example, built from the reference. */
const engineResult = (over: Record<string, unknown> = {}) => ({
  analysis: "dose_response", datasets: [],
  schild_plot: {
    control: "Control", control_log_ec50: REF.parallel.log_ec50[0], shared: {},
    points: REF.dose_ratio.map((dr: number, i: number) => ({
      name: names[i + 1], antagonist: REF.data.antagonist[i + 1], log_antagonist: REF.log_antagonist[i],
      log_ec50: REF.parallel.log_ec50[i + 1], dose_ratio: dr, included: true,
      log_dr_minus_1: REF.log_dr_minus_1[i] })),
    regression: { n: 5, df: 3, slope: o.slope, intercept: o.intercept, slope_ci95: o.slope_ci95,
      slope_ci_includes_1: true, p_slope_1: o.p_slope_1, pA2_from_plot: o.pA2_from_plot,
      r_squared: o.r_squared },
    ...over,
  },
});

test("results card: the engine's numbers at 4 significant digits", () => {
  const v = readSchild(engineResult())!;
  assert.equal(v.slope, "1.05");
  assert.equal(v.slopeCI, "0.9459 to 1.155");
  assert.equal(v.pA2Plot, "7.425");
  assert.equal(v.r2, "0.9971");
  assert.equal(v.pSlope1, "0.2229");
  assert.deepEqual(v.rows.map((r) => r.doseRatio), ["1.707", "3.796", "12", "30.87", "334.5"]);
  assert.equal(v.rows[0].name, "3e-08 M");
  assert.equal(v.points.length, 5);
  assert.equal(slopeSentence(v), "Slope 1.05 (95% CI 0.9459 to 1.155): the interval includes 1, "
    + "as simple competitive antagonism predicts.");
});

test("not an EC50-shift fit: nothing; an engine error: the reason, no line", () => {
  assert.equal(readSchild({ analysis: "dose_response", datasets: [] }), null);
  assert.equal(readSchild(null), null);
  const v = readSchild({ schild_plot: { error: "A Schild plot needs exactly one curve without antagonist." } })!;
  assert.equal(v.error, "A Schild plot needs exactly one curve without antagonist");
  assert.equal(v.slope, undefined);
  assert.equal(schildTable({ schild_plot: { error: "x" } }), null);
});

test("a slope whose CI excludes 1 is said so; two points have no CI", () => {
  const ex = readSchild(engineResult({ regression: { n: 4, df: 2, slope: 0.62, intercept: 4,
    slope_ci95: [0.5, 0.74], slope_ci_includes_1: false } }))!;
  assert.match(slopeSentence(ex), /excludes 1, which simple competitive antagonism does not predict/);
  const two = readSchild(engineResult({ regression: { n: 2, df: 0, slope: 1.1, intercept: 8,
    slope_ci95: null, slope_ci_includes_1: null } }))!;
  assert.equal(two.slopeCI, null);
  assert.match(slopeSentence(two), /from 2 points: no confidence interval/);
});

test("a curve not shifted right is listed with its reason and left out of the table", () => {
  const r = engineResult();
  const pts = (r.schild_plot.points as Record<string, unknown>[]);
  pts[0] = { ...pts[0], dose_ratio: 0.97, included: false, log_dr_minus_1: undefined,
    reason: "dose ratio of 1 or less: the curve is not shifted right, so log(DR - 1) is undefined" };
  const v = readSchild(r)!;
  assert.equal(v.rows[0].included, false);
  assert.equal(v.rows[0].y, "n/a");
  assert.equal(v.points.length, 4);
  assert.equal(schildTable(r)!.x.length, 4);
});

test("linked XY table: X = log[B], Y = log(DR - 1), the engine's full digits, rows named", () => {
  const t = schildTable(engineResult())!;
  assert.equal(t.type, "xy");
  assert.deepEqual(t.x, REF.log_antagonist.map(String));
  assert.deepEqual(t.datasets[0].rows.map((row) => row[0]), REF.log_dr_minus_1.map(String));
  assert.deepEqual(t.rowTitles, names.slice(1));
  assert.equal(t.yTitle, "log(DR − 1)");
});
