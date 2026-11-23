// Fill down (fillDown.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable, isExcluded, setExcluded } from "../table.ts";
import { fillDown, fillDownSummary } from "../fillDown.ts";

const col = (vals: string[]) => normalizeTable({ type: "column",
  datasets: [{ name: "A", rows: vals.map((v) => [v]) }] });

test("a block: the top cell's text, exactly, into every row below", () => {
  const t = col(["1.23456789", "", "x", "4", "5"]);
  const r = fillDown(t, { r0: 0, c0: 1, r1: 3, c1: 1 });
  assert.deepEqual(r.table.datasets[0].rows.map((x) => x[0]), ["1.23456789", "1.23456789", "1.23456789", "1.23456789", "5"]);
  assert.equal(r.changed, 3);
  assert.equal(r.from, 0);
  assert.deepEqual(r.rows, [1, 3]);
  // the source text is not trimmed, rounded or parsed
  const s = fillDown(col([" 1,5 ", "2"]), { r0: 0, c0: 1, r1: 1, c1: 1 });
  assert.equal(s.table.datasets[0].rows[1][0], " 1,5 ");
  // the selection drawn upwards fills the same way
  assert.deepEqual(fillDown(t, { r0: 3, c0: 1, r1: 0, c1: 1 }).table, r.table);
});

test("one row: copied from the row above; row 1 has nothing above it", () => {
  const t = col(["7", "8", "9"]);
  const r = fillDown(t, { r0: 2, c0: 1, r1: 2, c1: 1 });
  assert.deepEqual(r.table.datasets[0].rows.map((x) => x[0]), ["7", "8", "8"]);
  assert.equal(fillDownSummary(r), "Filled row 3 from row 2: 1 cell changed.");
  const top = fillDown(t, { r0: 0, c0: 1, r1: 0, c1: 1 });
  assert.equal(top.from, -1);
  assert.equal(top.table, t);
  assert.equal(fillDownSummary(top), "Nothing above row 1 to fill down from.");
});

test("several columns, row titles and X; a blank source blanks the rows below", () => {
  const t = normalizeTable({ type: "xy", x: ["0.1", "", "3"],
    datasets: [{ name: "A", rows: [["1", ""], ["2", "2"], ["3", "3"]] }] });
  const r = fillDown(t, { r0: 0, c0: 0, r1: 2, c1: 2 });
  assert.deepEqual(r.table.x, ["0.1", "0.1", "0.1"]);
  assert.deepEqual(r.table.datasets[0].rows, [["1", ""], ["1", ""], ["1", ""]]);
  assert.equal(fillDownSummary(r), "Filled rows 2 to 3 from row 1: 6 cells changed.");
  const g = normalizeTable({ type: "grouped", rowTitles: ["Day 1", "", ""],
    datasets: [{ name: "A", rows: [["1"], ["2"], ["3"]] }] });
  assert.deepEqual(fillDown(g, { r0: 0, c0: 0, r1: 2, c1: 0 }).table.rowTitles, ["Day 1", "Day 1", "Day 1"]);
});

test("exclusions are not copied: every cell keeps its own", () => {
  let t = col(["1", "2", "3"]);
  t = setExcluded(t, [{ kind: "y", dataset: 0, row: 0, sub: 0 }, { kind: "y", dataset: 0, row: 2, sub: 0 }], true);
  const r = fillDown(t, { r0: 0, c0: 1, r1: 2, c1: 1 }).table;
  assert.deepEqual(r.datasets[0].rows.map((x) => x[0]), ["1", "1", "1"]);
  assert.deepEqual([0, 1, 2].map((row) => isExcluded(r, { kind: "y", dataset: 0, row, sub: 0 })), [true, false, true]);
});

test("calculated columns are skipped and counted; a typed =expression fills as its value", () => {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "A", rows: [["=2*3"], ["1"], ["1"]] },
    { name: "B", formula: "A*2", rows: [["12"], ["2"], ["2"]] }] });
  const r = fillDown(t, { r0: 0, c0: 1, r1: 2, c1: 2 });
  assert.deepEqual(r.table.datasets[0].rows.map((x) => x[0]), ["6", "6", "6"]);
  assert.deepEqual(r.table.datasets[1].rows, t.datasets[1].rows);
  assert.equal(r.skipped, 2);
  assert.match(fillDownSummary(r), /2 in calculated columns left to their formula\.$/);
  // a categorical variable keeps "=" text as typed
  const mv = normalizeTable({ type: "multivariable", x: ["", ""],
    datasets: [{ name: "Code", varType: "categorical", rows: [["=A"], [""]] }] });
  assert.equal(fillDown(mv, { r0: 0, c0: 1, r1: 1, c1: 1 }).table.datasets[0].rows[1][0], "=A");
});

test("acceptance: a 50-row column filled from row 1", () => {
  const t = col(Array.from({ length: 50 }, (_, i) => String(i + 1)));
  const r = fillDown(t, { r0: 0, c0: 1, r1: 49, c1: 1 });
  assert.ok(r.table.datasets[0].rows.every((x) => x[0] === "1"));
  assert.equal(r.changed, 49);
});
