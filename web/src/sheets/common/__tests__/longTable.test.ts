// "From long table…": long records -> CMH, ROC, quantal and XY layouts.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable } from "../../../project/table.ts";
import { readCounts, strataOf } from "../../contingency/run.ts";
import { quantalGroups, defaultQuantalOptions } from "../../xy/quantal.ts";
import {
  cmhFromLong, fillFromLong, guessPositive, guessRoles, levelsOf, parseLongText, previewMatrix,
  quantalFromLong, rocFromLong, sourceFromVariables, xyFromLong, type LongFill, type LongSource,
} from "../longTable.ts";

const src = (text: string) => parseLongText(text) as LongSource;
const ok = (r: unknown) => {
  assert.ok(r && typeof r === "object" && "table" in r, JSON.stringify(r));
  return r as LongFill;
};

test("parse: header row, delimiter and decimal comma detected", () => {
  const s = src("dose;n;dead\n0,5;10;2\n1;10;5\n");
  assert.deepEqual(s.headers, ["dose", "n", "dead"]);
  assert.deepEqual(s.rows, [["0.5", "10", "2"], ["1", "10", "5"]]);
  assert.ok("error" in parseLongText(""));
  assert.ok("error" in parseLongText("just one line"));
});

test("CMH: strata as blocks of rows titled 'Stratum: level', counts summed", () => {
  const s = src([
    "centre,treatment,outcome,count",
    "A,drug,cured,10", "A,drug,not cured,5", "A,placebo,cured,4", "A,placebo,not cured,11",
    "B,drug,cured,8", "B,drug,not cured,2", "B,placebo,cured,3", "B,placebo,not cured,6",
    "B,placebo,not cured,1",
  ].join("\n"));
  const roles = guessRoles(s, "cmh");
  assert.deepEqual(roles, { count: 3, stratum: 0, row: 1, col: 2 });
  const f = ok(cmhFromLong(s, roles, emptyTable("contingency")));
  assert.equal(f.table.type, "contingency");
  assert.deepEqual(f.table.rowTitles, ["A: drug", "A: placebo", "B: drug", "B: placebo"]);
  assert.deepEqual(f.table.datasets.map((d) => d.name), ["cured", "not cured"]);
  assert.deepEqual(f.table.datasets[1].rows.map((r) => r[0]), ["5", "11", "2", "7"]);
  // the CMH analysis reads it back as two 2 x 2 strata
  const c = readCounts(f.table);
  assert.ok(!("error" in c));
  const strata = strataOf(c as Exclude<typeof c, { error: string }>);
  assert.ok(Array.isArray(strata));
  assert.deepEqual(strata.map((x) => x.name), ["A", "B"]);
  assert.deepEqual(strata[1].table, [[8, 2], [3, 7]]);
  assert.equal(f.summary, "2 strata of 2 × 2 tables");
});

test("CMH: one record per subject without a count column; r x c x k", () => {
  const s = src("site,dose,response\nX,low,none\nX,mid,some\nX,high,much\nY,low,some\nY,low,none\nY,high,much\nY,mid,none");
  const f = ok(cmhFromLong(s, { stratum: 0, row: 1, col: 2, count: -1 }, emptyTable("contingency")));
  assert.equal(f.table.x.length, 6);
  assert.deepEqual(f.table.datasets.map((d) => d.name), ["none", "some", "much"]);
  assert.deepEqual(f.table.datasets[0].rows.map((r) => r[0]), ["1", "0", "0", "1", "1", "0"]);
  assert.match(f.notes.join(" "), /every record counts as one subject/);
  const c = readCounts(f.table) as Parameters<typeof strataOf>[0];
  const strata = strataOf(c);
  assert.ok(Array.isArray(strata) && strata.length === 2 && strata[0].table.length === 3);
  assert.ok("error" in cmhFromLong(s, { stratum: 0, row: 0, col: 2 }, emptyTable("contingency")));
});

test("ROC: values split by the chosen status level", () => {
  const s = src("id,outcome,s100b\n1,Good,0.13\n2,Poor,0.5\n3,Good,0.1\n4,Poor,0.44\n5,Poor,\n6,Good,0.2");
  const roles = guessRoles(s, "roc");
  assert.equal(roles.status, 1);
  assert.equal(roles.value, 2);
  const levels = levelsOf(s, roles.status);
  assert.deepEqual(levels, ["Good", "Poor"]);
  assert.equal(guessPositive(levels), "Poor");
  assert.equal(guessPositive(["0", "1"]), "1");
  const f = ok(rocFromLong(s, roles, "Poor", emptyTable("column")));
  assert.deepEqual(f.table.datasets.map((d) => d.name), ["Poor", "Good"]);
  assert.deepEqual(f.table.datasets[0].rows.map((r) => r[0]), ["0.5", "0.44", ""]);
  assert.deepEqual(f.table.datasets[1].rows.map((r) => r[0]), ["0.13", "0.1", "0.2"]);
  assert.deepEqual(f.options, { patients: 0, controls: 1, compare: false });
  assert.match(f.notes.join(" "), /1 record without/);
  assert.ok("error" in rocFromLong(s, roles, "Excellent", emptyTable("column")));
});

