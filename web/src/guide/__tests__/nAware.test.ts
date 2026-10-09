// n-awareness: small-n honesty (P withheld at one value per group, the
// detectable effect at n = 2–3), "What does each value represent?" with
// replicate maps on column / grouped / XY tables, experiment as a block in
// the wizard and its results note, and the count of t tests on one table.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../project/table.ts";
import { makeDataSheet, makeGraphSheet, makeProject, makeResultsSheet } from "../../project/ops.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import type { DataSheet, DataTableModel, Project } from "../../project/types.ts";
import { legendParagraph } from "../../report/legend.ts";
import { legendFor } from "../../report/legendFor.ts";
import { DEFAULT_REPORT } from "../../report/prefs.ts";
import { metaWithReplicates, replicateFacts, withinNote, withinPerGroup } from "../../report/replicates.ts";
import { resultSentence } from "../../report/sentences.ts";
import { analysedGroups, withheldInfo, withWithheld } from "../../sheets/common/withheld.ts";
import type { ColumnOptionsState } from "../../types.ts";
import { DEFAULT_COLUMN_OPTIONS } from "../../types.ts";
import { resultBanners } from "../banners.ts";
import { blockBanner, blockRemoved, pairedBlockBanner } from "../blocking.ts";
import { resultChips, type ResultContext } from "../checks.ts";
import {
  applyUnitAnswer, defaultBlock, layoutsFor, mapTable, needsUnitQuestion, previewOf,
} from "../declareUnit.ts";
import {
  anovaOptionsFor, existingAnova, familywise, multiplicityChip, multiplicityFacts, multiplicityLabel,
} from "../multiplicity.ts";
import { DEFAULT_DESIGN, recommend } from "../recommend.ts";
import {
  neededFromPower, sensitivityChip, sensitivityDesign, sensitivityFromPower, sensitivityOfResult,
  sensitivityPayload, withheldBanner,
} from "../smallN.ts";
import { groupChecks } from "../stats.ts";

const column = (cols: Record<string, (number | "")[]>): DataTableModel => normalizeTable({
  type: "column",
  datasets: Object.entries(cols).map(([name, v]) => ({ name, rows: v.map((x) => [String(x)]) })),
});
const opts = (o: Partial<ColumnOptionsState>): ColumnOptionsState => ({ ...DEFAULT_COLUMN_OPTIONS, ...o });
const ctx = (table: DataTableModel, options: Record<string, unknown>, result: Record<string, unknown>,
  extra: Partial<ResultContext> = {}): ResultContext => ({
  tableType: table.type, analysisId: "column", options, result, table, groups: groupChecks(table), ...extra,
});
const PREFS = projectPrefs(DEFAULT_PREFS);

// ------------------------------------------------------------ small n

test("withheld: one value per group, the engine's old error becomes a descriptive result", () => {
  const t = column({ Control: [10], Treated: [14] });
  const o = opts({ analysis: "ttest", ttestKind: "welch", datasetA: 0, datasetB: 1 });
  const r = withWithheld(t, o, { error: "each group needs at least 2 values" });
  assert.equal(r.analysis, "ttest");
  assert.equal(r.p_two_tailed, null);
  assert.equal(r.error, undefined);
  const w = withheldInfo(r)!;
  assert.equal(w.minN, 1);
  assert.deepEqual(w.groups.map((g) => g.name), ["Control", "Treated"]);
  assert.deepEqual(w.all.map((g) => g.mean), [10, 14]);
  // the sentence and the legend say exploratory (one value per group)
  const s = resultSentence(r, { style: "graphpad" });
  assert.match(s, /^Descriptive results only, exploratory \(one value per group\): Control 10 and Treated 14; difference −4 \(Control − Treated\)\./);
  assert.match(s, /No P value was computed/);
  const leg = legendParagraph({ graphType: "scatter", result: r, style: "graphpad", software: "OpenDose" });
  assert.match(leg, /n = 1 per group\. Descriptive results only, exploratory \(one value per group\): no statistical test was performed and no P value is reported\./);
  assert.doesNotMatch(leg, /t test/);
});

