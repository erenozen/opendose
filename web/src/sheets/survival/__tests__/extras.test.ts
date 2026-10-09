// Survival extras: options, the engine requests of the run, the wording
// of "median not reached", the pairwise header and the methods text.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { describeResult } from "../../../report/describe.ts";
import {
  adjustedHeader, controlIndex, DEFAULT_SURVIVAL_OPTIONS, lastCommonTime, normalizeSurvivalOptions,
  notReachedByGroup, notReachedText, runSurvival, survivalMethodsText, survivalWarnings,
} from "../extras.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const table = (groups: Record<string, [number, number][]>, xUnit = "days") => normalizeTable({
  type: "survival", xUnit,
  datasets: Object.entries(groups).map(([name, rows]) => ({
    name, subTitles: ["Time", "Event"], rows: rows.map(([t, e]) => [String(t), String(e)]),
  })),
});

const FOUR = table({
  Vehicle: [[5, 1], [8, 1], [20, 0]], Low: [[7, 1], [30, 0]], Mid: [[12, 1], [40, 0]], High: [[20, 1], [60, 0]],
});

test("options: {} from older sheets gets the defaults; bad values are dropped", () => {
  assert.deepEqual(normalizeSurvivalOptions({}), DEFAULT_SURVIVAL_OPTIONS);
  assert.deepEqual(normalizeSurvivalOptions(null), DEFAULT_SURVIVAL_OPTIONS);
  const o = normalizeSurvivalOptions({ pairwiseFamily: "control", pairwiseControl: "Low",
    pairwiseCorrection: "bonferroni", trend: true, survivalAt: 14, rmstTau: -3 });
  assert.deepEqual(o, { pairwiseFamily: "control", pairwiseControl: "Low", pairwiseCorrection: "bonferroni",
    trend: true, survivalAt: 14, rmstTau: null });
  assert.equal(normalizeSurvivalOptions({ pairwiseCorrection: "tukey" }).pairwiseCorrection, "holm_sidak");
});

test("header: adjusted for k comparisons (Holm-Šídák)", () => {
  assert.equal(adjustedHeader(6, "holm_sidak"), "adjusted for 6 comparisons (Holm-Šídák)");
  assert.equal(adjustedHeader(3, "bonferroni"), "adjusted for 3 comparisons (Bonferroni)");
  assert.equal(adjustedHeader(1, "none"), "not adjusted for the 1 comparison");
});

test("last common time: the smallest of the groups' largest times", () => {
  assert.equal(lastCommonTime(FOUR), 20);
  assert.equal(lastCommonTime(normalizeTable({ type: "survival", datasets: [{ name: "A", rows: [["", ""]] }] })), null);
  assert.equal(controlIndex(["A", "B", "C"], "C"), 2);
  assert.equal(controlIndex(["A", "B", "C"], "gone"), 0);
});

test("median not reached: percentage and last follow-up in the table's unit", () => {
  const ex = { median_reached: false, fraction_at_last: 0.625, last_time: 60 };
  assert.equal(notReachedText(ex, "days"), "not reached: 63% survived to day 60 (last follow-up)");
  assert.equal(notReachedText(ex, ""), "not reached: 63% survived to time 60 (last follow-up)");
  assert.equal(notReachedText({ median_reached: true, median: 12 }, "days"), null);
  assert.deepEqual(notReachedByGroup({ groups: [
    { name: "A", explanation: { median_reached: true } },
    { name: "B", explanation: ex },
  ] }, "weeks"), { B: "not reached: 63% survived to week 60 (last follow-up)" });
});

/** A fake engine that records the requests and answers each analysis. */
function fakeEngine(answers: Record<string, any>) {
  const calls: any[] = [];
  return {
    calls,
    analyze: (payload: any) => {
      calls.push(payload);
      return answers[payload.analysis] ?? { error: "no answer" };
    },
  };
}

