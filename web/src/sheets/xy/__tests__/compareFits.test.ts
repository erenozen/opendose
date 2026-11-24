// Comparison of fits: the F test / AICc arithmetic of one curve vs
// separate curves (against the engine's nlfit.compare_fits_f_test and
// compare_fits_aicc), the pooled data, and the payloads. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { aicc, compareAicc, extraSumOfSquaresF } from "../fitStats.ts";
import {
  DEFAULT_COMPARE, comparable, comparableInModels, comparableModels, compareWeighting,
  compareWeightingSentence, constraintValues, fitSS, isGlobalModel, nestingSentence, sideMeta, titleConstants,
  globalComparison, meanPoints, normalizeCompare, pooledData, preferred, runCompare,
} from "../compareFits.ts";
import { applyModelList, modelMeta } from "../../../lib/modelLibrary.ts";
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

test("weighting: kept by normalizeCompare, sent to every fit, weighted SS in the table", () => {
  assert.equal(normalizeCompare({}).weighting, "none");
  assert.equal(normalizeCompare({ weighting: "1/Y2" }).weighting, "1/Y2");
  assert.equal(normalizeCompare({ weighting: "bogus" }).weighting, "none");
  assert.equal(normalizeCompare({ weighting: "1/YK", weightK: 2.5 }).weightK, 2.5);
  assert.equal(normalizeCompare({ weighting: "1/YK", weightK: 50 }).weightK, undefined);
  assert.deepEqual(compareWeighting({ weighting: "none" }), {});
  assert.deepEqual(compareWeighting({ weighting: "1/SD2" }), { weighting: "1/SD2" });
  assert.deepEqual(compareWeighting({ weighting: "1/YK", weightK: 2.5 }), { weighting: "1/Y^2.5" });
  assert.equal(fitSS({ ss_res: 5, ss_res_weighted: 0.2 }), 0.2);
  assert.equal(fitSS({ ss_res: 5, ss_res_weighted: null }), 5);
  assert.equal(fitSS({ ss_res: 5 }), 5);
  assert.equal(compareWeightingSentence({ weighting: "none" }), "");
  assert.match(compareWeightingSentence({ weighting: "1/Y2" }),
    /^Every fit was weighted by 1\/Y² \(relative distance\), and the fits were compared on their weighted sums of squares\.$/);

  const t = normalizeTable({ type: "xy", x: ["1", "2", "3", "4"],
    datasets: [{ name: "A", rows: [["1"], ["2"], ["3"], ["5"]] }, { name: "B", rows: [["2"], ["3"], ["5"], ["8"]] }] });
  const calls: any[] = [];
  const fit = (ss: number, w: number, df: number, n: number) => ({
    goodness: { ss_res: ss, ss_res_weighted: w, df, n_points: n },
    curve: { x: [1, 4], y: [1, 5] }, params: {} });
  const engine = { analyze: (p: any) => {
    calls.push(p);
    if (p.analysis === "compare_fits") {
      return { model_1: fit(4, 0.4, 2, 4), model_2: fit(1, 0.1, 1, 4), notes: ["weighted SS used"],
        f_test: { F: 2, dfn: 1, dfd: 1, p: 0.4, simpler_model: 1 },
        aicc: { aicc_1: 1, aicc_2: 2, delta: 1, probability_1: 0.6, probability_2: 0.4, prefer: 1 } };
    }
    const n = p.data.datasets.length;
    return { datasets: p.data.datasets.map((d: any) => ({ name: d.name, points: {},
      fit: n === 1 && d.name === "All data sets" ? fit(10, 1.0, 6, 8) : fit(2, 0.2, 2, 4) })) };
  } };
  const o = { ...DEFAULT_COMPARE, model1: "straight_line", model2: "polynomial_second",
    weighting: "1/Y2" as const };
  const r = runCompare(engine, t, o);
  assert.equal(calls[0].options.model_1.weighting, "1/Y2");
  assert.equal(calls[0].options.model_2.weighting, "1/Y2");
  assert.deepEqual(r.rows[0].models.map((m: any) => m.ss), [0.4, 0.1]);
  assert.equal(r.weighted, true);
  assert.deepEqual(r.notes, ["weighted SS used"]);

  calls.length = 0;
  const g = runCompare(engine, t, { ...o, mode: "global" });
  assert.ok(calls.every((c) => c.options.weighting === "1/Y2"));
  assert.deepEqual(g.rows[0].models.map((m: any) => m.ss), [1.0, 0.4]);
  assert.equal(g.weighted, true);

  calls.length = 0;
  const u = runCompare(engine, t, { ...o, weighting: "none" });
  assert.equal("weighting" in calls[0].options.model_1, false);
  assert.equal(u.weighted, false);
});