test("withheld: ANOVA with one group of one, the engine's own block, n ≥ 2 untouched", () => {
  const t = column({ A: [1, 2, 3], B: [4], C: [5, 6, 7] });
  const o = opts({ analysis: "anova", anovaKind: "parametric" });
  const full = { analysis: "anova", table: { p: 0.01 }, group_summaries: [] };
  const r = withWithheld(t, o, full);
  assert.equal(r.p, null);
  assert.equal(r.table, undefined, "the computed P is not passed on");
  const w = withheldInfo(r)!;
  assert.deepEqual(w.groups, [{ name: "B", n: 1 }]);
  // engine-marked results keep their keys and gain the group means
  const eng = withWithheld(t, o, { analysis: "anova", p: null,
    withheld: { reason: "fewer than two values", min_n: 1, groups: ["B"] } });
  assert.equal(withheldInfo(eng)?.groups[0].name, "B");
  assert.equal(withheldInfo(eng)?.groups[0].n, 1);
  // n ≥ 2 everywhere: the result is the engine's
  const ok = column({ A: [1, 2], B: [3, 4] });
  const same = { analysis: "ttest", p_two_tailed: 0.1 };
  assert.equal(withWithheld(ok, opts({ analysis: "ttest" }), same), same);
  // summary data are not gated; column statistics are not gated
  assert.equal(withWithheld({ ...t, subcolumnFormat: "mean_sd_n" }, o, full), full);
  assert.equal(withWithheld(t, opts({ analysis: "column_statistics" }), full), full);
  // matched designs count complete pairs
  const pairs = analysedGroups(column({ Pre: [1, ""], Post: [2, 3] }), opts({ analysis: "ttest", ttestKind: "paired" }));
  assert.deepEqual(pairs.map((g) => g.n), [1, 1]);
});

test("withheld: banner with the replication needed, no assumption chips", () => {
  const t = column({ Control: [10], Treated: [14] });
  const o = opts({ analysis: "ttest", ttestKind: "unpaired" });
  const r = withWithheld(t, o, { error: "x" });
  const needed = neededFromPower([{ n1: 17 }, { n1: 9 }, { n1: 6 }]);
  const b = resultBanners(ctx(t, o as unknown as Record<string, unknown>, r, { needed }));
  assert.equal(b.length, 1);
  assert.equal(b[0].id, "p-withheld");
  assert.equal(b[0].title, "No P value: one value per group allows description only");
  assert.ok(b[0].fixes.some((f) => f.includes("17 to detect d = 1, 9 to detect d = 1.5, 6 to detect d = 2")));
  assert.ok(b[0].sources.some((s) => s.label.includes("The need for independent samples")));
  assert.equal(b[0].action, "open-power");
  assert.deepEqual(resultChips(ctx(t, o as unknown as Record<string, unknown>, r)), []);
  assert.equal(withheldBanner(withheldInfo(r)!, null).fixes.length, 2);
});

test("sensitivity: n = 3 per group asks the power engine; the chip reads its numbers", () => {
  const r = { analysis: "ttest", test: "unpaired_t", names: ["A", "B"], n_a: 3, n_b: 3, p_two_tailed: 0.2, t: 1.5, df: 4 };
  const dz = sensitivityDesign(r)!;
  assert.deepEqual(dz, { matched: false, n1: 3, n2: 3, minN: 3 });
  assert.deepEqual((sensitivityPayload(dz).options as Record<string, unknown>).kind, "t_two_sample");
  // native engine: power t_two_sample solve effect n1 = n2 = 3 → d = 3.0709, t crit (df 4) = 2.7764
  const s = sensitivityFromPower({ effect: { name: "d", value: 3.070892266364474 }, critical_t: 2.7764451051977943 }, dz)!;
  assert.ok(Math.abs((s.ciHalf ?? 0) - 2.26696) < 1e-4);
  const chip = sensitivityChip(s);
  assert.equal(chip.label, "n = 3 per group: can detect only d ≥ 3.07 at 80% power (CI ≈ ±2.27 SD); plan replication");
  assert.equal(chip.action, "open-power");
  // paired designs: pairs and d_z
  const p = sensitivityDesign({ analysis: "ttest", test: "paired_t", names: ["A", "B"], n_pairs: 2, p_two_tailed: 0.3 })!;
  assert.equal(p.matched, true);
  assert.equal((sensitivityPayload(p).options as Record<string, unknown>).kind, "t_paired");
  // n = 4 or more, no chip; withheld, no chip
  assert.equal(sensitivityDesign({ ...r, n_a: 4, n_b: 5 }), null);
  // the engine's own block wins
  const own = sensitivityOfResult({ ...r, design_sensitivity: { min_n: 3, detectable_d_80: 3.07, ci_halfwidth_factor: 2.27 } });
  assert.deepEqual(own, { minN: 3, d: 3.07, ciHalf: 2.27, matched: false });
  const t = column({ A: [1, 2, 3], B: [4, 5, 6] });
  const chips = resultChips(ctx(t, { analysis: "ttest", ttestKind: "unpaired" }, r, { sensitivity: s }));
  assert.equal(chips[0].id, "sensitivity");
});