test("run: survival, then pairwise (3+ groups), survival at the default time and RMST", () => {
  const e = fakeEngine({
    survival: { curves: { Vehicle: {}, Low: {}, Mid: {}, High: {} }, warnings: ["few"] },
    survival_pairwise: { comparisons: [{ a: "Low", b: "Vehicle" }], warnings: ["few"] },
    survival_at_time: { groups: [] },
    rmst: { tau: 20 },
  });
  const r = runSurvival(e, FOUR, { pairwiseFamily: "control", pairwiseControl: "Mid", trend: true });
  assert.deepEqual(e.calls.map((c) => c.analysis), ["survival", "survival_pairwise", "survival_at_time", "rmst"]);
  assert.deepEqual(e.calls[1].options, { family: "control", control: 2, correction: "holm_sidak" });
  assert.deepEqual(e.calls[2].options, { times: [20] });
  assert.deepEqual(e.calls[3].options, {});
  assert.equal(r.extras.at_time_used, 20);
  assert.equal(r.extras.at_time_default, true);
  assert.equal(r.extras.trend_shown, true);
  assert.deepEqual(survivalWarnings(r), ["few"]);

  const e2 = fakeEngine({ survival: { curves: { A: {}, B: {} } }, survival_at_time: {}, rmst: {} });
  runSurvival(e2, FOUR, { survivalAt: 10, rmstTau: 15 });
  assert.deepEqual(e2.calls.map((c) => c.analysis), ["survival", "survival_at_time", "rmst"]);
  assert.deepEqual(e2.calls[1].options, { times: [10] });
  assert.deepEqual(e2.calls[2].options, { tau: 15 });

  const e3 = fakeEngine({ survival: { error: "bad" } });
  assert.deepEqual(runSurvival(e3, FOUR, {}), { error: "bad" });
  assert.equal(e3.calls.length, 1);
});

const RESULT = {
  analysis: "survival", logrank: { chi2: 9, df: 3, p: 0.03 },
  curves: { Vehicle: { n: 3 }, Low: { n: 2 }, Mid: { n: 2 }, High: { n: 2 } },
  extras: {
    trend_shown: true,
    pairwise: {
      comparisons: [{ a: "Vehicle", b: "Low" }], family_size: 6, correction: "holm_sidak",
      family: { label: "all pairs: 6 comparisons" }, trend: { chi2: 11.8, p: 0.0006, scores: [1, 2, 3, 4] },
    },
    at_time: { groups: [] }, at_time_used: 20,
    rmst: { tau: 20, reference: "Vehicle" },
  },
};

test("methods text names the pairwise correction, the trend test, survival at t and RMST", () => {
  const t = survivalMethodsText(RESULT, FOUR, "Software.");
  assert.match(t, /Kaplan-Meier product-limit method/);
  assert.match(t, /every pair of groups was compared with its own two-group log-rank test, and the P values were adjusted for 6 comparisons with the Holm-Šídák method/);
  assert.match(t, /log-rank test for trend .*scores 1, 2, 3, 4/);
  assert.match(t, /Survival at day 20/);
  assert.match(t, /restricted mean survival time .* up to day 20/);
  assert.match(t, /Software\.$/);
  const noTrend = survivalMethodsText({ ...RESULT, extras: { ...RESULT.extras, trend_shown: false } }, FOUR, "S.");
  assert.doesNotMatch(noTrend, /trend/);
});

test("legend / report: the pairwise tests and their correction", () => {
  const info = describeResult(RESULT);
  assert.equal(info.test, "log-rank (Mantel-Cox) test and the log-rank test for trend");
  assert.equal(info.posthoc, "pairwise log-rank tests (all pairs, 6 comparisons)");
  assert.equal(info.multiplicity, "corrected");
  assert.equal(info.correction, "Holm-Šídák");
  const plain = describeResult({ ...RESULT, extras: {} });
  assert.equal(plain.test, "log-rank (Mantel-Cox) test");
  assert.equal(plain.posthoc, null);
});
