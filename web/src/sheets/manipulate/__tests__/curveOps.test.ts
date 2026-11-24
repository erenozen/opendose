// Smooth, differentiate or integrate a curve (P-103). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  curveOpsMethods, curveOpsProblems, curveOpsResult, DEFAULT_CURVE_OPS, normalizeCurveOps, runCurveOps,
} from "../curveOps.ts";

const table = normalizeTable({
  type: "xy", x: ["3", "1", "2", "", "4"], yTitle: "Signal",
  datasets: [{ name: "A", rows: [["3", "3"], ["1", ""], ["2", "2"], ["7", "7"], [""]] },
    { name: "B", rows: [["1"], ["2"], ["3"], [""], ["4"]] }],
});

test("options normalize and the smoothing fields say what to enter", () => {
  assert.deepEqual(normalizeCurveOps({ op: "spin" }), DEFAULT_CURVE_OPS);
  assert.equal(normalizeCurveOps({ op: "integral" }).op, "integral");
  assert.deepEqual(curveOpsProblems(DEFAULT_CURVE_OPS), { neighbours: null, order: null });
  assert.equal(curveOpsProblems({ ...DEFAULT_CURVE_OPS, neighbours: "0" }).neighbours,
    "Enter a whole number from 1 to 50");
  assert.equal(curveOpsProblems({ ...DEFAULT_CURVE_OPS, order: "5" }).order, "Enter a whole number from 0 to 4");
});

test("engine rows map back to the source rows, one column per data set", () => {
  const r = curveOpsResult({ analysis: "curve_ops", op: "integral", datasets: [
    { name: "A", rows: [4, 0, 1.5, null, null], notes: [] },
    { name: "B", error: "No rows with both X and Y." }] }, table, { ...DEFAULT_CURVE_OPS, op: "integral" });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.datasets[0].ys, [[4], [0], [1.5], [null], [null]]);
  assert.deepEqual(r.datasets[1].ys, [[null], [null], [null], [null], [null]]);
  assert.equal(r.yTitle, "Area under Signal");
  assert.ok(r.notes.some((n: string) => n.startsWith("B: No rows with both X and Y; its column is empty.")));
  assert.ok(r.notes.includes("Each row's replicates were averaged first."));
});

test("a failure of every data set is the result's error; non-XY and summary tables are refused", () => {
  const r = curveOpsResult({ datasets: [{ name: "A", error: "Smoothing over 5 points needs 5." }] },
    table, DEFAULT_CURVE_OPS);
  assert.equal(r.error, "Smoothing over 5 points needs 5.");
  const engine = { analyze: () => { throw new Error("not called"); } } as never;
  assert.match(runCurveOps(engine, { ...table, type: "column" }, DEFAULT_CURVE_OPS).error!, /XY tables/);
  assert.match(runCurveOps(engine, table, { ...DEFAULT_CURVE_OPS, neighbours: "x" }).error!,
    /Enter a whole number from 1 to 50\./);
});

test("the payload carries the window only for smoothing", () => {
  const seen: unknown[] = [];
  const engine = { analyze: (p: unknown) => { seen.push(p); return { datasets: [] }; } } as never;
  runCurveOps(engine, table, DEFAULT_CURVE_OPS);
  runCurveOps(engine, table, { ...DEFAULT_CURVE_OPS, op: "derivative" });
  assert.deepEqual((seen[0] as { options: unknown }).options, { op: "smooth", neighbours: 2, order: 2 });
  assert.deepEqual((seen[1] as { options: unknown }).options, { op: "derivative" });
});

test("methods name the operation", () => {
  assert.match(curveOpsMethods(DEFAULT_CURVE_OPS), /Savitzky-Golay .* order 2 .* window of 5 points/);
  assert.match(curveOpsMethods({ ...DEFAULT_CURVE_OPS, order: "0" }), /moving average/);
  assert.match(curveOpsMethods({ ...DEFAULT_CURVE_OPS, op: "derivative" }), /central differences/);
  assert.match(curveOpsMethods({ ...DEFAULT_CURVE_OPS, op: "integral" }), /trapezoidal rule/);
});