// ------------------------------------------------------------ multiplicity

function threeTests(extraPair?: [number, number]): Project {
  const t = column({ Control: [1, 2, 3], A: [2, 3, 4], B: [3, 4, 5], C: [4, 5, 6] });
  const sheets = [makeDataSheet("d", "Data", t),
    makeResultsSheet("r1", "d", "column", { analysis: "ttest", datasetA: 0, datasetB: 1 }, "t1"),
    makeResultsSheet("r2", "d", "column", { analysis: "ttest", datasetA: 0, datasetB: 2 }, "t2"),
    makeResultsSheet("r3", "d", "column", { analysis: "ttest", datasetA: 3, datasetB: 0 }, "t3"),
    makeResultsSheet("r4", "d", "column", { analysis: "ttest", datasetA: 1, datasetB: 0 }, "dup"),
  ];
  if (extraPair) {
    sheets.push(makeResultsSheet("r5", "d", "column", { analysis: "ttest", datasetA: extraPair[0], datasetB: extraPair[1] }, "t5"));
  }
  return makeProject(PREFS, sheets);
}

test("multiplicity: three t tests against one control on a table", () => {
  const f = multiplicityFacts(threeTests(), "d")!;
  assert.equal(f.k, 3, "the repeated pair counts once");
  assert.equal(f.control, 0);
  assert.ok(Math.abs(f.familywise - 0.142625) < 1e-9);
  assert.equal(multiplicityLabel(f), "3 t tests on this table: familywise error ≈ 1−0.95³ = 14% (Bonferroni bound 15%)");
  const chip = multiplicityChip(f);
  assert.match(chip.detail, /Dunnett's test against Control/);
  assert.ok(chip.sources?.some((s) => s.label.includes("multiple comparisons problem")));
  assert.deepEqual(anovaOptionsFor(f), { analysis: "anova", anovaKind: "parametric", anovaSd: "equal",
    comparisons: "dunnett", controlIndex: 0 });
  assert.equal(existingAnova(threeTests(), f), null);
  // no common data set: Tukey
  const g = multiplicityFacts(threeTests([1, 2]), "d")!;
  assert.equal(g.k, 4);
  assert.equal(g.control, null);
  assert.equal(anovaOptionsFor(g).comparisons, "tukey");
  assert.match(multiplicityLabel(g), /1−0\.95⁴ = 19% \(Bonferroni bound 20%\)/);
  // two tests: nothing to say
  const two = makeProject(PREFS, threeTests().sheets.filter((s) => s.id !== "r3"));
  assert.equal(multiplicityFacts(two, "d"), null);
  assert.ok(Math.abs(familywise(13) - 0.4867) < 1e-3, "13 comparisons ≈ 50% (GraphPad)");
});

// ------------------------------------------------------------ blocking

test("wizard: run once per experiment on different days → matched analysis by experiment", () => {
  const three = recommend({ ...DEFAULT_DESIGN, groups: "three_plus", blocked: true });
  assert.equal(three.rule, "block_rm_one_way");
  assert.equal(three.test, "Repeated-measures one-way ANOVA");
  assert.equal(three.target?.options.analysis, "rm_anova");
  assert.equal(three.target?.options.matchedBy, "experiment");
  assert.match(three.reason, /experiment is a block/);
  assert.ok(three.sources.some((s) => s.label.startsWith("Festing 2014")));
  const two = recommend({ ...DEFAULT_DESIGN, groups: "two", blocked: true });
  assert.equal(two.rule, "block_paired_t");
  assert.equal(two.target?.options.ttestKind, "paired");
  // not blocked: unchanged
  assert.equal(recommend({ ...DEFAULT_DESIGN, groups: "three_plus" }).rule, "one_way_anova");
});

test("RM ANOVA results: day-to-day differences removed, SS and share of the total", () => {
  const r = { analysis: "rm_one_way_anova", n_subjects: 4,
    table: { ss_treatment: 30, ss_subject: 60, ss_error: 10, p_geisser_greenhouse: 0.01 } };
  const b = blockRemoved(r)!;
  assert.equal(b.ssTotal, 100);
  assert.equal(b.share, 0.6);
  assert.equal(blockBanner(b, true).title, "Day-to-day (between-experiment) differences removed: SS = 60, 60% of the total");
  assert.match(blockBanner(b, false).title, /^Subject-to-subject/);
  const t = column({ Control: [1, 2, 3, 4], A: [2, 3, 4, 5], B: [3, 4, 5, 6] });
  const banners = resultBanners(ctx(t, { analysis: "rm_anova", rmKind: "parametric", matchedBy: "experiment" }, r));
  assert.ok(banners.some((x) => x.id === "block-removed" && x.title.startsWith("Day-to-day")));
  assert.equal(blockRemoved({ analysis: "anova" }), null);
  assert.match(pairedBlockBanner({ analysis: "ttest", test: "paired_t", pairing_correlation: { r: 0.91 } })!.title,
    /removed by pairing: r = 0\.91/);
});

// ------------------------------------------------------------ unit of n

const nineWells = () => column({
  Control: [10, 11, 12, 20, 21, 22, 30, 31, 32],
  Treated: [12, 13, 14, 23, 24, 25, 33, 34, 35],
});

test("unit question: who is asked, and technical repeats in blocks of rows", () => {
  const t = nineWells();
  const data = makeDataSheet("d", "Wells", t);
  assert.equal(needsUnitQuestion(data), true);
  assert.equal(needsUnitQuestion({ ...data, report: { valueIs: "dismissed" } }), false);
  assert.equal(needsUnitQuestion(makeDataSheet("s", "Small", column({ A: [1, 2, 3], B: [1, 2, 3] }))), false);
  assert.deepEqual(layoutsFor(t), ["row-blocks"]);
  assert.equal(defaultBlock(t, "row-blocks"), 3);
  const m = mapTable(t, { kind: "technical", layout: "row-blocks", size: 3 });
  assert.equal(m.datasets.length, 3);
  assert.deepEqual(m.datasets[2].rows.map((r) => r[0]), ["E1", "E1", "E1", "E2", "E2", "E2", "E3", "E3", "E3"]);
  assert.deepEqual(m.replicates, { by: "column", column: 2, unit: "wells" });
  assert.deepEqual(previewOf(t, { kind: "technical", layout: "row-blocks", size: 3 }), { experiments: 3, values: [9, 9] });
  // on replicate means the legend counts experiments with the wells inside
  const onMeans = { analysis: "ttest", test: "paired_t", names: ["Control", "Treated"], n_pairs: 3,
    p_two_tailed: 0.01, superplot: { n: 3, replicates: ["E1", "E2", "E3"] } };
  const f = replicateFacts(m, onMeans);
  assert.equal(withinPerGroup(f), "9 wells");
  assert.equal(withinNote(f), "");
  const meta = metaWithReplicates(undefined, m, onMeans);
  const leg = legendParagraph({ graphType: "scatter", result: onMeans, style: "graphpad", software: "OpenDose",
    unit: { unit: meta.unit, experiments: meta.experiments, within: withinPerGroup(f) } });
  assert.match(leg, /n = 3 independent experiments \(9 wells\) per group, paired\./);
});

test("unit question: answers write the report, the map, SuperPlots and replicate means", () => {
  const t = nineWells();
  const p = makeProject(PREFS, [makeDataSheet("d", "Wells", t),
    makeResultsSheet("r", "d", "column", { analysis: "ttest" }, "t test"),
    makeGraphSheet("g", "d", "r", "scatter", { titles: { x: "", y: "" } } as never, "Graph")]);
  let n = 0;
  const ids = () => `id${++n}`;
  const exp = applyUnitAnswer(p, "d", { kind: "experiment" }, ids);
  assert.deepEqual((exp.project.sheets[0] as DataSheet).report, { valueIs: "experiment", unit: "independent experiments" });
  const dis = applyUnitAnswer(p, "d", "dismissed", ids);
  assert.equal((dis.project.sheets[0] as DataSheet).report?.valueIs, "dismissed");
  const added: string[] = [];
  const tech = applyUnitAnswer(p, "d", { kind: "technical", layout: "row-blocks", size: 3 }, ids,
    (q, dataId, analysisId) => {
      added.push(analysisId);
      return { project: { ...q, sheets: [...q.sheets, makeResultsSheet("m", dataId, analysisId, {}, "means")] },
        resultsId: "m" };
    });
  assert.deepEqual(added, ["column_replicate_means"]);
  assert.equal(tech.select, "m");
  const d = tech.project.sheets[0] as DataSheet;
  assert.equal(d.report?.valueIs, "technical");
  assert.equal(d.table.replicates?.unit, "wells");
  const g = tech.project.sheets.find((s) => s.id === "g");
  assert.equal((g as unknown as { settings: { column: { superplot: { on: boolean } } } }).settings.column.superplot.on, true);
});

test("replicate maps on XY and grouped tables: experiments and values per cell", () => {
  // XY: 3 experiments × 3 wells per X value (9 subcolumns, blocks of 3)
  const xy = normalizeTable({ type: "xy", x: ["1", "10", "100"],
    datasets: [{ name: "Drug", rows: [0, 1, 2].map((r) => Array.from({ length: 9 }, (_, k) => String(100 - r * 30 + k))) }] });
  assert.deepEqual(layoutsFor(xy), ["subcolumns", "subcolumn-blocks"]);
  assert.equal(defaultBlock(xy, "subcolumn-blocks"), 3);
  const m = mapTable(xy, { kind: "technical", layout: "subcolumn-blocks", size: 3 });
  assert.deepEqual(m.replicates, { by: "subcolumns", unit: "wells", of: [0, 0, 0, 1, 1, 1, 2, 2, 2] });
  const f = replicateFacts(m)!;
  assert.equal(f.experiments, 3);
  assert.deepEqual(f.values.map((v) => v.n), [9, 9, 9]);
  assert.equal(withinPerGroup(f, true), "9 wells");
  const data = makeDataSheet("x", "Dose", m);
  const leg = legendFor({ data, table: m, graph: null, result: null, options: null, prefs: DEFAULT_REPORT,
    software: "OpenDose" });
  assert.match(leg, /n = 3 independent experiments \(9 wells\) per X value\./);
  // one subcolumn per experiment: n counts experiments, nothing inside
  const xy3 = normalizeTable({ type: "xy", x: ["1", "10"],
    datasets: [{ name: "Drug", rows: [["1", "2", "3"], ["4", "5", "6"]] }] });
  const m3 = mapTable(xy3, { kind: "technical", layout: "subcolumns" });
  const leg3 = legendFor({ data: makeDataSheet("y", "D", m3), table: m3, graph: null, result: null,
    options: null, prefs: DEFAULT_REPORT, software: "OpenDose" });
  assert.match(leg3, /n = 3 independent experiments per X value\./);
  // grouped: values per row × data set cell
  const g = normalizeTable({ type: "grouped", rowTitles: ["WT", "KO"],
    datasets: [{ name: "Vehicle", rows: [["1", "2", "3", "4", "5", "6"], ["1", "2", "3", "4", "5", "6"]] }] });
  const gm = mapTable(g, { kind: "cell", layout: "subcolumn-blocks", size: 2 });
  assert.equal(gm.replicates?.unit, "cells");
  const gf = replicateFacts(gm, { superplot: { n: 3, replicates: ["1", "2", "3"] } })!;
  assert.equal(gf.experiments, 3);
  assert.deepEqual(gf.values.map((v) => v.n), [6, 6]);
  assert.equal(withinPerGroup(gf), "6 cells");
});
