// Find in a table (findInTable.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../table.ts";
import { findInTable } from "../findInTable.ts";

test("XY: column names, X and values, in reading order (no row-title column)", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "12", "3"],
    datasets: [{ name: "Ctrl 1", rows: [["10", "11"], ["21", ""], ["31", "1"]] }] });
  assert.deepEqual(findInTable(t, "1").slice(0, 5), [
    { r: 0, c: 1, where: "column" }, { r: 0, c: 0, where: "x" },
    { r: 0, c: 1, where: "value" }, { r: 0, c: 2, where: "value" }, { r: 1, c: 0, where: "x" }]);
  assert.deepEqual(findInTable(t, "  "), []);
  assert.deepEqual(findInTable(t, "zzz"), []);
});

test("column tables: row titles too, ignoring case", () => {
  const t = normalizeTable({ type: "column", rowTitles: ["Mouse A", "mouse b"],
    datasets: [{ name: "WT", rows: [["5"], ["6"]] }] });
  assert.deepEqual(findInTable(t, "MOUSE"), [{ r: 0, c: 0, where: "rowTitle" }, { r: 1, c: 0, where: "rowTitle" }]);
});
