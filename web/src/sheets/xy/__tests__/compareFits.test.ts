// Comparison of fits: the F test / AICc arithmetic of one curve vs
// separate curves (against the engine's nlfit.compare_fits_f_test and
// compare_fits_aicc), the pooled data, and the payloads. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { aicc, compareAicc, extraSumOfSquaresF } from "../fitStats.ts";
import {
  DEFAULT_COMPARE, constraintValues, globalComparison, meanPoints, normalizeCompare, pooledData,
  preferred, runCompare,
} from "../compareFits.ts";
import { modelMeta } from "../../../lib/modelLibrary.ts";
import { numericData } from "../../../project/table.ts";

const close = (a: number, b: number, rel = 1e-9) =>
  assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${a} vs ${b}`);

test("one curve vs separate curves: F and AICc as the engine computes them", () => {
  // engine: global_fit shared = all (2901.85 on 50 df) vs shared = [] (two
  // data sets, 59.58 and 71.89 on 23 df each), 54 points
  const c = globalComparison({ ss: 2901.854610161075, df: 50, n: 54 },
    [{ ss: 59.5816108750661, df: 23, n: 27 }, { ss: 71.8855989377812, df: 23, n: 27 }]);
  assert.deepEqual(c.models.map((m) => [m.df, m.k]), [[50, 4], [46, 8]]);
  close(c.models[1].ss, 131.46720981284733);
  assert.equal(c.f!.dfn, 4);
  assert.equal(c.f!.dfd, 46);
  close(c.f!.F, 242.3376532396083);
  close(c.f!.p, 2.8326654188601987e-30, 1e-5);
  close(c.aicc.aicc1, 226.392549430459);
  close(c.aicc.aicc2, 70.13867371280656);
  close(c.aicc.delta, -156.25387571765245);
  assert.equal(c.aicc.prefer, 2);
  close(c.aicc.probability1, 1.174632465059531e-34, 1e-6);
  assert.deepEqual(preferred({ name: "x", ...c }, "both"), { by: "f", model: 2 });
});

test("3PL vs 4PL on one data set (engine compare_fits: F 7.603, P 0.0112)", () => {
  const f = extraSumOfSquaresF(79.27765756791614, 24, 59.5816108750661, 23)!;
  close(f.F, 7.603169288011439);
  close(f.p, 0.011213363492872741, 1e-7);
  const a = compareAicc(79.27765756791614, 3, 59.5816108750661, 4, 27);
  close(a.aicc1, 38.900407704282635);
  close(a.probability2, 0.9118347456007152);
  assert.equal(extraSumOfSquaresF(1, 20, 2, 20), null);       // not nested by df
  assert.equal(aicc(1, 4, 3), Infinity);                      // n - K - 1 <= 0
  // the simpler model wins when P >= 0.05; AICc only ignores the F test
  const row = { name: "A", f: { F: 1, dfn: 1, dfd: 20, p: 0.23, simpler: 1 as const },
    aicc: { ...a, prefer: 2 as const } };
  assert.deepEqual(preferred(row, "f"), { by: "f", model: 1 });
  assert.deepEqual(preferred(row, "aicc"), { by: "aicc", model: 2 });
});

test("pooled data stack the data sets under one X column", () => {
  const p = pooledData({ x: [1, 2], datasets: [{ name: "A", ys: [[1], [2]] }, { name: "B", ys: [[3], [4]] }] });
  assert.deepEqual(p.x, [1, 2, 1, 2]);
  assert.deepEqual(p.datasets[0].ys, [[1], [2], [3], [4]]);
});

test("options, constraints and points on the models' X scale", () => {
  assert.deepEqual(normalizeCompare({ mode: "global", method: "x" }),
    { ...DEFAULT_COMPARE, mode: "global" });
  const m = modelMeta("log_inhibitor_vs_response_4pl");
  assert.deepEqual(constraintValues(m, { HillSlope: { enabled: true, value: "-1" },
    Top: { enabled: false, value: "100" }, Bogus: { enabled: true, value: "1" } }), { HillSlope: -1 });
  const t = normalizeTable({ type: "xy", x: ["1e-9", "1e-8", "0"],
    datasets: [{ name: "A", rows: [["1", "3"], ["5", ""], ["2", "2"]] }] });
  const pts = meanPoints(t, true)[0];
  assert.deepEqual(pts.x, [-9, -8, null]);
  assert.deepEqual(pts.bars.map((b) => b.mean), [2, 5, 2]);
});

test("payloads: compare_fits per data set; pooled and separate dose_response", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "2", "3", "4"],
    datasets: [{ name: "A", rows: [["1"], ["2"], ["3"], ["5"]] }, { name: "B", rows: [["2"], ["3"], ["5"], ["8"]] }] });
  const calls: any[] = [];
  const fit = (ss: number, df: number, n: number) => ({ goodness: { ss_res: ss, df, n_points: n },
    curve: { x: [1, 4], y: [1, 5] }, params: {} });
  const engine = { analyze: (p: any) => {
    calls.push(p);
    if (p.analysis === "compare_fits") {
      return { model_1: fit(4, 2, 4), model_2: fit(1, 1, 4),
        f_test: { F: 2, dfn: 1, dfd: 1, p: 0.4, simpler_model: 1 },
        aicc: { aicc_1: 1, aicc_2: 2, delta: 1, probability_1: 0.6, probability_2: 0.4, prefer: 1 } };
    }
    const n = p.data.datasets.length;
    return { datasets: p.data.datasets.map((d: any) => ({ name: d.name, points: {},
      fit: n === 1 && d.name === "All data sets" ? fit(10, 6, 8) : fit(2, 2, 4) })) };
  } };
  const o = { ...DEFAULT_COMPARE, model1: "straight_line", model2: "polynomial_second" };
  const r = runCompare(engine, t, o);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.options.dataset), [0, 1]);
  assert.equal(calls[0].options.model_1.model, "straight_line");
  assert.equal(r.rows[0].f.simpler, 1);
  assert.deepEqual(r.datasets[0].altCurves[0].curve, { x: [1, 4], y: [1, 5] });

  calls.length = 0;
  const g = runCompare(engine, t, { ...o, mode: "global" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].data.x, [...numericData(t).x, ...numericData(t).x]);
  assert.deepEqual(g.rows[0].models.map((m: any) => [m.ss, m.df, m.k]), [[10, 6, 2], [4, 4, 4]]);
  assert.ok(g.datasets[0].altCurves && !g.datasets[1].altCurves);

  assert.match(runCompare(engine, t, { ...o, model2: "log_inhibitor_vs_response_4pl" }).error,
    /read X the same way/);
  assert.match(runCompare(engine, t, { ...o, model2: "straight_line" }).error, /the same/);
});
