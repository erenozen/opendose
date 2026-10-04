// Linear regression payloads, the regression ANOVA table and the result
// shape. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { anovaCentred, anovaThroughOrigin, fSurvival } from "../fitStats.ts";
import {
  DEFAULT_LINREG, equationText, linregBlock, linregPayload, linregResult, normalizeLinreg,
  sumYSquared,
} from "../linreg.ts";

const close = (a: number, b: number, rel = 1e-9) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test("NIST Norris: the ANOVA table from F, SS residual and df", () => {
  // certified: F 5436385.54079785, residual SS 26.6173985294224 on 34 df
  const a = anovaCentred(5436385.54079785, 0, 26.6173985294224, 34);
  close(a.rows[0].ss, 4255954.13232369);
  close(a.rows[0].ms!, 4255954.13232369);
  close(a.rows[1].ms!, 0.782864662630069);
  assert.equal(a.rows[2].df, 35);
  close(a.rows[2].ss, 4255954.13232369 + 26.6173985294224);
});

test("NIST NoInt1: uncentred R², ANOVA and F of a line through the origin", () => {
  const x = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
  const s = sumYSquared(x, x.map((v) => [v + 70]));
  assert.equal(s.n, 11);
  const a = anovaThroughOrigin(s.sumY2, 127.272727272727, s.n);
  close(a.rows[0].ss, 200457.727272727);
  close(a.rows[1].ms!, 12.7272727272727);
  close(a.F, 15750.25);
  close(a.r2!, 0.999365492298663);
  assert.equal(a.rows[1].df, 10);
  assert.equal(a.rows[2].df, 11);
  assert.ok(a.p < 1e-15);
});

test("F distribution tail matches the engine (R cars: F 89.567 on 1, 48 df)", () => {
  close(fSurvival(89.56710653646776, 1, 48), 1.4898364962950807e-12, 1e-6);
  close(fSurvival(1, 2, 10), 0.4018775720164609, 1e-9);
  assert.equal(fSurvival(0, 1, 5), 1);
  assert.equal(fSurvival(Infinity, 1, 5), 0);
});

// R: lm(dist ~ speed, cars), as the engine reports it
const CARS_FIT = {
  n: 50, df: 48, ss_res: 11353.521051094893, sy_x: 15.379586748819909,
  slope: { value: 3.932408759124088, se: 0.41551277665712233, ci95: [3.096964328140324, 4.767853190107853] },
  y_intercept: { value: -17.57909489051096, se: 6.758440169379237, ci95: [-31.16784960238865, -3.990340178633264] },
  x_intercept: 4.470312209971417, one_over_slope: 0.25429706351858034, r_squared: 0.6510793807582509,
  f_nonzero_slope: { F: 89.56710653646776, dfn: 1, dfd: 48, p: 1.4898364962950807e-12 },
  runs_test: { n_runs: 23, p: 0.24988754146675976 },
  curve: { x: [4, 25], y: [-1.85, 80.73] },
};

test("R cars: regression block with the ANOVA table (SS regression 21186)", () => {
  const b = linregBlock({ fit: CARS_FIT }, { ...DEFAULT_LINREG, xAtY: "0, 50" })!;
  close(b.anova.rows[0].ss, 21185.45894890511, 1e-9);   // anova(lm): 21186
  close(b.anova.rows[2].ss, 21185.45894890511 + 11353.521051094893);
  assert.equal(b.anova.rows[2].df, 49);
  assert.equal(b.anova.F, 89.56710653646776);
  assert.equal(b.equation, "Y = 3.932*X - 17.58");
  close(b.xAtY[0].x!, 4.470312209971417);
  close(b.xAtY[1].x!, (50 + 17.57909489051096) / 3.932408759124088);
  assert.equal(b.runs?.n_runs, 23);
  assert.equal(linregBlock({ fit: CARS_FIT }, { ...DEFAULT_LINREG, runsTest: false })!.runs, null);
});

test("result: the line becomes the fitted curve; parameters for the results", () => {
  const t = normalizeTable({ type: "xy", x: ["4", "25"], datasets: [{ name: "dist", rows: [["2"], ["85"]] }] });
  const r = linregResult({ datasets: [{ name: "dist", fit: { ...CARS_FIT, bands: { x: [4], y: [1], lower: [0], upper: [2] } } }] },
    t, { ...DEFAULT_LINREG, bands: "confidence" });
  const ds = r.datasets[0];
  assert.deepEqual(ds.fit.curve, CARS_FIT.curve);
  assert.deepEqual(ds.fit.param_order, ["Slope", "Y intercept", "X intercept", "1/slope"]);
  assert.equal(ds.fit.goodness.r_squared, 0.6510793807582509);
  assert.deepEqual(ds.bands.lower, [0]);
  assert.deepEqual(ds.points.bars.map((b: { mean: number }) => b.mean), [2, 85]);
});

test("through the origin: dose_response with line_through_origin, uncentred R²", () => {
  const x = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
  const t = normalizeTable({ type: "xy", x: x.map(String),
    datasets: [{ name: "y", rows: x.map((v) => [String(v + 70)]) }] });
  const o = { ...DEFAULT_LINREG, throughOrigin: true };
  const p = linregPayload(t, o);
  assert.ok("options" in p && p.analysis === "dose_response"
    && p.options.model === "line_through_origin" && p.options.diagnostics === true);
  const r = linregResult({ datasets: [{ name: "y", fit: {
    params: { Slope: { value: 2.0743801652892544, se: 0.01652892561983515, ci95: [2.0376, 2.1112] } },
    goodness: { df: 10, n_points: 11, r_squared: -0.15702479338843256, ss_res: 127.27272727272758,
      sy_x: 3.567530340063383 }, curve: { x: [60, 70], y: [124.5, 145.2] } },
  diagnostics: { runs_test: { n_runs: 2, p: 0.0043 } } }] }, t, o);
  const b = r.datasets[0].linreg;
  close(b.r2, 0.999365492298663);
  close(b.r2Centred, -0.15702479338843256);
  assert.equal(b.intercept, null);
  assert.equal(b.equation, "Y = 2.074*X");
  assert.deepEqual(r.datasets[0].fit.param_order, ["Slope", "1/slope"]);
  close(b.anova.F, 15750.25, 1e-9);
});

test("options and payloads", () => {
  assert.deepEqual(normalizeLinreg({ bands: "bogus", throughOrigin: true }),
    { ...DEFAULT_LINREG, throughOrigin: true });
  const t = normalizeTable({ type: "xy", x: ["1", "2", "3"], datasets: [{ name: "A", rows: [["1"], ["2"], ["4"]] }] });
  const p = linregPayload(t, { ...DEFAULT_LINREG, bands: "prediction" });
  assert.ok("options" in p && p.analysis === "linear_regression");
  assert.deepEqual("options" in p && p.options, { bands: "prediction" });
  assert.ok("error" in linregPayload({ ...t, subcolumnFormat: "mean_sd_n" }, DEFAULT_LINREG));
  assert.equal(equationText(2, 0.5), "Y = 2*X + 0.5");
});
