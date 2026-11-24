// Relative potency (P-100): the pure pieces around the engine's
// relative_potency handler: which models and parameters, margins as
// typed, the payload, the verdict and the wording. The numbers are those
// of engine/tests/reference/relative_potency.json (drc's S.alba).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTable } from "../../../project/table.ts";
import { analysisPlan } from "../../../project/dataNotes.ts";
import { modelMeta, type ModelMeta } from "../../../lib/modelLibrary.ts";
import { DEFAULT_COMPARE, normalizeCompare, runCompare } from "../compareFits.ts";
import {
  marginParameters, marginProblem, marginsPayload, normalizeMargins, parallelFText, parallelSentence,
  parallelVerdict, potencyMethods, potencyModel, potencyParameter, potencyText, runPotency,
} from "../relativePotency.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const REF = JSON.parse(readFileSync(new URL("../../../../../engine/tests/reference/relative_potency.json",
  import.meta.url), "utf8"));

const fourPl: ModelMeta = { ...modelMeta("log_inhibitor_vs_response_4pl"),
  parameters: ["Top", "Bottom", "LogIC50", "HillSlope"], constrainable: ["Top", "Bottom", "LogIC50", "HillSlope"] };

/** An engine result shaped like relative_potency's, with the reference numbers. */
function engineResult(extra: Record<string, unknown> = {}) {
  const p = REF.potency_jtj, f = REF.parallelism_f, eq = REF.equivalence_90;
  return {
    analysis: "relative_potency", model: "log_logistic_4pl_conc", reference: "Bentazone", test: "Glyphosate",
    f_test: { F: f.F, dfn: f.dfn, dfd: f.dfd, p: f.p }, parallel_by_f: f.p >= 0.05, alpha: 0.05,
    potency: { parameter: "LogEC50", linear: "EC50", ratio: p.ratio, ci: p.fieller_ci, se_delta: p.se_delta,
      df: p.df, ci_level: 0.95,
      reference: { name: "Bentazone", value: 1.4546, se: 0.03, ec50: 28.48 },
      test: { name: "Glyphosate", value: 1.8258, se: 0.03, ec50: 66.96 } },
    equivalence: { level: 0.9, df: 60, verdict: "not_shown", parameters: [
      { name: "Top", kind: "difference", estimate: eq.Top.difference, ci: eq.Top.ci, margin: [-0.5, 0.5], equivalent: true },
      { name: "HillSlope", kind: "ratio", estimate: eq.HillSlope.ratio, ci: eq.HillSlope.ci, margin: [0.8, 1.25], equivalent: false },
    ] },
    parallel_fit: { goodness: { df: 63, n_points: 68 }, datasets: [
      { name: "Bentazone", points: { x: [0], bars: [] }, curve: { x: [0, 1], y: [3, 2] }, params: {} },
      { name: "Glyphosate", points: { x: [0], bars: [] }, curve: { x: [0, 1], y: [3, 2.5] }, params: {} }] },
    separate_fit: { goodness: { df: 60, n_points: 68 }, datasets: [
      { name: "Bentazone", curve: { x: [0, 1], y: [3.1, 2] } },
      { name: "Glyphosate", curve: { x: [0, 1], y: [3.1, 2.4] } }] },
    warnings: [], notes: [],
    ...extra,
  };
}

test("models with a potency: an EC50 or IC50, one curve per sample", () => {
  assert.equal(potencyParameter(fourPl), "LogIC50");
  assert.ok(potencyModel(fourPl));
  assert.ok(!potencyModel({ ...fourPl, globalOnly: true }));
  assert.ok(!potencyModel({ ...fourPl, datasetConstants: ["B"] }));
  assert.ok(!potencyModel({ ...fourPl, parameters: ["Slope", "YIntercept"], constrainable: ["Slope", "YIntercept"] }));
  assert.deepEqual(marginParameters(fourPl, {}), [
    { name: "Top", kind: "difference" }, { name: "Bottom", kind: "difference" },
    { name: "HillSlope", kind: "ratio" }]);
  assert.deepEqual(marginParameters(fourPl, { HillSlope: -1 }).map((p) => p.name), ["Top", "Bottom"]);
});

test("margins as typed: both limits or neither, lower below upper, a ratio above 0", () => {
  assert.equal(marginProblem(undefined, "difference"), null);
  assert.equal(marginProblem({ lower: "", upper: "" }, "difference"), null);
  assert.equal(marginProblem({ lower: "-1", upper: "" }, "difference"), "Enter both limits, or neither");
  assert.equal(marginProblem({ lower: "abc", upper: "1" }, "difference"), "Enter a number");
  assert.equal(marginProblem({ lower: "2", upper: "1" }, "difference"), "Enter a lower limit below the upper limit");
  assert.match(marginProblem({ lower: "0", upper: "1.25" }, "ratio")!, /above 0/);
  assert.equal(marginProblem({ lower: "0,8", upper: "1,25" }, "ratio"), null);
  const params = marginParameters(fourPl, {});
  assert.deepEqual(marginsPayload({ Top: { lower: "-10", upper: "10" }, HillSlope: { lower: "0.8", upper: "1.25" } }, params),
    { margins: { Top: { lower: -10, upper: 10 }, HillSlope: { lower: 0.8, upper: 1.25 } } });
  assert.match(marginsPayload({ Bottom: { lower: "1", upper: "" } }, params).error!,
    /^Equivalence margin of Bottom: Enter both limits/);
  assert.deepEqual(normalizeMargins({ Top: { lower: -1, upper: "1" }, Bad: 3, Empty: { lower: "", upper: "" } }),
    { Top: { lower: "-1", upper: "1" } });
  assert.deepEqual(normalizeCompare({ mode: "potency", margins: { Top: { lower: "1", upper: "2" } } }).margins,
    { Top: { lower: "1", upper: "2" } });
  assert.equal(normalizeCompare({ mode: "potency" }).mode, "potency");
});

