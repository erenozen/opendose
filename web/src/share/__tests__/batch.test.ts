// Run on many files (P-78): the numbers offered for the summary table and
// the table itself; a number the results withhold is an empty cell with
// its reason, never the raw fitted value. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withRangeReport } from "../../sheets/xy/rangeReport.ts";
import type { AnalysisResult } from "../../types.ts";
import {
  hasNumbers, numberChoices, parsePath, summaryCell, summaryTable, valueAt,
} from "../batch.ts";
import { emptyTable } from "../../project/table.ts";

// twelve compounds, one 4PL each; Compound L never reaches its bottom
// plateau (engine/tests/reference/fit_summary_12.py)
const fx = JSON.parse(readFileSync(new URL("../../sheets/xy/__tests__/fitSummary.fixture.json", import.meta.url), "utf8"));
const result = withRangeReport(fx.result as AnalysisResult, fx.table, {});

test("paths read back the numbers they name", () => {
  assert.deepEqual(parsePath("datasets[11].fit.params.IC50.value"), ["datasets", 11, "fit", "params", "IC50", "value"]);
  assert.equal(valueAt(result, "datasets[0].fit.params.IC50.value"), result.datasets[0].fit!.params.IC50.value);
  assert.equal(valueAt(result, "datasets[99].fit"), undefined);
});

test("offered: fitted parameters and P values, the IC50 of each data set ticked", () => {
  const c = numberChoices([{ name: "Fit", result }]);
  const keys = c.filter((x) => x.key);
  assert.equal(keys.length, 12);
  assert.ok(keys.every((k) => /^datasets\[\d+\]\.fit\.params\.IC50\.value$/.test(k.path)));
  assert.equal(keys[0].label, "Compound A · IC50");
  assert.ok(c.some((x) => x.label === "Compound A · HillSlope"));
  // the results sheet's name is added only when the family has several
  const two = numberChoices([{ name: "Fit", result }, { name: "Other", result: { error: "x" } }]);
  assert.equal(two.find((x) => x.key)?.label, "Fit · Compound A · IC50");
  // a t test: its P is the headline
  const t = numberChoices([{ name: "t", result: { analysis: "ttest", p: 0.031, t: 2.4, df: 10 } }]);
  assert.deepEqual(t.filter((x) => x.key).map((x) => x.path), ["p"]);
});

test("a withheld IC50 is an empty cell with the reason, never the raw value", () => {
  const ok = summaryCell(result, "datasets[0].fit.params.IC50.value");
  assert.equal(ok.text, String(result.datasets[0].fit!.params.IC50.value));
  const l = summaryCell(result, "datasets[11].fit.params.IC50.value");
  assert.equal(l.text, "");
  assert.match(l.why ?? "", /IC50 not reached in the range tested/);
  assert.deepEqual(summaryCell({ error: "too few points" }, "p"), { text: "", why: "the analysis failed: too few points" });
  assert.equal(summaryCell(result, "datasets[0].fit.params.Nope.value").why, "not in this file's results");
});

test("the summary table: one row per file, one data set per number, notes for empty cells", () => {
  const choices = numberChoices([{ name: "Fit", result }]).filter((c) => c.key).slice(10);
  const { table, notes } = summaryTable([
    { name: "plate1", results: [result] },
    { name: "plate2", results: [{ error: "no fit" }] },
  ], choices);
  assert.equal(table.type, "column");
  assert.deepEqual(table.rowTitles.slice(0, 2), ["plate1", "plate2"]);
  assert.ok(table.rowTitles.slice(2).every((t) => t === ""));
  assert.deepEqual(table.datasets.map((d) => d.name), ["Compound K · IC50", "Compound L · IC50"]);
  assert.equal(table.datasets[0].rows[0][0], String(result.datasets[10].fit!.params.IC50.value));
  assert.equal(table.datasets[1].rows[0][0], "");
  assert.equal(table.datasets[0].rows[1][0], "");
  assert.equal(notes.length, 3);
  assert.match(notes[0], /^plate1, Compound L · IC50: IC50 not reached/);
  assert.match(notes[1], /^plate2, Compound K · IC50: the analysis failed: no fit/);
  assert.match(notes[2], /^plate2, Compound L · IC50: the analysis failed/);
});

test("a file with no numbers for the table is refused", () => {
  const t = emptyTable("xy");
  assert.equal(hasNumbers(t), false);
  assert.equal(hasNumbers({ ...t, datasets: [{ name: "A", rows: [["lamp"], ["1,5"]] }] }), true);
  assert.equal(hasNumbers({ ...t, datasets: [{ name: "A", rows: [["No data"], ["were read"]] }] }), false);
});
