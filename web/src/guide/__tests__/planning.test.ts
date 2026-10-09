// Wave 2 guidance: the design checks of "Plan an experiment…"
// (designChecks.ts), the differential-effect question routing to two-way
// ANOVA with the interaction first and the "separate tests" chip
// (interaction.ts), and the survival wording that points to the pairwise
// log-rank table. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkLines, DEFAULT_PLAN_ANSWERS, defaultGroupNames, designChecks, plannedLayout,
  plannedPowerForm, tableAnswers, type PlanAnswers,
} from "../designChecks.ts";
import { recommendTable } from "../designToTable.ts";
import {
  INTERACTION_FOCUS, separateColumnTests, separateRowTests, separateTestsChip,
} from "../interaction.ts";
import { DEFAULT_DESIGN, recommend, type Design } from "../recommend.ts";
import { makeDataSheet, makeProject, makeResultsSheet } from "../../project/ops.ts";
import { DEFAULT_PREFS } from "../../project/prefs.ts";
import { normalizeTable } from "../../project/table.ts";
import type { ProjectPrefs } from "../../project/types.ts";

const d = (patch: Partial<Design>): Design => ({ ...DEFAULT_DESIGN, ...patch });
const a = (patch: Partial<PlanAnswers>): PlanAnswers => ({ ...DEFAULT_PLAN_ANSWERS, ...patch });
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

test("acceptance: one pooled sample per group is told n = 1 before the experiment", () => {
  const cs = designChecks(d({}), a({ pooled: true, unitsPerGroup: 6, randomised: "list", blinded: "yes" }));
  assert.equal(cs[0].id, "pooled");
  assert.equal(cs[0].state, "bad");
  assert.equal(cs[0].title, "One pooled sample per group gives n = 1");
  assert.match(cs[0].detail, /n = 1, however many animals went into the pool/);
  assert.deepEqual(cs[0].sources.map((s) => s.label.slice(0, 10)), ["Lazic 2010", "GraphPad S"]);
});

test("one unit per group, a shared cage, technical repeats, no control, no randomisation or blinding", () => {
  assert.equal(designChecks(d({}), a({ unitsPerGroup: 1 }))[0].title, "One independent unit per group gives n = 1");
  assert.equal(designChecks(d({}), a({ unitsPerGroup: 3, randomised: "list", blinded: "yes" }))[0].id, "tiny");
  const all = designChecks(d({ replicates: "technical" }), a({ shared: true, control: "no" }));
  assert.deepEqual(ids(all), ["shared", "technical", "control", "random", "blind"]);
  assert.equal(all.find((c) => c.id === "technical")!.title, "Technical repeats are not n");
  assert.ok(all.find((c) => c.id === "technical")!.sources.some((s) => s.label.startsWith("Aarts et al. 2014")));
  assert.equal(all.find((c) => c.id === "random")!.action, "random");
  assert.match(all.find((c) => c.id === "random")!.sources[0].label, /ARRIVE 2.0 item 4/);
  assert.match(all.find((c) => c.id === "blind")!.sources[0].label, /ARRIVE 2.0 item 5/);
  assert.match(all.find((c) => c.id === "control")!.sources[0].label, /ARRIVE 2.0 item 1/);
  assert.equal(designChecks(d({}), a({ control: "not_needed", randomised: "list", blinded: "yes" }))
    .find((c) => c.id === "control")!.state, "info");
});

test("a sound design gets one OK line; lines for the plan's design notes", () => {
  const ok = designChecks(d({}), a({ unitsPerGroup: 8, randomised: "list", blinded: "yes" }));
  assert.deepEqual(ids(ok), ["ok"]);
  assert.deepEqual(checkLines(designChecks(d({}), a({ pooled: true }))).slice(0, 1),
    ["Problem: One pooled sample per group gives n = 1."]);
  assert.ok(ids(designChecks(d({ direction: "predicted" }), a({}))).includes("direction"));
});

test("the planned table reuses Describe the experiment's table choice", () => {
  assert.equal(recommendTable(tableAnswers(d({}))).type, "column");
  assert.equal(recommendTable(tableAnswers(d({ replicates: "cells" }))).type, "nested");
  assert.equal(recommendTable(tableAnswers(d({ differential: true }))).type, "grouped");
  assert.equal(recommendTable(tableAnswers(d({ outcome: "survival" }))).type, "survival");
  assert.deepEqual(defaultGroupNames(d({ differential: true })), { rows: ["Vehicle", "Drug"], datasets: ["WT", "KO"] });
  assert.deepEqual(defaultGroupNames(d({ groups: "three_plus" })).datasets, ["Control", "Drug A", "Drug B"]);
  const col = plannedLayout("column", d({}), "Control, Treated", "", 8);
  assert.deepEqual(col, { datasets: ["Control", "Treated"], rowTitles: [], init: { datasets: 2, subcolumns: 1, rows: 8 } });
  const grp = plannedLayout("grouped", d({ differential: true }), "WT, KO", "Vehicle, Drug", 5);
  assert.deepEqual(grp.init, { datasets: 2, subcolumns: 5, rows: 2 });
  assert.deepEqual(grp.rowTitles, ["Vehicle", "Drug"]);
});

