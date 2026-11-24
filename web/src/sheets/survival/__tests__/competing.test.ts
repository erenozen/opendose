// Competing risks (P-90): options, names of the kinds of event, the
// engine request, the graph's curves and settings, the methods text and
// the headline facts. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { keyFacts } from "../../../components/answer/keyFacts.ts";
import {
  causeCodes, causeLabel, competingMethodsText, competingYTitle, DEFAULT_COMPETING_OPTIONS, graphCause,
  lastCommonFollowUp, normalizeCompetingGraph, normalizeCompetingOptions, plotCurves, runCompeting,
} from "../competing.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const table = (groups: Record<string, [number | string, number | string][]>, xUnit = "months") =>
  normalizeTable({
    type: "survival", xUnit,
    datasets: Object.entries(groups).map(([name, rows]) => ({
      name, subTitles: ["Time", "Event"], rows: rows.map(([t, e]) => [String(t), String(e)]),
    })),
  });

const T = table({ A: [[5, 1], [8, 2], [20, 0], [3, "1.5"]], B: [[7, 2], [30, 0], [12, 3], [-2, 1]] });

test("options: older or bad values fall back to the defaults", () => {
  assert.deepEqual(normalizeCompetingOptions({}), DEFAULT_COMPETING_OPTIONS);
  assert.deepEqual(normalizeCompetingOptions(null), DEFAULT_COMPETING_OPTIONS);
  assert.deepEqual(normalizeCompetingOptions({ causeLabels: { 1: "Tumour", x: "no", 2: 5 }, atTime: -1 }),
    { causeLabels: { 1: "Tumour" }, atTime: null });
  assert.equal(normalizeCompetingOptions({ atTime: 20 }).atTime, 20);
});

test("cause names: the user's, else Cause k", () => {
  assert.equal(causeLabel(1, { 1: " Tumour " }), "Tumour");
  assert.equal(causeLabel(2, { 1: "Tumour", 2: "  " }), "Cause 2");
  assert.equal(causeLabel(3, undefined), "Cause 3");
});

test("codes and the default time read only the usable rows", () => {
  assert.deepEqual(causeCodes(T), [1, 2, 3]);
  // A's last follow-up is 20, B's 30 (the row at -2 is not usable)
  assert.equal(lastCommonFollowUp(T), 20);
  assert.equal(lastCommonFollowUp(normalizeTable({ type: "survival", datasets: [] })), null);
});

test("run: one engine request with the time; names and time travel on the result", () => {
  const calls: any[] = [];
  const engine = { analyze: (p: any) => { calls.push(p); return { analysis: "competing_risks", causes: [] }; } };
  const r = runCompeting(engine, T, { causeLabels: { 1: "Tumour" } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].analysis, "competing_risks");
  assert.deepEqual(calls[0].options, { times: [20] });
  assert.deepEqual(calls[0].data.datasets[0].ys[1], [8, 2]);
  assert.deepEqual(r.cause_labels, { 1: "Tumour" });
  assert.equal(r.at_time_used, 20);
  assert.equal(r.at_time_default, true);
  assert.equal(r.at_time_label, "month 20");
  const r2 = runCompeting(engine, T, { atTime: 10 });
  assert.deepEqual(calls[1].options, { times: [10] });
  assert.equal(r2.at_time_default, false);
  const err = runCompeting({ analyze: () => ({ error: "no survival data" }) }, T, {});
  assert.deepEqual(err, { error: "no survival data" });
});

const RESULT = {
  analysis: "competing_risks", group_names: ["Drug A", "Drug B"], ci_level: 0.95,
  cause_labels: { 1: "Tumour" }, at_time_used: 20, at_time_label: "month 20",
  causes: [
    { code: 1, gray: { chi2: 1.9884703241645945, df: 1, p: 0.1585009123403159 }, groups: [
      { name: "Drug A", n: 98, events: 30, points: [{ time: 0, cif: 0, lower: null, upper: null },
        { time: 9, cif: 0.1, lower: 0.05, upper: 0.2 }, { time: 24, cif: 0.1, lower: 0.05, upper: 0.2 }],
      at_times: [{ time: 20, cif: 0.17346938775510196, se: 0.039, lower: 0.106, upper: 0.255 }] },
      { name: "Drug B", n: 102, events: 27, points: [{ time: 0, cif: 0, lower: null, upper: null }],
        at_times: [{ time: 20, cif: 0.2549019607843137 }] }] },
    { code: 2, gray: { chi2: 0.0885672326967711, df: 1, p: 0.7660065859015868 }, groups: [] },
  ],
};