// ------------------------------------------------ P-99: global and user models

const entry = (id: string, params: string[], extra: Record<string, unknown> = {}) => ({
  id, label: id.replace(/_/g, " "), family: "Enzyme inhibition", equation: "Y=...", parameters: params,
  has_log_x: false, x_label: "[Substrate]", ...extra,
});

test("nesting sentences say when the F test applies", () => {
  assert.equal(nestingSentence({ status: "nested", simpler: 1,
    reason: "noncompetitive inhibition is mixed-model inhibition with Alpha = 1" }),
  "Nested: noncompetitive inhibition is mixed-model inhibition with Alpha = 1, so the F test "
    + "applies (GraphPad curve-fitting guide, “Comparing models”).");
  assert.match(nestingSentence({ status: "not_nested", simpler: null, reason: "x" }),
    /^Not nested: x\. The F test does not apply; compare the models by AICc/);
  assert.match(nestingSentence({ status: "unknown", simpler: null, reason: "y." }),
    /^Nesting not checked: y\. The F test is valid only if/);
});

test("data-set constants come from the titles, with a next step when one is missing", () => {
  assert.deepEqual(titleConstants(["I"], ["0", "I = 6.25 uM", "12.5"]).values, { I: [0, 6.25, 12.5] });
  const bad = titleConstants(["I"], ["0", "Control"]);
  assert.match(bad.error!, /^Put the value of I in the title of data set “Control”/);
  assert.deepEqual(titleConstants([], ["x"]), { values: {} });
});

test("a user equation as a model: metadata, payload and options kept", () => {
  const def = { id: "eq1", name: "My competitive", text: "Y=Vmax*X/(Km*(1+I/Ki)+X)", xIsLog: false,
    rules: { Vmax: { kind: "rule", value: "1", op: "*", of: "YMAX" },
      Km: { kind: "value", value: "10", op: "*", of: "YMAX" },
      Ki: { kind: "value", value: "20", op: "*", of: "YMAX" },
      I: { kind: "value", value: "0", op: "*", of: "YMAX" } },
    constraints: { Vmax: { kind: "shared", value: "", min: "", max: "" },
      I: { kind: "column", value: "", min: "", max: "" } },
    transforms: [] } as any;
  const o = normalizeCompare({ model1: "user", userEquation1: def, model2: "user", userEquation2: null });
  assert.equal(o.userEquation1?.name, "My competitive");
  assert.equal(o.userEquation2, undefined);
  const m = sideMeta(o, 1);
  assert.equal(m.label, "My competitive");
  assert.deepEqual(m.datasetConstants, ["I"]);
  assert.deepEqual(m.shared, ["Vmax"]);
  assert.deepEqual(m.constrainable, ["Km", "Ki"]);
  assert.ok(isGlobalModel(m));
  // a library model with a data-set constant is global too
  assert.ok(isGlobalModel({ ...modelMeta("straight_line"), datasetConstants: ["B"] }));
  assert.ok(!isGlobalModel(modelMeta("straight_line")));
});