test("the suggested n is an a priori power calculation from the difference that matters", () => {
  const f = plannedPowerForm(d({}), 1, 0.825, "animals")!;
  assert.equal(f.kind, "t_two_sample");
  assert.equal(f.solve, "n");
  assert.equal(f.d, "1.212");
  assert.match(f.effectSource, /a difference of 1 judged biologically relevant and an expected SD of 0.825/);
  assert.equal(plannedPowerForm(d({ paired: true }), 1, 1, "animals")!.kind, "t_paired");
  assert.equal(plannedPowerForm(d({ groups: "three_plus" }), 2, 1, "animals")!.kind, "anova_oneway");
  assert.equal(plannedPowerForm(d({}), null, 1, "animals"), null);
  assert.equal(plannedPowerForm(d({ differential: true }), 1, 1, "animals"), null);
  assert.equal(plannedPowerForm(d({ outcome: "survival" }), 1, 1, "animals"), null);
});

test("acceptance: 'is the drug effect bigger in KO?' routes to two-way ANOVA, interaction first", () => {
  const r = recommend(d({ differential: true, factors: "two" }));
  assert.equal(r.rule, "two_way_interaction");
  assert.equal(r.test, "Two-way ANOVA, interaction first");
  assert.equal(r.target!.tableType, "grouped");
  assert.equal(r.target!.analysisId, "grouped_two_way");
  assert.equal(r.target!.options[INTERACTION_FOCUS], true);
  assert.equal(r.target!.options.design, "none");
  assert.ok(r.notes.some((n) => /Do not compare two separate t tests/.test(n)));
  assert.deepEqual(r.explainers, ["interaction"]);
  assert.ok(r.sources.some((s) => s.label.startsWith("Gelman & Stern 2006")));
  assert.ok(r.sources.some((s) => s.label.startsWith("Nieuwenhuis")));
  // even if "one factor" was left ticked, and with repeated measures
  assert.equal(recommend(d({ differential: true })).rule, "two_way_interaction");
  const rm = recommend(d({ differential: true, factors: "two", repeated: "one" }));
  assert.equal(rm.rule, "two_way_interaction_rm");
  assert.equal(rm.target!.options.design, "rm_rows");
  // one group: no interaction to ask about
  assert.notEqual(recommend(d({ differential: true, groups: "one" })).rule, "two_way_interaction");
});

test("the separate-tests chip: two t tests on four columns, or one t test per row", () => {
  const prefs = DEFAULT_PREFS as unknown as ProjectPrefs;
  const t = normalizeTable({ type: "column", datasets: ["WT veh", "WT drug", "KO veh", "KO drug"]
    .map((name) => ({ name, rows: [["1"], ["2"], ["3"]] })) });
  const r1 = makeResultsSheet("r1", "d", "column", { analysis: "ttest", ttestKind: "welch", datasetA: 0, datasetB: 1 }, "WT");
  const r2 = makeResultsSheet("r2", "d", "column", { analysis: "ttest", ttestKind: "welch", datasetA: 2, datasetB: 3 }, "KO");
  const r3 = makeResultsSheet("r3", "d", "column", { analysis: "ttest", ttestKind: "welch", datasetA: 0, datasetB: 2 }, "veh");
  const p = makeProject(prefs, [makeDataSheet("d", "Mice", t), r1, r2]);
  const f = separateColumnTests(p, "d", "r1")!;
  assert.equal(f.kind, "column");
  const chip = separateTestsChip(f);
  assert.equal(chip.id, "interaction-separate");
  assert.match(chip.detail, /WT veh vs WT drug and KO veh vs KO drug were tested separately/);
  assert.equal(chip.explainer, "interaction");
  // tests sharing a group are not "separate groups"
  assert.equal(separateColumnTests(makeProject(prefs, [makeDataSheet("d", "Mice", t), r1, r3]), "d", "r1"), null);
  // grouped multiple t tests with a handful of rows, one significant and one not
  const mt = makeResultsSheet("m", "g", "grouped_multiple_t", {}, "Multiple t tests");
  const rows = separateRowTests(mt, { rows: [{ p: 0.01 }, { p: 0.2 }] })!;
  assert.deepEqual(rows.kind === "rows" ? [rows.kind, rows.mixed] : [], ["rows", true]);
  assert.equal(separateTestsChip(rows).label, "Significant in one row, not in another: that is not a test of a difference");
  assert.equal(separateTestsChip(rows).action, "interaction");
  assert.equal(separateRowTests(mt, { rows: Array.from({ length: 40 }, () => ({ p: 0.5 })) }), null);
  assert.equal(separateRowTests({ ...mt, analysis: "grouped_two_way" }, { rows: [{ p: 0.01 }, { p: 0.2 }] }), null);
});

test("survival with three groups points to the pairwise log-rank table (Holm-Šídák)", () => {
  const r = recommend(d({ outcome: "survival", groups: "three_plus" }));
  assert.match(r.reason, /pairwise log-rank table .* adjusted for the number of comparisons by Holm-Šídák/);
  assert.doesNotMatch(r.reason, /need correcting/);
  assert.equal(r.postHoc?.method, "Pairwise log-rank tests, Holm-Šídák adjusted");
  assert.ok(r.sources.some((s) => /Multiple comparisons of survival curves/.test(s.label)));
  const ordered = recommend(d({ outcome: "survival", groups: "three_plus", ordered: true }));
  assert.ok(ordered.sources.some((s) => /logrank test for trend/.test(s.label)));
  assert.equal(recommend(d({ outcome: "survival" })).postHoc, null);
});