test("graph: the chosen kind of event, curves as 1 - F for the step plot, the Y title", () => {
  assert.deepEqual(normalizeCompetingGraph({}), { cause: null, ci: "none", scale: "percent", censorMarks: false });
  assert.deepEqual(normalizeCompetingGraph({ cause: 2, ci: "band", scale: "fraction", censorMarks: true }),
    { cause: 2, ci: "band", scale: "fraction", censorMarks: true });
  assert.equal(graphCause(RESULT, normalizeCompetingGraph({}))?.code, 1);
  assert.equal(graphCause(RESULT, normalizeCompetingGraph({ cause: 2 }))?.code, 2);
  assert.equal(graphCause(RESULT, normalizeCompetingGraph({ cause: 9 }))?.code, 1);
  const curves = plotCurves(RESULT.causes[0]);
  const p = curves["Drug A"].points[1];
  // the plot draws 1 - survival: back to F and its limits
  assert.ok(Math.abs((1 - p.survival) - 0.1) < 1e-15);
  assert.ok(Math.abs((1 - p.upper) - 0.05) < 1e-15);
  assert.ok(Math.abs((1 - p.lower) - 0.2) < 1e-15);
  // no limits at F = 0: the band collapses onto the curve
  assert.deepEqual(curves["Drug A"].points[0], { time: 0, survival: 1, lower: 1, upper: 1 });
  assert.equal(competingYTitle("Tumour", "percent"), "Cumulative incidence of Tumour (%)");
  assert.equal(competingYTitle("Tumour", "fraction"), "Cumulative incidence of Tumour");
});

test("methods: Aalen-Johansen, never 1 - Kaplan-Meier, Gray's test with groups", () => {
  const text = competingMethodsText(RESULT, T, "Software.");
  assert.match(text, /\(Tumour, Cause 2\)/);
  assert.match(text, /Aalen-Johansen/);
  assert.match(text, /1 − Kaplan-Meier was not used/);
  assert.match(text, /Gray's test \(Gray 1988, Ann Stat 16:1141\)/);
  assert.match(text, /at month 20\. Software\.$/);
  assert.equal(competingMethodsText({ error: "x" }, T, "S"), "");
});

test("key facts: Gray's P per kind of event, with the incidence at the time", () => {
  const k = keyFacts(RESULT) as any;
  assert.equal(k.kind, "figures");
  assert.equal(k.items[0].title, "Gray's test: Tumour");
  assert.equal(k.items[0].figure.name, "P value");
  assert.equal(k.items[0].figure.value, "0.1585");
  assert.deepEqual(k.items[0].figure.facts, ["χ²(1) = 1.988", "Drug A 0.1735 at month 20", "Drug B 0.2549 at month 20"]);
  assert.equal(k.items[1].title, "Gray's test: Cause 2");
  const one = keyFacts({ ...RESULT, group_names: ["Drug A"], causes: [{ ...RESULT.causes[0], gray: null,
    groups: [RESULT.causes[0].groups[0]] }] }) as any;
  assert.equal(one.items[0].figure.name, "Cumulative incidence at month 20");
  assert.equal(one.items[0].figure.value, "0.1735");
  assert.equal(one.items[0].figure.ci, "95% CI 0.106 to 0.255");
  const failed = keyFacts({ ...RESULT, causes: [{ code: 3, gray: { chi2: null, p: null, df: 1 },
    note: "Gray's test could not be computed", groups: [] }] }) as any;
  assert.equal(failed.items[0].error, "Gray's test could not be computed");
});
