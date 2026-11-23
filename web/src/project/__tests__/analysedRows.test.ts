// The "Analysed" line of regression, Cox and contingency results (P-16):
// each kind its own reader. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../table.ts";
import { analysedRowsLine, analysisPlan, countsLine, dataNotes } from "../dataNotes.ts";

const block = (dropped: { row: number; blank?: string[]; not_number?: string[] }[], used = 26, rows = 30) =>
  ({ analysed_rows: { n_used: used, n_rows: rows, variables: ["Y", "Age", "Dose"], dropped } });

test("multiple regression, 4 rows with a blank Age: the acceptance wording", () => {
  const r = block([3, 9, 17, 22].map((row) => ({ row, blank: ["Age"], not_number: [] })));
  assert.equal(analysedRowsLine(r), "26 of 30 rows; 4 dropped for a blank in Age (rows 3, 9, 17, 22)");
});

test("several reasons are listed apart, each with its rows", () => {
  const r = block([
    { row: 3, blank: ["Age"] }, { row: 9, blank: ["Age"] },
    { row: 12, blank: ["Age", "Dose"] }, { row: 27, not_number: ["Dose"] },
  ], 26, 30);
  assert.equal(analysedRowsLine(r), "26 of 30 rows; 4 dropped: 2 for a blank in Age (rows 3, 9); "
    + "1 for a blank in Age and Dose (row 12); 1 for text that is not a number in Dose (row 27)");
});

test("nothing dropped, one row, subjects without row numbers", () => {
  assert.equal(analysedRowsLine(block([], 30, 30)), "30 of 30 rows; none dropped");
  assert.equal(analysedRowsLine(block([], 1, 1)), "1 of 1 row; none dropped");
  assert.equal(analysedRowsLine(block([{ row: 5, blank: ["Age"] }], 29, 30), false),
    "29 of 30 subjects; 1 dropped for a blank in Age");
  assert.equal(analysedRowsLine({}), null);
  assert.equal(analysedRowsLine(null), null);
});

test("contingency: the counts are n", () => {
  assert.equal(countsLine({ total: 120, rows: 2, cols: 2 }), "n = 120, the sum of the 2 × 2 counts");
  assert.equal(countsLine({ error: "x" }), null);
});

test("each table kind gets its own reader; assays keep none", () => {
  const mv = normalizeTable({ type: "multivariable", datasets: [{ name: "Y", rows: [["1"]] }] }, "multivariable");
  assert.equal(analysisPlan("mv_regression", mv, {}).kind, "rows");
  assert.equal(analysisPlan("mv_logistic", mv, {}).kind, "rows");
  assert.equal(analysisPlan("mv_poisson", mv, {}).kind, "rows");
  assert.equal(analysisPlan("mv_cox", mv, {}).kind, "rows");
  assert.equal(analysisPlan("mv_pca", mv, {}).kind, "none");
  assert.equal(analysisPlan("assay_qpcr", mv, {}).kind, "none");
  const ct = normalizeTable({ type: "contingency", datasets: [{ name: "A", rows: [["1"], ["2"]] }] }, "contingency");
  assert.equal(analysisPlan("contingency", ct, {}).kind, "counts");
  const n = dataNotes({ analysisId: "mv_regression", table: mv, options: {},
    result: block([{ row: 3, blank: ["Age"] }], 29, 30) });
  assert.equal(n.analysed, "29 of 30 rows; 1 dropped for a blank in Age (row 3)");
});