test("global models: one compare_global_fits call over all data sets, constants from the titles", () => {
  applyModelList({ models: [
    entry("competitive_inhibition", ["Vmax", "Km", "Ki", "I"],
      { dataset_constants: ["I"], global_only: true, shared: ["Vmax", "Km", "Ki"] }),
    entry("mixed_model_inhibition", ["Vmax", "Km", "Ki", "Alpha", "I"],
      { dataset_constants: ["I"], global_only: true, shared: ["Vmax", "Km", "Ki", "Alpha"] }),
    entry("needs_constant", ["A"], { required_constants: ["Et"] }),
  ] });
  assert.ok(comparableInModels(modelMeta("competitive_inhibition")));
  assert.ok(!comparable(modelMeta("competitive_inhibition")));
  assert.ok(!comparableInModels(modelMeta("needs_constant")));
  assert.ok(comparableModels("models").some((g) => g.models.some((m) => m.id === "mixed_model_inhibition")));
  assert.ok(!comparableModels().some((g) => g.models.some((m) => m.id === "mixed_model_inhibition")));

  const t = normalizeTable({ type: "xy", x: ["1", "2", "4", "8"],
    datasets: [{ name: "0", rows: [["1"], ["2"], ["3"], ["4"]] }, { name: "6.25", rows: [["0.5"], ["1"], ["2"], ["3"]] },
      { name: "empty", rows: [[""], [""], [""], [""]] }] });
  const calls: any[] = [];
  const gfit = (ss: number, df: number) => ({
    model: "m", label: "m", equation: "Y=...", shared: ["Vmax"],
    goodness: { ss_res: ss, ss_res_weighted: null, df, n_points: 8, sy_x: 1 },
    datasets: ["0", "6.25"].map((name) => ({ name, params: {}, n_points: 4, ss_res: ss / 2,
      curve: { x: [1, 8], y: [ss, ss] }, points: { x: [1, 2, 4, 8], bars: [] } })),
  });
  const engine = { analyze: (p: any) => {
    calls.push(p);
    return { model_1: gfit(4, 5), model_2: gfit(1, 4), n_points: 8,
      f_test: { F: 12, dfn: 1, dfd: 4, p: 0.026, simpler_model: 1 },
      aicc: { aicc_1: 1, aicc_2: 0, delta: -1, probability_1: 0.38, probability_2: 0.62, prefer: 2 },
      nesting: { status: "nested", simpler: 1, reason: "r" }, warnings: ["w"], notes: [] };
  } };
  const r = runCompare(engine, t, { ...DEFAULT_COMPARE, model1: "competitive_inhibition",
    model2: "mixed_model_inhibition", constraints2: { Km: { enabled: true, value: "10" } } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].analysis, "compare_global_fits");
  assert.deepEqual(calls[0].data.datasets.map((d: any) => d.name), ["0", "6.25"]);
  assert.deepEqual(calls[0].options.column_constants, { I: [0, 6.25] });
  assert.deepEqual(calls[0].options.model_1, { model: "competitive_inhibition", constraints: {} });
  assert.deepEqual(calls[0].options.model_2, { model: "mixed_model_inhibition", constraints: { Km: 10 } });
  assert.equal(r.global, true);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.rows[0].models.map((m: any) => [m.ss, m.df, m.k]), [[4, 5, 3], [1, 4, 4]]);
  assert.equal(r.rows[0].f.simpler, 1);
  assert.equal(r.rows[0].aicc.prefer, 2);
  assert.equal(r.nesting.status, "nested");
  assert.deepEqual(r.warnings, ["w"]);
  assert.deepEqual(r.constants, { I: [0, 6.25] });
  assert.equal(r.datasets.length, 2);
  assert.deepEqual(r.datasets[1].altCurves[0].curve, { x: [1, 8], y: [1, 1] });
  assert.match(r.datasets[0].fit.label, /^Model 1: /);

  // a title without a number: no engine call, the next step instead
  calls.length = 0;
  const t2 = normalizeTable({ type: "xy", x: ["1", "2"],
    datasets: [{ name: "Control", rows: [["1"], ["2"]] }] });
  const e = runCompare(engine, t2, { ...DEFAULT_COMPARE, model1: "competitive_inhibition",
    model2: "mixed_model_inhibition" });
  assert.equal(calls.length, 0);
  assert.match(e.error, /title of data set “Control”/);
  // an engine error is passed on
  const failing = { analyze: () => ({ error: "Model 2: did not converge" }) };
  assert.match(runCompare(failing, t, { ...DEFAULT_COMPARE, model1: "competitive_inhibition",
    model2: "mixed_model_inhibition" }).error, /did not converge/);
});
