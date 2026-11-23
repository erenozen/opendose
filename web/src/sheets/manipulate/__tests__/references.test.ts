// P-57: the references behind Normalize and Remove baseline, in words.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { baselineText, normalizeReferenceRows, rowLabel } from "../references.ts";

const grouped = { type: "grouped" as const, rowTitles: ["10 nM", "1 µM", "vehicle"], x: ["", "", ""] };

test("the example: 0% the smallest mean, 100% the vehicle mean, per data set", () => {
  // engine normalize_references on WT / KO (engine/tests/test_normalize_references.py)
  const rows = normalizeReferenceRows([
    { name: "WT", references: { basis: "row means",
      zero: { value: 21, rule: "smallest", row: 0 }, hundred: { value: 299 / 3, rule: "last", row: 2 } } },
    { name: "KO", references: { basis: "row means",
      zero: { value: 94 / 3, rule: "smallest", row: 0 }, hundred: { value: 299 / 3, rule: "last", row: 2 } } },
  ], grouped);
  assert.deepEqual(rows, [
    { dataset: "WT", zero: "21, the smallest mean (“10 nM”)",
      hundred: "99.67, the mean of the last row (“vehicle”)" },
    { dataset: "KO", zero: "31.33, the smallest mean (“10 nM”)",
      hundred: "99.67, the mean of the last row (“vehicle”)" },
  ]);
});

test("rules, separate subcolumns, typed values and empty data sets", () => {
  const xy = { type: "xy" as const, rowTitles: [], x: ["0", "1", "10"] };
  const rows = normalizeReferenceRows([
    { name: "A", references: { basis: "each subcolumn", subcolumns: [
      { zero: { value: 2, rule: "first", row: 0 }, hundred: { value: 9, rule: "largest", row: 2 } }, null] } },
    { name: "B", references: { basis: "row means", zero: { value: 0, rule: "value", row: null },
      hundred: { value: 30, rule: "sum", row: null, n_summed: 3 } } },
    { name: "C", references: null },
  ], xy);
  assert.deepEqual(rows, [
    { dataset: "A, replicate 1", zero: "2, the value of the first row (X = 0)",
      hundred: "9, the largest value (X = 10)" },
    { dataset: "A, replicate 2", zero: "no values", hundred: "no values" },
    { dataset: "B", zero: "0, as entered", hundred: "30, the sum of 3 row means" },
    { dataset: "C", zero: "no values", hundred: "no values" },
  ]);
  assert.equal(rowLabel({ type: "column", rowTitles: [], x: [] }, 4), "row 5");
});

test("Remove baseline: a data set, rows of the same column, a typed value", () => {
  const t = { type: "column" as const, rowTitles: [], x: [] };
  assert.equal(baselineText({ kind: "dataset", dataset: "Nonspecific", linear: true }, t),
    "“Nonspecific”, row by row (its linear regression on X)");
  assert.equal(baselineText({ kind: "rows", rows: [0], value: 1.5 }, t), "1.5, the mean of row 1");
  assert.equal(baselineText({ kind: "rows", rows: [1, 2], values: [3, 4] }, t),
    "3, 4 (one per replicate), the mean of row 2 and row 3");
  assert.equal(baselineText({ kind: "value", value: 2 }, t), "2, as entered");
  assert.equal(baselineText(null, t), "n/a");
});
