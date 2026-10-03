// Paste-and-suggest heuristics. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTable, parsePasted, suggestTableType } from "../paste.ts";

const tsv = (rows: (string | number)[][]) => rows.map((r) => r.join("\t")).join("\n");
const guess = (text: string) => suggestTableType(parsePasted(text)).type;

test("dose series in the first column -> XY", () => {
  const t = tsv([["Conc", "Rep1", "Rep2"], [0.001, 98, 101], [0.01, 95, 97], [0.1, 70, 66],
    [1, 30, 35], [10, 5, 8]]);
  const s = suggestTableType(parsePasted(t));
  assert.equal(s.type, "xy");
  assert.match(s.reason, /equal fold steps/);
  const table = buildTable(parsePasted(t)!, "xy");
  assert.deepEqual(table.x, ["0.001", "0.01", "0.1", "1", "10"]);
  assert.equal(table.datasets.length, 2);
  assert.equal(table.datasets[0].name, "Rep1");
});

test("time course with even steps -> XY; decreasing X too", () => {
  assert.equal(guess(tsv([[0, 1.2], [5, 2.3], [10, 3.1], [15, 4.4]])), "xy");
  assert.equal(guess(tsv([[100, 1], [50, 2], [25, 4], [12.5, 8]])), "xy");
});

test("times with 0/1 events -> survival", () => {
  const t = tsv([["Days", "Died"], [5, 1], [8, 0], [12, 1], [20, 1], [31, 0]]);
  assert.equal(guess(t), "survival");
  const table = buildTable(parsePasted(t)!, "survival");
  assert.equal(table.datasets[0].rows[2][0], "12");
  assert.equal(table.datasets[0].rows[2][1], "1");
});

test("two groups of time/event pairs -> survival with two data sets", () => {
  const t = tsv([[6, 1, 10, 1], [13, 1, 21, 0], [21, 0, 33, 1], [30, 1, 40, 1]]);
  assert.equal(guess(t), "survival");
  assert.equal(buildTable(parsePasted(t)!, "survival").datasets.length, 2);
});

test("labelled rows of counts -> contingency", () => {
  const t = tsv([["", "Alive", "Dead"], ["Placebo", 30, 12], ["Drug", 41, 4]]);
  assert.equal(guess(t), "contingency");
  const table = buildTable(parsePasted(t)!, "contingency");
  assert.deepEqual(table.rowTitles, ["Placebo", "Drug"]);
  assert.equal(table.datasets[1].name, "Dead");
});

test("an unlabelled 2x2 of counts -> contingency", () => {
  assert.equal(guess(tsv([[12, 5], [3, 20]])), "contingency");
});

test("categorical column with repeats + numeric columns -> multiple variables", () => {
  const t = tsv([["Sex", "Dose", "Weight", "Response"], ["M", 1, 70, 3.1], ["F", 2, 61, 4.2],
    ["M", 3, 82, 5.0], ["F", 4, 58, 6.3]]);
  assert.equal(guess(t), "multivariable");
  const table = buildTable(parsePasted(t)!, "multivariable");
  assert.equal(table.datasets[0].varType, "categorical");
  assert.equal(table.datasets[1].varType, "continuous");
});

test("distinct row titles + numeric columns -> grouped", () => {
  const t = tsv([["", "WT", "KO"], ["Day 1", 1.5, 2.2], ["Day 3", 2.5, 3.9], ["Day 7", 2.9, 5.5]]);
  assert.equal(guess(t), "grouped");
  const table = buildTable(parsePasted(t)!, "grouped");
  assert.deepEqual(table.rowTitles, ["Day 1", "Day 3", "Day 7"]);
});

test("plain columns of measurements -> column", () => {
  const t = tsv([["Control", "Treated"], [23.1, 28.4], [25.4, 30.2], [21.8, 27.1], [24.9, 31.5]]);
  assert.equal(guess(t), "column");
  const table = buildTable(parsePasted(t)!, "column");
  assert.equal(table.datasets[1].name, "Treated");
  assert.equal(table.datasets[1].rows[3][0], "31.5");
});

test("non-monotone first column is not X", () => {
  assert.equal(guess(tsv([[5.2, 6.1], [4.8, 7.3], [5.9, 6.6], [5.1, 7.0]])), "column");
});

test("decimal commas and semicolons are read", () => {
  const t = "Dose;Resp\n1;10,5\n2;12,5\n3;15,0\n4;18,25";
  assert.equal(guess(t), "xy");
  assert.equal(buildTable(parsePasted(t)!, "xy").datasets[0].rows[0][0], "10.5");
});

test("empty paste explains itself", () => {
  const s = suggestTableType(parsePasted("  \n "));
  assert.equal(s.type, "column");
  assert.match(s.reason, /paste/i);
});
