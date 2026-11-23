// P-27: the Subject role of a correlation and the chip for ignored
// subjects. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { ignoredSubjects, subjectDataset, subjectLabels } from "../rmCorr.ts";
import { resultChips } from "../../../guide/checks.ts";
import { groupChecks } from "../../../guide/stats.ts";
import { resultSentence } from "../../../report/sentences.ts";
import { describeResult } from "../../../report/describe.ts";
import { effectGroups } from "../../../report/effects.ts";

const table = normalizeTable({
  type: "column",
  rowTitles: ["S1", "S1", "S2", "S2", "S3"],
  datasets: [
    { name: "pH", rows: [["7.1"], ["7.2"], ["7.0"], ["7.3"], ["7.4"]] },
    { name: "PaCO2", rows: [["40"], ["38"], ["45"], ["41"], ["36"]] },
    { name: "Donor ID", rows: [["a"], ["a"], [" b "], ["b"], ["c"]] },
  ],
});

test("subject labels come from the row titles or a column of IDs", () => {
  assert.deepEqual(subjectLabels(table, "rows", 0, 1), ["S1", "S1", "S2", "S2", "S3"]);
  assert.deepEqual(subjectLabels(table, "d2", 0, 1), ["a", "a", "b", "b", "c"]);
  // X or Y cannot be the subject column; no role, no labels
  assert.equal(subjectLabels(table, "d0", 0, 1), null);
  assert.equal(subjectLabels(table, "", 0, 1), null);
  assert.equal(subjectLabels(table, undefined, 0, 1), null);
  assert.equal(subjectDataset("d12"), 12);
  assert.equal(subjectDataset("rows"), null);
});

test("repeated row titles or an ID column are subjects the correlation ignores", () => {
  assert.deepEqual(ignoredSubjects(table, 0, 1), { where: "the row titles", role: "rows" });
  const noTitles = { ...table, rowTitles: ["", "", "", "", ""] };
  assert.deepEqual(ignoredSubjects(noTitles, 0, 1),
    { where: "the column “Donor ID”", role: "d2" });
  const plain = { ...noTitles, datasets: table.datasets.slice(0, 2) };
  assert.equal(ignoredSubjects(plain, 0, 1), null);
  // distinct row titles are labels, not repeated subjects
  assert.equal(ignoredSubjects({ ...plain, rowTitles: ["a", "b", "c", "d", "e"] }, 0, 1), null);
});

// engine output for Bland & Altman 1995 (engine/tests/reference/rm_corr.json)
const rm = { analysis: "correlation", method: "rm_corr", r: -0.5067697422330628, df: 38,
  p_two_tailed: 0.0008471081091289236, ci_r: [-0.7067146363859452, -0.2318631197566769],
  n: 47, n_subjects: 8, names: ["pH", "PaCO2"],
  effect_size: { r_squared: 0.2568, ci_r_squared: [0.0538, 0.4994], ci_level: 0.95 } };

test("report text uses rm-corr's own df and says within subjects", () => {
  const s = resultSentence(rm, { style: "apa" });
  assert.match(s, /^PH and PaCO2 within subjects: r_rm\(38\) = −\.51, 95% CI \[−\.71, −\.23\]/);
  assert.match(s, /47 pairs from 8 subjects; the association within subjects only/);
  assert.equal(describeResult(rm).test, "repeated-measures correlation (within subjects)");
  const r = effectGroups(rm, { smd: "d", variance: "eta2" })[0].rows.find((x) => x.id === "r");
  assert.equal(r?.measure, "Repeated-measures r");
});

test("the Checks row warns when a correlation ignores named subjects", () => {
  const ctx = (options: Record<string, unknown>) => ({
    tableType: "column" as const, analysisId: "column", table, groups: groupChecks(table),
    options: { analysis: "correlation", datasetA: 0, datasetB: 1, ...options },
    result: { analysis: "correlation", method: "pearson", r: 0.1, n: 5 },
  });
  const chip = resultChips(ctx({})).find((c) => c.id === "subjects");
  assert.ok(chip);
  assert.equal(chip.state, "warn");
  assert.match(chip.detail, /^Several rows seem to share a subject \(the row titles\)/);
  assert.ok(chip.sources?.some((s) => s.label.startsWith("Bakdash & Marusich 2017")));
  // with the Subject role set, no chip
  assert.equal(resultChips(ctx({ corrSubject: "rows" })).find((c) => c.id === "subjects"), undefined);
});
