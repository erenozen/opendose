// Find in a table (findInTable.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../table.ts";
import { findInTable, replacedText, replaceInTable } from "../findInTable.ts";

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

// P-36 acceptance: "n.d." in 7 cells of a 96-row table, replaced with an
// empty cell in one edit; an excluded cell keeps its exclusion and reason.
test("replace n.d. with an empty cell in a 96-row table: 7 cells, one edit, exclusions kept", () => {
  const ND = new Set([3, 17, 18, 40, 41, 77, 95]);
  const rows = Array.from({ length: 96 }, (_, r) => [ND.has(r) ? "n.d." : String(10 + r / 4)]);
  const t = normalizeTable({ type: "column", rowTitles: rows.map((_, r) => `S${r + 1}`),
    datasets: [{ name: "Cq", rows, excluded: ["17:0"], exclusionReasons: { "17:0": "bubble in well" } }] });
  assert.equal(t.datasets[0].exclusionReasons?.["17:0"], "bubble in well");
  const hits = findInTable(t, "n.d.");
  assert.equal(hits.length, 7);
  const r = replaceInTable(t, hits, "n.d.", "");
  assert.equal(r.changed, 7);
  assert.equal(r.skipped, 0);
  const cells = r.table.datasets[0].rows.map((x) => x[0]);
  assert.deepEqual([...ND].map((i) => cells[i]), ["", "", "", "", "", "", ""]);
  assert.deepEqual(cells.filter((_, i) => !ND.has(i)), rows.filter((_, i) => !ND.has(i)).map((x) => x[0]));
  assert.deepEqual(r.table.datasets[0].excluded, ["17:0"]);
  assert.deepEqual(r.table.datasets[0].exclusionReasons, { "17:0": "bubble in well" });
  // the source table is untouched: undoing the one edit restores it
  assert.equal(t.datasets[0].rows[3][0], "n.d.");
  assert.deepEqual(findInTable(r.table, "n.d."), []);
});

test("replace: inside a cell ignoring case, the whole cell only, titles and names, formulas skipped", () => {
  const t = normalizeTable({ type: "column", rowTitles: ["WT mouse 1", "KO mouse 2"],
    datasets: [{ name: "Mouse weight", rows: [["Mouse"], ["12"]] }, { name: "Calc", formula: "1", rows: [["mouse"], ["1"]] }] });
  const all = replaceInTable(t, findInTable(t, "mouse"), "mouse", "rat");
  assert.deepEqual(all.table.rowTitles, ["WT rat 1", "KO rat 2"]);
  assert.equal(all.table.datasets[0].name, "rat weight");
  assert.equal(all.table.datasets[0].rows[0][0], "rat");
  assert.equal(all.table.datasets[1].rows[0][0], "mouse");     // calculated: written by its formula
  assert.equal(all.changed, 4);
  assert.equal(all.skipped, 1);
  // the whole cell only: "1" matches the cell "1", not "12" or "WT mouse 1"
  const nums = normalizeTable({ type: "column", rowTitles: ["a 1", "b"], datasets: [{ name: "A", rows: [["1"], ["12"]] }] });
  const whole = findInTable(nums, " 1 ", { whole: true });
  assert.deepEqual(whole, [{ r: 0, c: 1, where: "value" }]);
  assert.deepEqual(replaceInTable(nums, whole, "1", "", { whole: true }).table.datasets[0].rows, [[""], ["12"]]);
  // a replacement with $ is taken literally; regex characters in the query are text
  assert.equal(replacedText("a.b.c", ".", "$&", {}), "a$&b$&c");
  assert.equal(replacedText("1+1", "1+1", "2"), "2");
  // one match replaced: the others stay
  const one = replaceInTable(t, [findInTable(t, "mouse")[0]], "mouse", "rat");
  assert.equal(one.changed, 1);
  assert.deepEqual(one.table.rowTitles, ["WT mouse 1", "KO mouse 2"]);
});
