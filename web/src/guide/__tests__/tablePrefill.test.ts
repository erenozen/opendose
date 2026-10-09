// "Help me choose…": the design read from the table and the questions
// worded with the user's own rows. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTable, setCell } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { DEFAULT_DESIGN, recommend } from "../recommend.ts";
import { designFromTable, tableWording, usedDatasets } from "../tablePrefill.ts";

function twoGroups(): DataTableModel {
  let t = emptyTable("column", { datasets: 3, rows: 4 });
  t = { ...t, datasets: t.datasets.map((d, i) => ({ ...d, name: ["Control", "Treated", "Spare"][i] })) };
  // Row 1 is blank in Treated: the question uses the first row both fill.
  t = setCell(t, 0, 0, 0, "5.1");
  t = setCell(t, 0, 1, 0, "4.8");
  t = setCell(t, 1, 1, 0, "6.2");
  t = setCell(t, 1, 2, 0, "6.9");
  return t;
}

test("groups counted from the data sets that hold values", () => {
  const t = twoGroups();
  assert.deepEqual(usedDatasets(t), [0, 1]);
  assert.equal(designFromTable(t).groups, "two");
  assert.equal(designFromTable(t).paired, false);
  assert.equal(designFromTable(null), DEFAULT_DESIGN);
});

test("a paired t test or RM ANOVA on screen pre-fills paired", () => {
  const t = twoGroups();
  assert.equal(designFromTable(t, { analysis: "ttest", ttestKind: "paired" }).paired, true);
  assert.equal(designFromTable(t, { analysis: "ttest", ttestKind: "welch" }).paired, false);
  assert.equal(designFromTable(t, { analysis: "rm_anova" }).paired, true);
  // summary data (mean, SD, n) cannot be paired
  const s = { ...t, subcolumnFormat: "mean_sd_n" as const };
  assert.equal(designFromTable(s, { analysis: "ttest", ttestKind: "paired" }).paired, false);
});

test("table types map to outcomes and layouts", () => {
  assert.equal(designFromTable(emptyTable("survival")).outcome, "survival");
  assert.equal(designFromTable(emptyTable("xy")).outcome, "curve");
  assert.equal(designFromTable(emptyTable("nested")).replicates, "technical");
  const g = designFromTable(emptyTable("grouped"), { design: "rm_rows" });
  assert.deepEqual([g.factors, g.repeated, g.paired], ["two", "one", true]);
  assert.equal(designFromTable(emptyTable("grouped"), { design: "rm_both" }).repeated, "both");
});

test("the pairing question names the user's first complete row", () => {
  const w = tableWording(twoGroups());
  assert.equal(w.pairing,
    "Is row 2 of Control (4.8) the same animal, culture or experiment as row 2 of Treated (6.2)?");
  assert.equal(w.groupsHint, "Your table has 2 data sets: Control and Treated.");
  assert.equal(w.replicates, "What is each value in Control?");
  assert.match(w.pairingHint ?? "", /paired or repeated-measures analysis/);
});

test("row titles name the subject in the pairing question", () => {
  let t = twoGroups();
  t = { ...t, rowTitles: ["Mouse 1", "Mouse 2", "", ""] };
  assert.equal(tableWording(t).pairing,
    "Are Control (4.8) and Treated (6.2) in row “Mouse 2” measured on the same animal, culture or experiment?");
});

test("no pairing question for one group, summary data or other table types", () => {
  let one = emptyTable("column", { datasets: 2, rows: 3 });
  one = setCell(one, 0, 0, 0, "1");
  assert.equal(tableWording(one).pairing, null);
  const sum = { ...twoGroups(), subcolumnFormat: "mean_sd_n" as const };
  assert.equal(tableWording(sum).pairing, null);
  assert.equal(tableWording(emptyTable("survival")).pairing, null);
  assert.equal(tableWording(null).groupsHint, null);
});

test("grouped tables: the repeated-measures hint uses the row titles", () => {
  let t = emptyTable("grouped", { datasets: 2, subcolumns: 3, rows: 2 });
  t = { ...t, rowTitles: ["0 h", "24 h"],
    datasets: t.datasets.map((d, i) => ({ ...d, name: ["WT", "KO"][i] })) };
  t = setCell(t, 0, 0, 0, "1");
  const w = tableWording(t);
  assert.equal(w.repeatedHint, "In your table: is replicate 1 of WT in “0 h” the same subject as "
    + "replicate 1 of WT in “24 h”? If so, the row factor is repeated.");
});

test("survival recommendation: Cox regression is offered and opens on a survival table", () => {
  const r = recommend({ ...DEFAULT_DESIGN, outcome: "survival", groups: "two" });
  const cox = r.alternatives.find((a) => a.test === "Cox regression");
  assert.ok(cox, "Cox regression listed");
  assert.doesNotMatch(cox!.when, /not in OpenDose/);
  assert.equal(cox!.target?.tableType, "survival");
  assert.equal(cox!.target?.analysisId, "cox");
});
