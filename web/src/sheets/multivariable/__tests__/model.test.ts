// Unit tests for the multiple-variables payload builders and plot
// geometry. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, setCell, toggleExcluded } from "../../../project/table.ts";
import {
  ciFraction, convexHull, dataEllipse, defaultLogistic, defaultRegression,
  duplicateNames, mergeOptions, mvVariables, pcaScores, rearrangePayload,
  regressionPayload, tableFromRearranged, variableInfo,
} from "../model.ts";
import { multivariableSample } from "../sample.ts";

test("sample table: 30 observations, five typed variables, row titles", () => {
  const t = multivariableSample();
  assert.equal(t.x.length, 30);
  assert.deepEqual(t.datasets.map((d) => d.varType),
    ["continuous", "continuous", "categorical", "continuous", "continuous"]);
  assert.equal(t.rowTitles[0], "S01");
  const vars = mvVariables(t);
  assert.equal(vars[0].values[4], 10);
  assert.equal(vars[2].values[2], "M");
  const info = variableInfo(t);
  assert.equal(info.find((v) => v.name === "Responder")!.binary, true);
  assert.equal(info.find((v) => v.name === "Sex")!.binary, true);
  assert.deepEqual(info.find((v) => v.name === "Sex")!.levels, ["F", "M"]);
  assert.equal(info.find((v) => v.name === "Dose")!.binary, false);
});

test("payload blanks excluded cells and unparseable numbers", () => {
  let t = emptyTable("multivariable", { datasets: 2, rows: 3 });
  t = setCell(t, 0, 0, 0, "1.5");
  t = setCell(t, 0, 1, 0, "abc");
  t = setCell(t, 0, 2, 0, "7");
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 2, sub: 0 });
  assert.deepEqual(mvVariables(t)[0].values, [1.5, null, null]);
});

test("defaults pick a sensible outcome and predictors", () => {
  const t = multivariableSample();
  const reg = defaultRegression(t);
  assert.equal(reg.outcome, "Response");
  assert.deepEqual(reg.predictors, ["Dose", "Weight", "Sex"]);
  const lg = defaultLogistic(t);
  assert.equal(lg.outcome, "Responder");
  assert.deepEqual(lg.predictors, ["Dose"]);
});

test("regression payload drops stale names and validates", () => {
  const t = multivariableSample();
  assert.ok("error" in regressionPayload(t, { ...defaultRegression(t), outcome: "" }));
  const p = regressionPayload(t, {
    ...defaultRegression(t),
    predictors: ["Dose", "Gone", "Sex"],
    interactions: [["Dose", "Sex"], ["Dose", "Gone"]],
    referenceLevels: { Sex: "M", Dose: "x" },
  });
  assert.ok("options" in p);
  if ("options" in p) {
    assert.deepEqual(p.options.predictors, ["Dose", "Sex"]);
    assert.deepEqual(p.options.interactions, [["Dose", "Sex"]]);
    assert.deepEqual(p.options.reference_levels, { Sex: "M" });
    assert.equal(p.options.ci_level, 0.95);
  }
  assert.equal(ciFraction("99"), 0.99);
  assert.equal(ciFraction("0.9"), 0.9);
});

test("duplicate variable names are reported", () => {
  let t = emptyTable("multivariable", { datasets: 2, rows: 2 });
  t = { ...t, datasets: t.datasets.map((d) => ({ ...d, name: "Age" })) };
  assert.deepEqual(duplicateNames(t), ["Age"]);
});

test("rearrange payload and the table built from its result", () => {
  const t = multivariableSample();
  const o = rearrangePayload(t, {
    select: ["Dose", "logW", "Nope"],
    filters: [
      { variable: "Sex", op: "==", value: "F" },
      { variable: "Dose", op: ">", value: "" },          // incomplete: skipped
      { variable: "Dose", op: "between", value: "1, 5" },
    ],
    combine: "and",
    transforms: [{ variable: "Weight", func: "log10", newName: "logW" }],
    tableName: "",
  });
  assert.deepEqual(o.select, ["Dose", "logW"]);
  assert.deepEqual(o.filters, [
    { variable: "Sex", op: "==", value: "F" },
    { variable: "Dose", op: "between", value: ["1", "5"] },
  ]);
  const next = tableFromRearranged(t, {
    rows: [1, 3],
    variables: [{ name: "Dose", kind: "continuous", values: [1, 5] },
      { name: "Sex", kind: "categorical", values: ["F", null] }],
  });
  assert.equal(next.type, "multivariable");
  assert.deepEqual(next.rowTitles, ["S02", "S04"]);
  assert.deepEqual(next.datasets[1].rows, [["F"], [""]]);
  assert.equal(next.datasets[1].varType, "categorical");
});

test("mergeOptions keeps well-typed stored fields only", () => {
  const d = { a: "1", list: [] as string[], flag: true };
  assert.deepEqual(mergeOptions(d, { a: 2, list: ["x"], flag: false, extra: 1 }),
    { a: "1", list: ["x"], flag: false });
});

test("data ellipse: axis-aligned case has the chi-square(2) semi-axes", () => {
  // x: SD 2, y: SD 1, uncorrelated (symmetric design)
  const xs = [-2, 2, -2, 2, 0, 0];
  const ys = [-1, -1, 1, 1, 0, 0];
  const e = dataEllipse(xs, ys, 0.95, 4)!;
  const sx = Math.sqrt(xs.reduce((a, v) => a + v * v, 0) / 5);
  const sy = Math.sqrt(ys.reduce((a, v) => a + v * v, 0) / 5);
  const q = Math.sqrt(-2 * Math.log(0.05)); // sqrt(5.991)
  assert.ok(Math.abs(e.x[0] - q * sx) < 1e-9);
  assert.ok(Math.abs(e.y[1] - q * sy) < 1e-9);
});

test("convex hull drops interior points and closes the ring", () => {
  const h = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [1, 0.5]]);
  assert.equal(h.length, 5);
  assert.deepEqual(h[0], h[h.length - 1]);
  assert.ok(!h.some(([x, y]) => x === 1 && y === 1));
});

test("PCA scores from eigenvectors", () => {
  const t = multivariableSample();
  const scores = pcaScores(t, {
    names: ["Dose", "Weight"], means: [3.6, 240], sds: [1, 10], standardized: true,
    eigenvectors: [[1, 0], [0, 1]],
  });
  assert.equal(scores.length, 30);
  assert.ok(Math.abs(scores[0]![0] - (0 - 3.6)) < 1e-12);
  assert.ok(Math.abs(scores[0]![1] - (249 - 240) / 10) < 1e-12);
});
