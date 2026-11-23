// P-48: comparing two correlations, the payloads and the design rule.
// Run: npm run test:unit
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import {
  columnCompareOption, comparePairs, comparisonTestName, parseCompare, resolveDesign, xyComparePayload,
} from "../compareCorr.ts";

const opts = (p: Partial<ColumnOptionsState>): ColumnOptionsState =>
  ({ ...DEFAULT_COLUMN_OPTIONS, analysis: "correlation", ...p });

test("parseCompare and comparePairs", () => {
  assert.deepEqual(parseCompare("0,2"), [0, 2]);
  assert.equal(parseCompare(""), null);
  assert.equal(parseCompare("1,1"), null);
  assert.equal(parseCompare("a,b"), null);
  assert.deepEqual(comparePairs(["A", "B", "C"]).map((p) => p.value), ["0,1", "0,2", "1,2"]);
  assert.deepEqual(comparePairs(["A", "B", "C"], [1, 0]).map((p) => p.label), ["A vs. C", "B vs. C"]);
});

test("the design: stated, forced by a shared data set, or read from the rows", () => {
  assert.deepEqual(resolveDesign("auto", false, true), { design: "dependent", reason: "same-rows" });
  assert.deepEqual(resolveDesign("auto", false, false), { design: "independent", reason: "different-rows" });
  assert.deepEqual(resolveDesign("independent", false, true), { design: "independent", reason: "stated" });
  assert.deepEqual(resolveDesign("independent", true, false), { design: "dependent", reason: "shared" });
  assert.equal(comparisonTestName("steiger_overlapping"),
    "Steiger's Z test, the same subjects, one variable in common");
});

const xy = (y1: string[], y2: string[]) => normalizeTable({
  type: "xy", xTitle: "Age", subcolumnFormat: "replicates",
  x: ["30", "40", "50", "60", "70", "80"],
  datasets: [{ name: "SBP", rows: y1.map((v) => [v]) }, { name: "BMI", rows: y2.map((v) => [v]) }],
});

test("XY: the same rows compare X vs. two Y with X shared (Steiger)", () => {
  const t = xy(["120", "125", "131", "140", "142", "150"], ["22", "25", "23", "27", "26", "24"]);
  const r = xyComparePayload(t, opts({ corrWithX: true, corrCompare: "0,1" }));
  assert.ok(r && !("error" in r));
  assert.equal(r.design.design, "dependent");
  const p = r.payload as any;
  assert.deepEqual(p.data.datasets.map((d: any) => d.name), ["Age", "SBP", "BMI"]);
  assert.deepEqual(p.options.compare, { dataset_c: 0, dataset_d: 2, design: "dependent" });
});

test("XY: values in different rows are two samples; X is split by rows (Fisher z)", () => {
  const t = xy(["120", "125", "131", "", "", ""], ["", "", "", "27", "26", "24"]);
  const r = xyComparePayload(t, opts({ corrWithX: true, corrCompare: "0,1" }));
  assert.ok(r && !("error" in r));
  assert.equal(r.design.reason, "different-rows");
  const p = r.payload as any;
  assert.deepEqual(p.data.datasets[0].ys.map((v: any) => v[0]), [30, 40, 50, null, null, null]);
  assert.deepEqual(p.data.datasets[2].ys.map((v: any) => v[0]), [null, null, null, 60, 70, 80]);
  assert.deepEqual(p.options.compare, { dataset_c: 2, dataset_d: 3, design: "independent" });
  // no comparison asked, or not Pearson
  assert.equal(xyComparePayload(t, opts({ corrWithX: true })), null);
  assert.deepEqual(xyComparePayload(t, opts({ corrWithX: true, corrCompare: "0,1", corrMethod: "spearman" })),
    { error: "Two correlations are compared as Pearson r: choose Pearson" });
});

test("column table: the second pair, and a shared data set forces the same subjects", () => {
  const t = normalizeTable({
    type: "column",
    datasets: ["A", "B", "C", "D"].map((name) => ({ name, rows: [["1"], ["2"], ["4"], ["3"], ["5"]] })),
  });
  const c = columnCompareOption(t, opts({ datasetA: 0, datasetB: 1, corrCompare: "2,3", corrCompareDesign: "independent" }));
  assert.deepEqual(c?.compare, { dataset_c: 2, dataset_d: 3, design: "independent" });
  const s = columnCompareOption(t, opts({ datasetA: 0, datasetB: 1, corrCompare: "0,2", corrCompareDesign: "independent" }));
  assert.deepEqual(s?.design, { design: "dependent", reason: "shared" });
  assert.equal(columnCompareOption(t, opts({ datasetA: 0, datasetB: 1 })), null);
});
