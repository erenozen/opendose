// Calculated columns (calculated.ts): the engine requests, writing the
// results back, and "=2*3" typed in a cell. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../table.ts";
import {
  applyCalcResults, calcRequests, calcSignature, evalCellExpression, letterOf,
} from "../calculated.ts";

test("letters", () => {
  assert.deepEqual([0, 1, 25, 26, 27].map(letterOf), ["A", "B", "Z", "AA", "AB"]);
});

test("a column table: requests by letter and name, results written back", () => {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "Control", rows: [["1"], ["2"], [""]] },
    { name: "Drug A", rows: [["3"], ["5"], ["7"]] },
    { name: "Diff", rows: [[""], [""], [""]], formula: "B - A" },
  ] });
  const reqs = calcRequests(t);
  assert.equal(reqs.length, 1);
  const cols = reqs[0].payload.data.columns;
  assert.deepEqual(cols.A, [1, 2, null]);
  assert.deepEqual(cols.Control, [1, 2, null]);
  assert.deepEqual(cols["Drug A"], [3, 5, 7]);
  assert.equal("C" in cols, false);            // the calculated column itself is not an input
  assert.deepEqual(reqs[0].payload.options.formulas, [
    { name: "C", formula: "B - A" }, { name: "Diff", formula: "C" }]);
  const out = applyCalcResults(t, [{ columns: { C: [2, 3, null] } }]);
  assert.deepEqual(out.datasets[2].rows, [["2"], ["3"], [""]]);
  assert.equal(out.datasets[2].formulaError, undefined);
  assert.deepEqual(out.datasets[0].rows, t.datasets[0].rows);
  const bad = applyCalcResults(t, [{ error: "unknown variable 'Q'" }]);
  assert.equal(bad.datasets[2].formulaError, "unknown variable 'Q'");
  assert.notEqual(calcSignature(out), calcSignature(t));
  // the formula survives a save / load
  assert.equal(normalizeTable(JSON.parse(JSON.stringify(out))).datasets[2].formula, "B - A");
});

test("replicates: one request per subcolumn; XY tables offer X", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "2"], datasets: [
    { name: "A", rows: [["1", "2"], ["3", "4"]] },
    { name: "Ratio", rows: [["", ""], ["", ""]], formula: "A / X" },
  ] });
  const reqs = calcRequests(t);
  assert.equal(reqs.length, 2);
  assert.deepEqual(reqs[1].payload.data.columns.A, [2, 4]);
  assert.deepEqual(reqs[0].payload.data.columns.X, [1, 2]);
  const out = applyCalcResults(t, [{ columns: { B: [1, 1.5] } }, { columns: { B: [2, 2] } }]);
  assert.deepEqual(out.datasets[1].rows, [["1", "2"], ["1.5", "2"]]);
});

test("multiple-variables tables keep text for categorical columns", () => {
  const t = normalizeTable({ type: "multivariable", datasets: [
    { name: "Sex", varType: "categorical", rows: [["F"], ["M"]] },
    { name: "Weight", rows: [["20"], ["25"]] },
    { name: "Centred", rows: [[""], [""]], formula: "Weight - GROUPMEAN(Weight, Sex)" },
  ] });
  const cols = calcRequests(t)[0].payload.data.columns;
  assert.deepEqual(cols.Sex, ["F", "M"]);
  assert.deepEqual(cols.Weight, [20, 25]);
});

test("no calculated column: no requests", () => {
  assert.deepEqual(calcRequests(normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"]] }] })), []);
});

test("=expressions typed in a cell", () => {
  assert.equal(evalCellExpression("=2*3+1"), 7);
  assert.equal(evalCellExpression("= (1 + 2) ^ 2 / 3"), 3);
  assert.equal(evalCellExpression("=-2^2"), -4);
  assert.equal(evalCellExpression("=2^-1"), 0.5);
  assert.equal(evalCellExpression("=LOG(1000) + SQRT(16)"), 7);
  assert.equal(evalCellExpression("=1e3/4"), 250);
  assert.ok(Math.abs((evalCellExpression("=PI") ?? 0) - Math.PI) < 1e-15);
  assert.equal(evalCellExpression("=A1+B1"), null);   // references: not here
  assert.equal(evalCellExpression("=1/0"), null);
  assert.equal(evalCellExpression("12"), null);
  assert.equal(evalCellExpression("=2*"), null);
});
