// "Choose a model" → Linear regression: the results sheet switches its
// analysis in place. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findSheet, makeDataSheet, makeGraphSheet, makeProject, makeResultsSheet,
} from "../../../project/ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../../project/prefs.ts";
import { emptyTable } from "../../../project/table.ts";
import type { GraphSheet, ResultsSheet } from "../../../project/types.ts";
import { switchResultsAnalysis } from "../switchAnalysis.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const to = {
  analysis: "linear_regression", options: { throughOrigin: false },
  sheetName: (t: string) => `Linear regression of ${t}`, graphFrom: "xy", graphTo: "linreg_xy",
};

test("the sheet keeps its id and graph; analysis, options, name and graph kind change", () => {
  const p = makeProject(prefs, [
    makeDataSheet("d", "Data 1", emptyTable("xy")),
    { ...makeResultsSheet("r", "d", "nonlin", { model: "x" }, "Nonlin fit of Data 1"), cached: { a: 1 } },
    makeGraphSheet("g", "d", "r", "xy", { titles: { x: "", y: "" }, scheme: "default" }, "Graph of Data 1"),
    makeGraphSheet("g2", "d", null, "xy", { titles: { x: "", y: "" }, scheme: "default" }, "Graph 2"),
  ]);
  const q = switchResultsAnalysis(p, "r", to);
  const r = findSheet(q, "r") as ResultsSheet;
  assert.equal(r.analysis, "linear_regression");
  assert.deepEqual(r.options, { throughOrigin: false });
  assert.equal(r.name, "Linear regression of Data 1");
  assert.equal("cached" in r, false);
  assert.equal((findSheet(q, "g") as GraphSheet).graphType, "linreg_xy");
  assert.equal((findSheet(q, "g2") as GraphSheet).graphType, "xy");   // not bound to it
  assert.deepEqual(q.sheets.map((s) => s.id), ["d", "r", "g", "g2"]);
});

test("frozen sheets and unknown ids are left alone", () => {
  const p = makeProject(prefs, [
    makeDataSheet("d", "Data 1", emptyTable("xy")),
    { ...makeResultsSheet("r", "d", "nonlin", {}, "Fit"), frozen: true },
  ]);
  assert.equal(switchResultsAnalysis(p, "r", to), p);
  assert.equal(switchResultsAnalysis(p, "nope", to), p);
});