test("quantal: one data set per group with responders and N; repeated doses stay rows", () => {
  const s = src([
    "type,conc,total,dead",
    "1,0,151,3", "1,100,146,40", "1,200,116,31",
    "2,0,141,2", "2,100,140,20", "2,300,100,60",
  ].join("\n"));
  const roles = guessRoles(s, "quantal");
  assert.deepEqual(roles, { dose: 1, n: 2, responders: 3, group: 0 });
  const f = ok(quantalFromLong(s, roles, emptyTable("xy")));
  assert.deepEqual(f.table.x, ["0", "100", "200", "300"]);
  assert.equal(f.table.xTitle, "conc");
  assert.deepEqual(f.table.datasets.map((d) => d.name), ["1", "2"]);
  assert.deepEqual(f.table.datasets[1].rows, [["2", "141"], ["20", "140"], ["", ""], ["60", "100"]]);
  assert.deepEqual(f.table.datasets[0].subTitles, ["Responders", "N"]);
  assert.deepEqual(f.options, { layout: "subcolumns" });
  const groups = quantalGroups(f.table, defaultQuantalOptions());
  assert.deepEqual(groups[0].dose, [0, 100, 200]);
  assert.deepEqual(groups[1].responders, [2, 20, 60]);
  // earthworms: five containers per dose, no group column
  const w = src("dose,number,total\n0,3,5\n0,3,5\n0.19,4,11\n0.19,4,9\n0.38,2,9");
  const fw = ok(quantalFromLong(w, guessRoles(w, "quantal"), emptyTable("xy")));
  assert.deepEqual(fw.table.x, ["0", "0", "0.19", "0.19", "0.38"]);
  assert.deepEqual(fw.table.datasets[0].rows.map((r) => r.join("/")), ["3/5", "3/5", "4/11", "4/9", "2/9"]);
  assert.ok("error" in quantalFromLong(src("dose,n,r\n1,5,6"), { dose: 0, n: 1, responders: 2 }, emptyTable("xy")));
});

test("XY: one data set per curve, replicates side by side", () => {
  const s = src("curve,log dose,response\nA,-8,10\nA,-7,40\nA,-7,44\nB,-8,5\nB,-6,90\nA,-6,95");
  const roles = guessRoles(s, "xy");
  assert.deepEqual(roles, { x: 1, y: 2, dataset: 0 });
  const f = ok(xyFromLong(s, roles, emptyTable("xy")));
  assert.deepEqual(f.table.x, ["-8", "-7", "-6"]);
  assert.equal(f.table.xTitle, "log dose");
  assert.deepEqual(f.table.datasets.map((d) => d.name), ["A", "B"]);
  assert.deepEqual(f.table.datasets[0].rows, [["10", ""], ["40", "44"], ["95", ""]]);
  assert.deepEqual(f.table.datasets[1].rows.map((r) => r[0]), ["5", "", "90"]);
  assert.match(f.summary, /2 data sets, 3 X values, up to 2 replicates/);
  assert.deepEqual(f.options, { xIsLog: true });
  assert.deepEqual(previewMatrix(f.table)[0], ["log dose", "A: Y1", "A: Y2", "B"]);
});

test("multiple-variables tables are a source; fillFromLong dispatches", () => {
  const mv = {
    ...emptyTable("multivariable"),
    x: ["", "", ""],
    datasets: [
      { name: "x", rows: [["1"], ["2"], ["3"]] },
      { name: "y", rows: [["5"], ["7"], ["9"]] },
    ],
  };
  const s = sourceFromVariables(mv);
  assert.deepEqual(s, { headers: ["x", "y"], rows: [["1", "5"], ["2", "7"], ["3", "9"]] });
  const f = ok(fillFromLong("xy", s, { x: 0, y: 1, dataset: -1 }, "", emptyTable("xy")));
  assert.deepEqual(f.table.datasets[0].rows.map((r) => r[0]), ["5", "7", "9"]);
  assert.equal(f.options, undefined);
});
