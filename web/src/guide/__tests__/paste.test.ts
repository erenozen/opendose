// Paste-and-suggest heuristics. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTable, errorValueNote, parsePasted, readPaste, replicateGroups, replicatesPerSet, suggestTableType,
} from "../paste.ts";

const tsv = (rows: (string | number)[][]) => rows.map((r) => r.join("\t")).join("\n");
const guess = (text: string) => suggestTableType(parsePasted(text)).type;

// "Rep1, Rep2" used to become two data sets (the DECISIONS 4 bug): they
// are two replicates of one data set.
test("dose series in the first column -> XY, Rep1/Rep2 as replicates", () => {
  const t = tsv([["Conc", "Rep1", "Rep2"], [0.001, 98, 101], [0.01, 95, 97], [0.1, 70, 66],
    [1, 30, 35], [10, 5, 8]]);
  const s = suggestTableType(parsePasted(t));
  assert.equal(s.type, "xy");
  assert.match(s.reason, /equal fold steps/);
  const table = buildTable(parsePasted(t)!, "xy");
  assert.deepEqual(table.x, ["0.001", "0.01", "0.1", "1", "10"]);
  assert.equal(table.datasets.length, 1);
  assert.deepEqual(table.datasets[0].rows[0], ["98", "101"]);
  assert.deepEqual(table.datasets[0].subTitles, ["Rep1", "Rep2"]);
});

test("Rep 1, Rep 2, Rep 3 headers -> one XY data set with three replicates", () => {
  const t = tsv([["Conc", "Rep 1", "Rep 2", "Rep 3"], [0.001, 98, 101, 99], [0.01, 95, 97, 96],
    [0.1, 70, 66, 68], [1, 30, 35, 33], [10, 5, 8, 6]]);
  const s = suggestTableType(parsePasted(t));
  assert.equal(s.type, "xy");
  assert.match(s.reason, /Rep 1 to Rep 3 read as 3 replicates of one data set/);
  const table = buildTable(parsePasted(t)!, "xy");
  assert.equal(table.datasets.length, 1);
  assert.equal(table.datasets[0].name, "Data set A");
  assert.deepEqual(table.datasets[0].subTitles, ["Rep 1", "Rep 2", "Rep 3"]);
  assert.deepEqual(table.datasets[0].rows.map((r) => r.length), [3, 3, 3, 3, 3]);
  assert.deepEqual(table.datasets[0].rows[2], ["70", "66", "68"]);
});

test("two runs of replicate titles -> two data sets named by their stem", () => {
  const t = tsv([["Dose", "WT_1", "WT_2", "KO_1", "KO_2"], [1, 10, 11, 20, 21], [10, 30, 31, 40, 41],
    [100, 50, 52, 60, 62]]);
  const table = buildTable(parsePasted(t)!, "xy");
  assert.deepEqual(table.datasets.map((d) => d.name), ["WT", "KO"]);
  assert.deepEqual(table.datasets[1].rows[1], ["40", "41"]);
  assert.match(suggestTableType(parsePasted(t)).reason,
    /WT_1 to WT_2 and KO_1 to KO_2 read as 2 data sets with 2 replicates each/);
});

test("distinct Y titles stay one data set each", () => {
  const t = tsv([["Conc", "Drug A", "Drug B"], [0.01, 98, 99], [0.1, 70, 60], [1, 30, 20]]);
  const table = buildTable(parsePasted(t)!, "xy");
  assert.deepEqual(table.datasets.map((d) => d.name), ["Drug A", "Drug B"]);
  assert.equal(table.datasets[0].subTitles, undefined);
});

test("numbered factor levels in a grouped table are not read as replicates", () => {
  const t = tsv([["", "Day 1", "Day 2", "Day 3"], ["WT", 1.5, 2.2, 2.9], ["KO", 2.5, 3.9, 5.5]]);
  const b = parsePasted(t)!;
  assert.equal(replicateGroups(b, 1, "grouped").length, 3);
  assert.equal(buildTable(b, "grouped").datasets.length, 3);
  // but "Rep 1..2" in a grouped table are replicates of one data set
  const r = parsePasted(tsv([["", "Rep 1", "Rep 2"], ["WT", 1.5, 2.2], ["KO", 2.5, 3.9]]))!;
  const g = buildTable(r, "grouped");
  assert.equal(g.datasets.length, 1);
  assert.deepEqual(g.datasets[0].rows[1], ["2.5", "3.9"]);
});

test("Excel error values become empty cells with a counted note", () => {
  const t = tsv([["Conc", "Resp"], [0.01, 98], [0.1, "#DIV/0!"], [1, "#N/A"], [10, 5]]);
  const b = parsePasted(t)!;
  assert.equal(b.errors.count, 2);
  assert.deepEqual(b.rows.map((r) => r[1]), ["98", "", "", "5"]);
  assert.equal(errorValueNote(b), "2 Excel error values (#DIV/0!, #N/A) read as empty cells.");
  assert.equal(guess(t), "xy");
  assert.equal(errorValueNote(parsePasted(tsv([[1, 2], [3, 4]]))), null);
});

test("readPaste: table, guess, reason and error note in one call", () => {
  const t = tsv([["Conc", "Rep 1", "Rep 2"], [0.001, 98, "#VALUE!"], [0.01, 95, 97], [0.1, 70, 66]]);
  const r = readPaste(t)!;
  assert.equal(r.type, "xy");
  assert.equal(r.suggestion.type, "xy");
  assert.equal(r.table.datasets.length, 1);
  assert.equal(r.table.datasets[0].rows[0][1], "");
  assert.equal(r.errorValues, 1);
  assert.match(r.errorNote ?? "", /^1 Excel error value \(#VALUE!\) read as an empty cell\.$/);
  const asColumn = readPaste(t, "column")!;
  assert.equal(asColumn.type, "column");
  assert.equal(asColumn.suggestion.type, "xy");
  assert.equal(readPaste("  \n "), null);
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

// The Import dialog's "Y columns per dataset" for a new table (P-33):
// the size of the replicate runs the guess reads, 1 otherwise.
test("replicatesPerSet: the replicates per data set the guess reads", () => {
  const b = (head: string[]) => parsePasted(tsv([head, ...[1, 2, 3].map((r) => head.map((_, c) => r + c))]))!;
  assert.equal(replicatesPerSet(b(["Dose", "Rep 1", "Rep 2", "Rep 3"]), "xy"), 3);
  assert.equal(replicatesPerSet(b(["Dose", "WT 1", "WT 2", "KO 1", "KO 2"]), "xy"), 2);
  // runs of different sizes, or no runs: one column per data set
  assert.equal(replicatesPerSet(b(["Dose", "WT 1", "WT 2", "KO 1"]), "xy"), 1);
  assert.equal(replicatesPerSet(b(["Dose", "A", "B"]), "xy"), 1);
  // table types without replicate subcolumns
  assert.equal(replicatesPerSet(b(["Rep 1", "Rep 2", "Rep 3"]), "column"), 1);
});
