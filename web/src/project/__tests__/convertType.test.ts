// Convert table to…: every value, exclusion and pairing kept. Run:
// npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { isExcluded, normalizeTable, toggleExcluded } from "../table.ts";
import {
  checkConversion, columnToGrouped, groupedToColumn, hasStackedRows, longToColumn, longToGrouped,
  stackReplicates, toLong, unstackReplicates, valueInventory,
} from "../convertType.ts";

// paired data: one mouse per row, before and after
const paired = () => {
  let t = normalizeTable({
    type: "column",
    rowTitles: ["m1", "m2", "m3", "m4", "", ""],
    datasets: [
      { name: "Before", rows: [["10"], ["12"], ["9"], ["11"], [""], [""]] },
      { name: "After", rows: [["14"], ["15"], ["13"], [""], [""], [""]] },
    ],
  }, "column");
  t = toggleExcluded(t, { kind: "y", dataset: 1, row: 1, sub: 0 });
  return t;
};

test("column -> grouped, same rows: each value stays in its row, pairing and exclusion kept", () => {
  const t = paired();
  const g = columnToGrouped(t, "rows");
  assert.equal(g.type, "grouped");
  assert.deepEqual(g.datasets.map((d) => d.name), ["Before", "After"]);
  assert.deepEqual(g.rowTitles, ["m1", "m2", "m3", "m4"]);
  assert.deepEqual(g.datasets[0].rows.map((r) => r[0]), ["10", "12", "9", "11"]);
  assert.deepEqual(g.datasets[1].rows.map((r) => r[0]), ["14", "15", "13", ""]);
  assert.ok(isExcluded(g, { kind: "y", dataset: 1, row: 1, sub: 0 }));
  assert.ok(checkConversion(t, g).ok);
  // the original is untouched
  assert.equal(t.type, "column");
});

test("column -> grouped, one row: rows become subcolumns matched across data sets", () => {
  const t = paired();
  const g = columnToGrouped(t, "one-row");
  assert.equal(g.x.length, 1);
  assert.deepEqual(g.datasets[0].rows[0], ["10", "12", "9", "11"]);
  assert.deepEqual(g.datasets[1].rows[0], ["14", "15", "13", ""]);
  // subject 2 (m2) is subcolumn 2 of both data sets, titled m2
  assert.equal(g.datasets[0].subTitles?.[1], "m2");
  assert.equal(g.datasets[1].subTitles?.[1], "m2");
  assert.ok(isExcluded(g, { kind: "y", dataset: 1, row: 0, sub: 1 }));
  const c = checkConversion(t, g);
  assert.deepEqual([c.ok, c.values, c.excluded], [true, 7, 1]);
});

test("column -> grouped, groups as rows: one data set, subjects as subcolumns", () => {
  const g = columnToGrouped(paired(), "groups-as-rows");
  assert.deepEqual(g.rowTitles, ["Before", "After"]);
  assert.equal(g.datasets.length, 1);
  assert.deepEqual(g.datasets[0].rows, [["10", "12", "9", "11"], ["14", "15", "13", ""]]);
  assert.ok(isExcluded(g, { kind: "y", dataset: 0, row: 1, sub: 1 }));
  assert.ok(checkConversion(paired(), g).ok);
});

const groupedTable = () => toggleExcluded(normalizeTable({
  type: "grouped",
  rowTitles: ["Day 1", "Day 2"],
  datasets: [
    { name: "WT", subTitles: ["a", "b", "c"], rows: [["1", "2", "3"], ["4", "5", "6"]] },
    { name: "KO", subTitles: ["a", "b", "c"], rows: [["7", "8", "9"], ["10", "", "12"]] },
  ],
}, "grouped"), { kind: "y", dataset: 0, row: 1, sub: 2 });

test("grouped -> column, one column per cell: replicate s stays in row s", () => {
  const t = groupedTable();
  const c = groupedToColumn(t, "cells");
  assert.deepEqual(c.datasets.map((d) => d.name), ["Day 1: WT", "Day 1: KO", "Day 2: WT", "Day 2: KO"]);
  assert.deepEqual(c.rowTitles, ["a", "b", "c"]);
  assert.deepEqual(c.datasets[2].rows.map((r) => r[0]), ["4", "5", "6"]);
  assert.ok(isExcluded(c, { kind: "y", dataset: 2, row: 2, sub: 0 }));
  assert.ok(checkConversion(t, c).ok);
});

test("grouped -> column, stacked: the same position of every data set shares a row", () => {
  const t = groupedTable();
  const c = groupedToColumn(t, "datasets");
  assert.equal(c.x.length, 6);
  assert.deepEqual(c.rowTitles, ["Day 1 · a", "Day 1 · b", "Day 1 · c", "Day 2 · a", "Day 2 · b", "Day 2 · c"]);
  assert.deepEqual(c.datasets[1].rows.map((r) => r[0]), ["7", "8", "9", "10", "", "12"]);
  assert.ok(isExcluded(c, { kind: "y", dataset: 0, row: 5, sub: 0 }));
  assert.ok(checkConversion(t, c).ok);
});

