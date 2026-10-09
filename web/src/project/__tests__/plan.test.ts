// Unit tests for the analysis plan (project/plan.ts): making a plan from a
// results sheet, the deviations a results sheet shows against it, lock
// semantics, the methods sentence and reading saved plans.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chipText, editPlan, emptyPlan, explainDeviation, lockPlan, parsePlan, planDeviations,
  planFacts, planFromResults, planMethodsSentence, planSheetFor, primarySheet, resultsOf,
  setPlan, sheetDeviations, sidedness, testLabel, variantKey, type SheetLike,
} from "../plan.ts";
import { makeDataSheet, makeInfoSheet, makeProject, makeResultsSheet } from "../ops.ts";
import { DEFAULT_PREFS } from "../prefs.ts";
import { normalizeTable, toggleExcluded } from "../table.ts";
import { setReasons } from "../exclusions.ts";
import type { DataTableModel, ProjectPrefs } from "../types.ts";

const T0 = "2026-10-09T10:00:00.000Z";
const T1 = "2026-10-12T09:30:00.000Z";

/** Control vs Treated, `n` mice each. */
function mice(n = 8): DataTableModel {
  const vals = (base: number) => Array.from({ length: n }, (_, i) => [String(base + (i % 4))]);
  return normalizeTable({ type: "column", yTitle: "Tumour volume (mm³)", datasets: [
    { name: "Control", rows: vals(10) }, { name: "Treated", rows: vals(14) },
  ] });
}

const welch: SheetLike = { id: "r1", name: "Welch t test of Mice", analysisId: "column",
  options: { analysis: "ttest", ttestKind: "welch", datasetA: 0, datasetB: 1 } };

test("variant keys and labels name the test the options run", () => {
  assert.equal(variantKey("column", { analysis: "ttest", ttestKind: "welch" }), "ttest:welch");
  assert.equal(variantKey("column", { analysis: "ttest" }), "ttest:unpaired");
  assert.equal(variantKey("column", { analysis: "column_statistics" }), "descriptive");
  assert.equal(testLabel("column", { analysis: "ttest", ttestKind: "welch" }), "Welch t test");
  assert.equal(testLabel("column", { analysis: "anova", anovaKind: "parametric", comparisons: "dunnett" }),
    "one-way ANOVA with Dunnett's test");
  assert.equal(testLabel("grouped_two_way", { design: "none" }), "two-way ANOVA");
  assert.equal(testLabel("nested_ttest", {}, "Nested t test"), "Nested t test");
  assert.equal(sidedness("column", { analysis: "ttest" }), "two");
  assert.equal(sidedness("column", { analysis: "correlation", corrTails: "greater" }), "one");
});

test("Make this the plan: two-tailed Welch t test, Treated vs Control, n = 8 per group", () => {
  const plan = planFromResults(welch, mice(8), T0);
  assert.deepEqual(plan.comparison, { a: "Control", b: "Treated" });
  assert.equal(plan.test.label, "Welch t test");
  assert.equal(plan.test.tails, "two");
  assert.equal(plan.nPerGroup, 8);
  assert.equal(plan.primaryOutcome, "Tumour volume (mm³)");
  assert.equal(plan.resultsId, "r1");
  assert.equal(plan.locked, false);
});

test("the planned analysis as planned: no deviations", () => {
  const plan = lockPlan(planFromResults(welch, mice(8), T0), T0);
  assert.deepEqual(sheetDeviations(plan, welch, mice(8), [welch]), []);
  assert.equal(chipText(plan, []), "As planned: two-tailed Welch t test, n = 8 per group.");
});

