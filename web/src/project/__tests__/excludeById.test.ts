// Exclude a list of rows by ID (excludeById.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable, isExcluded } from "../table.ts";
import { reasonAt } from "../exclusions.ts";
import { excludeRowsById, idSources, matchRows, parseIds } from "../excludeById.ts";

const col = normalizeTable({ type: "column", rowTitles: ["M1", "M2", "m3", "M4"], datasets: [
  { name: "A", rows: [["1"], ["2"], ["3"], [""]] }, { name: "B", rows: [["4"], ["5"], ["6"], ["7"]] }] });

test("parsing and matching: case and spaces ignored, unknown IDs reported", () => {
  assert.deepEqual(parseIds("M1\n m3 ;X9, m1\t"), ["M1", "m3", "X9"]);
  assert.deepEqual(matchRows(col, { kind: "rowTitle" }, ["M3", "x9", "m1"]), { rows: [0, 2], unmatched: ["x9"] });
});

test("exclude by row title, with a reason; include again", () => {
  const r = excludeRowsById(col, { kind: "rowTitle" }, ["M2", "M4"], { reason: "died before day 7" });
  assert.deepEqual(r.rows, [1, 3]);
  assert.equal(r.values, 3);                       // M4's blank A cell is left alone
  assert.ok(isExcluded(r.table, { kind: "y", dataset: 0, row: 1, sub: 0 }));
  assert.ok(isExcluded(r.table, { kind: "y", dataset: 1, row: 3, sub: 0 }));
  assert.ok(!isExcluded(r.table, { kind: "y", dataset: 0, row: 0, sub: 0 }));
  assert.equal(reasonAt(r.table, { kind: "y", dataset: 1, row: 1, sub: 0 }), "died before day 7");
  const back = excludeRowsById(r.table, { kind: "rowTitle" }, ["m2", "M4"], { on: false });
  assert.ok(!isExcluded(back.table, { kind: "y", dataset: 0, row: 1, sub: 0 }));
});

test("multiple-variables tables: an ID column, which itself stays", () => {
  const mv = normalizeTable({ type: "multivariable", datasets: [
    { name: "Mouse", varType: "categorical", rows: [["a1"], ["a2"], ["a3"]] },
    { name: "Weight", rows: [["20"], ["21"], ["22"]] }] });
  assert.deepEqual(idSources(mv).map((s) => s.label), ["Column “Mouse”", "Column “Weight”"]);
  const r = excludeRowsById(mv, { kind: "column", dataset: 0 }, ["A2"]);
  assert.deepEqual(r.rows, [1]);
  assert.ok(isExcluded(r.table, { kind: "y", dataset: 1, row: 1, sub: 0 }));
  assert.ok(!isExcluded(r.table, { kind: "y", dataset: 0, row: 1, sub: 0 }));
});