test("long form and back: column -> multiple variables -> column keeps values, rows and exclusions", () => {
  const t = paired();
  const l = toLong(t);
  assert.equal(l.type, "multivariable");
  assert.deepEqual(l.datasets.map((d) => `${d.name}:${d.varType}`), ["Group:categorical", "Row:categorical",
    "Value:continuous"]);
  assert.equal(l.x.length, 7);
  assert.ok(checkConversion(t, l, { afterVars: [2] }).ok);
  const back = longToColumn(l, { value: 2, group: 0, rows: 1 });
  assert.deepEqual(back.skipped, []);
  assert.deepEqual(back.table.rowTitles, ["m1", "m2", "m3", "m4"]);
  assert.deepEqual(back.table.datasets[1].rows.map((r) => r[0]), ["14", "15", "13", ""]);
  assert.ok(isExcluded(back.table, { kind: "y", dataset: 1, row: 1, sub: 0 }));
  assert.ok(checkConversion(l, back.table, { beforeVars: [2] }).ok);
});

test("long -> grouped with subjects as subcolumns: the same mice at 4 times", () => {
  const rows: string[][] = [];
  for (const g of ["WT", "KO"]) {
    for (const m of ["m1", "m2", "m3"]) {
      for (const day of ["0", "7", "14", "21"]) rows.push([g, m, day, String(day.length + m.length + g.length)]);
    }
  }
  const l = normalizeTable({
    type: "multivariable",
    datasets: ["Genotype", "Mouse", "Day", "Weight"].map((name, k) => ({
      name, varType: k === 3 ? "continuous" : "categorical", rows: rows.map((r) => [r[k]]),
    })),
  }, "multivariable");
  const { table, skipped } = longToGrouped(l, { value: 3, group: 0, rows: 2, subject: 1 });
  assert.deepEqual(skipped, []);
  assert.deepEqual(table.rowTitles, ["0", "7", "14", "21"]);
  assert.deepEqual(table.datasets.map((d) => d.name), ["WT", "KO"]);
  assert.deepEqual(table.datasets[0].subTitles, ["m1", "m2", "m3"]);
  assert.deepEqual(table.factorNames, { rows: "Day", datasets: "Genotype" });
  assert.ok(checkConversion(l, table, { beforeVars: [3] }).ok);
});

test("long -> column: a value without a group is reported, never silently dropped", () => {
  const l = normalizeTable({
    type: "multivariable",
    datasets: [
      { name: "Group", varType: "categorical", rows: [["A"], [""], ["B"]] },
      { name: "Value", varType: "continuous", rows: [["1"], ["2"], ["3"]] },
    ],
  }, "multivariable");
  const r = longToColumn(l, { value: 1, group: 0 });
  assert.deepEqual(r.skipped, [1]);
  const c = checkConversion(l, r.table, { beforeVars: [1] });
  assert.equal(c.ok, false);
  assert.deepEqual(c.lost, ["2"]);
});

test("XY replicates: side by side -> stacked -> side by side round trip", () => {
  let t = normalizeTable({
    type: "xy", x: ["1", "2", "4"],
    datasets: [{ name: "A", rows: [["1", "2"], ["3", "4"], ["5", ""]] }],
  }, "xy");
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 1, sub: 1 });
  t = { ...t, xExcluded: [2] };
  const s = stackReplicates(t);
  assert.deepEqual(s.x, ["1", "1", "2", "2", "4", "4"]);
  assert.deepEqual(s.datasets[0].rows.map((r) => r[0]), ["1", "2", "3", "4", "5", ""]);
  assert.ok(isExcluded(s, { kind: "y", dataset: 0, row: 3, sub: 0 }));
  assert.deepEqual(s.xExcluded, [4, 5]);
  assert.ok(hasStackedRows(s));
  assert.ok(checkConversion(t, s).ok);
  const u = unstackReplicates(s);
  assert.deepEqual(u.x, ["1", "2", "4"]);
  assert.deepEqual(u.datasets[0].rows, [["1", "2"], ["3", "4"], ["5", ""]]);
  assert.ok(isExcluded(u, { kind: "y", dataset: 0, row: 1, sub: 1 }));
  assert.deepEqual(u.xExcluded, [2]);
  assert.ok(checkConversion(t, u).ok);
});

test("inventory counts text cells too, so a conversion cannot lose them", () => {
  const t = normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"], ["high"]] }] }, "column");
  assert.deepEqual(valueInventory(t), ["1", "high"]);
  assert.ok(checkConversion(t, columnToGrouped(t, "one-row")).ok);
});