test("acceptance: switching to a paired test or adding an animal is flagged", () => {
  const plan = lockPlan(planFromResults(welch, mice(8), T0), T0);
  const paired: SheetLike = { ...welch, options: { ...(welch.options as object), ttestKind: "paired" } };
  const ds = sheetDeviations(plan, paired, mice(9), [paired]);
  assert.deepEqual(ds.map((d) => d.kind), ["test", "n"]);
  assert.equal(chipText(plan, ds), "Planned: two-tailed Welch t test, n = 8 per group. "
    + "Now: paired t test, n = 9 per group. Add a reason or revert.");
  assert.match(ds[1].text, /n = 9 per group instead of the planned 8 per group \(more units than planned\)/);
  // a one-tailed analysis (correlation in a stated direction) against a two-tailed plan
  const corrPlan = lockPlan(planFromResults({ id: "c", name: "c", analysisId: "column",
    options: { analysis: "correlation" } }, mice(8), T0), T0);
  const corr1: SheetLike = { id: "c", name: "c", analysisId: "column",
    options: { analysis: "correlation", corrTails: "greater" } };
  const oneTailed = sheetDeviations(corrPlan, corr1, mice(8), [corr1]);
  assert.deepEqual(oneTailed.map((d) => [d.kind, d.planned, d.now]), [["sidedness", "two-tailed", "one-tailed"]]);
});

test("the methods sentence records the plan and each deviation with its reason", () => {
  const plan = lockPlan(planFromResults(welch, mice(8), T0), T0);
  const paired: SheetLike = { ...welch, options: { ...(welch.options as object), ttestKind: "paired" } };
  const [dev] = sheetDeviations(plan, paired, mice(8), [paired]);
  assert.equal(planMethodsSentence(plan, [dev]),
    "Pre-specified analysis plan (written 2026-10-09): two-tailed Welch t test comparing Treated "
    + "with Control, primary outcome Tumour volume (mm³), n = 8 per group, α = 0.05; exclusions: "
    + "none planned. Deviations from the plan: paired t test instead of the planned Welch t test "
    + "(reason not recorded).");
  const r = explainDeviation(plan, dev, "littermates were paired by cage", T1);
  assert.ok("plan" in r);
  const again = sheetDeviations(r.plan, paired, mice(8), [paired]);
  assert.equal(again[0].reason, "littermates were paired by cage");
  assert.match(planMethodsSentence(r.plan, again), /\(reason: littermates were paired by cage\)\.$/);
  assert.match(chipText(r.plan, again), /Reasons recorded\.$/);
  assert.ok("error" in explainDeviation(plan, dev, "  ", T1));
  assert.equal(planMethodsSentence(plan, []).endsWith("No deviations from the plan."), true);
});

test("lock semantics: a draft is edited silently; a locked plan needs a reason and logs it", () => {
  const draft = planFromResults(welch, mice(8), T0);
  const d2 = editPlan(draft, { nPerGroup: 10 }, "", T1);
  assert.ok("plan" in d2 && d2.plan.nPerGroup === 10 && d2.plan.changes.length === 0);
  const locked = lockPlan(draft, T1);
  assert.equal(locked.lockedAt, T1);
  assert.ok("error" in editPlan(locked, { nPerGroup: 10 }, "", T1));
  const ok = editPlan(locked, { nPerGroup: 10, exclusionRule: "humane endpoint" }, "pilot SD larger", T1);
  assert.ok("plan" in ok);
  assert.equal(ok.plan.nPerGroup, 10);
  assert.deepEqual(ok.plan.changes, [{ at: T1, what: "n per group: 8 → 10; Exclusion rule: (none) → humane endpoint",
    reason: "pilot SD larger" }]);
  // no change: nothing logged
  const same = editPlan(locked, { nPerGroup: 8 }, "", T1);
  assert.ok("plan" in same && same.plan === locked);
});