test("the headline, the F test and the verdict in words (S.alba reference numbers)", () => {
  const r = engineResult();
  assert.equal(potencyText(r), "0.4254 (95% CI 0.3497 to 0.5161)");
  assert.equal(parallelFText(r), "F (3, 60) = 2.747, P = 0.0507");
  // the F test passes (P = 0.051) but the slope ratio misses its margin
  assert.equal(parallelVerdict(r), "no");
  const s = parallelSentence(r);
  assert.match(s, /^The F test finds no evidence against parallelism \(P = 0\.0507\), which does not show/);
  assert.match(s, /Equivalence is not shown for HillSlope: the potency is not a single number/);
  assert.equal(parallelVerdict(engineResult({ equivalence: { verdict: "equivalent", parameters: [] } })), "yes");
  assert.equal(parallelVerdict(engineResult({ equivalence: { verdict: "not_set", parameters: [] } })), "unknown");
  assert.match(parallelSentence(engineResult({ equivalence: { verdict: "not_set", parameters: [] } })),
    /Set equivalence margins to show parallelism\.$/);
  const bad = engineResult({ parallel_by_f: false, f_test: { F: 9, dfn: 3, dfd: 60, p: 0.00004 },
    equivalence: { verdict: "not_set", parameters: [] } });
  assert.equal(parallelVerdict(bad), "no");
  assert.match(parallelSentence(bad), /^The curves are not parallel by the F test \(P < 0\.0001\)/);
  assert.equal(potencyText(engineResult({ potency: { ratio: 2, ci: null, ci_level: 0.95 } })),
    "2 (95% CI unbounded)");
  const m = potencyMethods(r, "Log-logistic 4PL");
  assert.match(m, /^The reference \(“Bentazone”\) and test \(“Glyphosate”\) data were fitted together/);
  assert.match(m, /F test \(F \(3, 60\) = 2\.747, P = 0\.0507\) and by equivalence: the 90% CI/);
  assert.match(m, /\(Top difference -0\.5 to 0\.5, HillSlope ratio 0\.8 to 1\.25; USP <1032>/);
  assert.match(m, /was 0\.4254 \(95% CI 0\.3497 to 0\.5161, Fieller's method; Finney 1978\)\.$/);
});

test("the payload, its refusals, and the graph's curves", () => {
  const t = normalizeTable({ type: "xy", x: ["0", "10", "20"],
    datasets: [{ name: "Bentazone", rows: [["4"], ["3"], ["1"]] }, { name: "Glyphosate", rows: [["4"], ["3.5"], ["2"]] },
      { name: "Empty", rows: [[""], [""], [""]] }] });
  const calls: any[] = [];
  const engine = { analyze: (p: any) => { calls.push(p); return engineResult(); } };
  const base = { model: fourPl, held: {}, reference: 0, test: 1, xIsLog: false, errorBars: "sd", extra: {} };
  const r = runPotency(engine, t, { ...base, margins: { Top: { lower: "-0.5", upper: "0.5" } } });
  assert.equal(calls[0].analysis, "relative_potency");
  assert.deepEqual([calls[0].options.reference, calls[0].options.test], [0, 1]);
  assert.deepEqual(calls[0].options.margins, { Top: { lower: -0.5, upper: 0.5 } });
  assert.equal(r.mode, "potency");
  assert.equal(r.potency.potency.ratio, REF.potency_jtj.ratio);
  assert.deepEqual(r.datasets.map((d: any) => d.fit.curve.y[1]), [2, 2.5]);
  assert.deepEqual(r.datasets.map((d: any) => d.altCurves[0].curve.y[1]), [2, 2.4]);
  assert.match(r.datasets[0].fit.label, /parallel curves$/);
  calls.length = 0;
  assert.match(runPotency(engine, t, { ...base, test: 0 }).error, /two different data sets/);
  assert.match(runPotency(engine, t, { ...base, test: 2 }).error, /two data sets with values/);
  assert.match(runPotency(engine, t, { ...base, margins: { Top: { lower: "1", upper: "" } } }).error,
    /Equivalence margin of Top/);
  assert.match(runPotency(engine, t, { ...base, model: { ...fourPl, globalOnly: true } }).error, /EC50 or IC50/);
  assert.equal(calls.length, 0);
  assert.match(runPotency({ analyze: () => ({ error: "could not fit the parallel model: x" }) }, t, base).error,
    /could not fit the parallel model/);
  // through runCompare: data set A is the reference, B the test
  const via = runCompare(engine, t, { ...DEFAULT_COMPARE, mode: "potency",
    model1: "log_inhibitor_vs_response_4pl", datasetA: 1, datasetB: 0 });
  assert.equal(via.mode, "potency");
  assert.deepEqual([calls[0].options.reference, calls[0].options.test], [1, 0]);
  // the Analysed line counts the two samples only
  assert.deepEqual(analysisPlan("compare_fits", t, { mode: "potency", datasetA: 1, datasetB: 0 }),
    { kind: "points", datasets: [1, 0] });
});