test("exclusions beyond the rule, extra comparisons and a changed pair", () => {
  let t = mice(8);
  t = toggleExcluded(t, { kind: "y", dataset: 1, row: 2, sub: 0 });
  const plan = lockPlan(planFromResults(welch, mice(8), T0), T0);
  const ds = sheetDeviations(plan, welch, t, [welch]);
  assert.deepEqual(ds.map((d) => d.kind), ["exclusions"]);
  assert.match(ds[0].text, /1 value excluded although the plan states no exclusion rule/);
  // with a rule: only values without a reason are deviations
  const ruled = { ...plan, exclusionRule: "humane endpoint before day 21" };
  assert.match(sheetDeviations(ruled, welch, t, [welch])[0].text, /without a recorded reason/);
  const reasoned = setReasons(t, [{ kind: "y", dataset: 1, row: 2, sub: 0 }], "humane endpoint");
  assert.deepEqual(sheetDeviations(ruled, welch, reasoned, [welch]), []);
  // a second test on the table is an extra comparison
  const mw: SheetLike = { id: "r2", name: "Mann-Whitney", analysisId: "column",
    options: { analysis: "ttest", ttestKind: "mann_whitney" } };
  const desc: SheetLike = { id: "r3", name: "Stats", analysisId: "column", options: { analysis: "column_statistics" } };
  const extra = sheetDeviations(plan, mw, mice(8), [welch, mw, desc]);
  assert.deepEqual(extra.map((d) => d.kind), ["extra"]);
  assert.match(chipText(plan, extra), /^Not in the analysis plan/);
  assert.deepEqual(sheetDeviations(plan, desc, mice(8), [welch, mw, desc]), []);
  assert.equal(primarySheet(plan, [mw, welch])?.id, "r1");
  // the pair compared changed
  const three = normalizeTable({ type: "column", datasets: [
    { name: "Control", rows: [["1"], ["2"]] }, { name: "Treated", rows: [["3"], ["4"]] },
    { name: "Other", rows: [["5"], ["6"]] }] });
  const p3 = lockPlan({ ...planFromResults(welch, three, T0), nPerGroup: null }, T0);
  const other: SheetLike = { ...welch, options: { analysis: "ttest", ttestKind: "welch", datasetA: 0, datasetB: 2 } };
  assert.deepEqual(sheetDeviations(p3, other, three, [other]).map((d) => d.kind), ["comparison"]);
});

test("in a project: the plan sheet, all deviations and the checklist facts", () => {
  const prefs = DEFAULT_PREFS as unknown as ProjectPrefs;
  const data = makeDataSheet("d1", "Mice", mice(9));
  const res = makeResultsSheet("r1", "d1", "column", { analysis: "ttest", ttestKind: "paired" }, "t");
  const info = { ...makeInfoSheet("i1", "Analysis plan", "d1"), constants: [] };
  let p = makeProject(prefs, [data, res, info]);
  assert.equal(planSheetFor(p, "d1"), null);
  assert.equal(planFacts(p, "d1"), null);
  const plan = lockPlan(planFromResults(welch, mice(8), T0), T0);
  p = setPlan(p, "i1", plan);
  assert.equal(planSheetFor(p, "d1")?.id, "i1");
  assert.deepEqual(resultsOf(p, "d1").map((s) => s.id), ["r1"]);
  assert.equal(planDeviations(plan, data.table, resultsOf(p, "d1")).length, 2);
  assert.deepEqual(planFacts(p, "d1"), { written: "2026-10-09", locked: true, deviations: 2,
    unexplained: 2, sheetId: "i1", firstUnexplained: "r1" });
});

test("saved plans are read back; junk is dropped", () => {
  const plan = { ...lockPlan(planFromResults(welch, mice(8), T0), T1),
    changes: [{ at: T1, what: "n per group: 8 → 10", reason: "x" }] };
  assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(plan))), plan);
  assert.equal(parsePlan(null), undefined);
  assert.equal(parsePlan({ test: {} }), undefined);
  const e = parsePlan({ test: { analysisId: "column" }, nPerGroup: -3, alpha: 7 })!;
  assert.equal(e.nPerGroup, null);
  assert.equal(e.alpha, 0.05);
  assert.equal(e.test.tails, "two");
  assert.equal(emptyPlan(T0).test.label, "Welch t test");
});
