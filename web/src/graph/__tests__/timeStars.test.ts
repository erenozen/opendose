// Stars at each time point (P-105) and log-rank brackets beside a
// Kaplan-Meier graph (P-111): which comparisons qualify, the labels, how
// they stack and where applyFormat puts them. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFormat, tagTrace, type Trace } from "../apply.ts";
import { normalizeFormat } from "../format.ts";
import { laneMarginBrackets } from "../marginBrackets.ts";
import { setReportPrefs } from "../../report/pformat.ts";
import { formatPStyle } from "../significance.ts";
import { DEFAULT_REPORT } from "../../report/prefs.ts";
import {
  perTimeClause, stackTimeStars, timeReference, timeStars, timeStarsClause,
} from "../timeStars.ts";
import { timePointComparisons } from "../../sheets/grouped/comparisons.ts";
import { tcComparisons, tcFamilyX } from "../../sheets/assays/timecourse/timeStars.ts";
import { survivalBracketClause, survivalComparisons } from "../../sheets/survival/brackets.ts";
import { legendSentence } from "../legend.ts";
import { normalizeTable } from "../../project/table.ts";

setReportPrefs(DEFAULT_REPORT);

// engine/tests/reference/time_stars.py: Sidak within each day
const DAYS = ["Day 0", "Day 7", "Day 14", "Day 21"];
const P = [0.9999752111657251, 0.01888699551219464, 0.0009765391475019382, 8.573326552206925e-21];
const two = DAYS.map((family, i) => ({ a: "Vehicle", b: "Drug", p: P[i], family }));

test("timeReference: two groups, a shared control, or no reading", () => {
  assert.deepEqual(timeReference(two), { ok: true, reference: null });
  const dunnett = DAYS.flatMap((family) => [{ a: "Vehicle", b: "Low", p: 0.01, family },
    { a: "Vehicle", b: "High", p: 0.001, family }]);
  assert.deepEqual(timeReference(dunnett), { ok: true, reference: "Vehicle" });
  const tukey = [...dunnett, { a: "Low", b: "High", p: 0.2, family: "Day 0" }];
  const r = timeReference(tukey);
  assert.equal(r.ok, false);
  assert.match((r as { why: string }).why, /no common group/);
  assert.equal(timeReference([{ a: "A", b: "B", p: 0.1 }]).ok, false);
  assert.equal(timeReference([]).ok, false);
});

test("timeStars: the star of each day in the project's P style, filters applied", () => {
  const s = timeStars(two, { show: true, placement: "time" }, "graphpad", false);
  assert.deepEqual(s.map((x) => [x.family, x.text]), [["Day 0", "ns"], ["Day 7", "*"],
    ["Day 14", "***"], ["Day 21", "****"]]);
  assert.ok(s.every((x) => x.group === null));
  // hide ns, a threshold, an unticked day
  assert.equal(timeStars(two, { show: true }, "graphpad", true).length, 3);
  assert.equal(timeStars(two, { show: true, threshold: 0.001 }, "graphpad", false).length, 2);
  const hidden = timeStars(two, { show: true, hidden: ["Day 7␟Vehicle␟Drug"] }, "graphpad", false);
  assert.deepEqual(hidden.map((x) => x.family), ["Day 0", "Day 14", "Day 21"]);
  // APA: three stars at most; exact P on request
  assert.equal(timeStars(two, { show: true }, "apa", false)[3].text, "***");
  // exact P: the graph's P formatter, as on brackets
  const exact = timeStars(two, { show: true, display: "p" }, "graphpad", false);
  assert.deepEqual(exact.map((x) => x.text), P.map((p) => formatPStyle(p, "graphpad", "P = ")));
  assert.deepEqual(exact.slice(1).map((x) => x.text), ["P = 0.0189", "P = 0.00098", "P < 0.0001"]);
  assert.ok(exact.every((x) => x.isP));
});

test("stackTimeStars: one level per group, the same order at every day", () => {
  const cmps = ["Day 0", "Day 7"].flatMap((family) => [{ a: "Vehicle", b: "High", p: 0.001, family },
    { a: "Vehicle", b: "Low", p: 0.01, family }]);
  const s = stackTimeStars(timeStars(cmps, { show: true }, "graphpad", false), ["Vehicle", "Low", "High"]);
  assert.deepEqual(s.map((x) => [x.family, x.group, x.level]),
    [["Day 0", "Low", 0], ["Day 0", "High", 1], ["Day 7", "Low", 0], ["Day 7", "High", 1]]);
});

const tc = {
  groups: ["Vehicle", "Drug"], times: ["0", "7", "14"],
  group_difference_at_time: { method: "sidak", family: { size: 3, method: "sidak" },
    comparisons: ["0", "7", "14"].map((t, i) => ({ pair: "Vehicle vs. Drug", family: `Time ${t}`, time: t,
      p_adjusted: [1, 0.006, 0.00001][i], p_unadjusted: 0.5 })) },
};

test("time-course model: comparisons at each time and where each time sits", () => {
  const set = tcComparisons(tc)!;
  assert.equal(set.timePoints, true);
  assert.equal(set.letters, false);
  assert.deepEqual(set.comparisons.map((c) => [c.family, c.p]), [["Time 0", 1], ["Time 7", 0.006],
    ["Time 14", 0.00001]]);
  assert.match(set.label, /adjusted for 3 comparisons \(Šídák\)/);
  assert.deepEqual([...tcFamilyX(tc)], [["Time 0", 0], ["Time 7", 7], ["Time 14", 14]]);
  // times that are not numbers: positions on the category axis
  const cat = { ...tc, times: ["pre", "7", "14"], group_difference_at_time: {
    ...tc.group_difference_at_time, comparisons: tc.group_difference_at_time.comparisons
      .map((c, i) => (i === 0 ? { ...c, time: "pre", family: "Time pre" } : c)) } };
  assert.deepEqual([...tcFamilyX(cat)], [["Time pre", 0], ["Time 7", 1], ["Time 14", 2]]);
  assert.equal(tcComparisons({ error: "x" }), null);
});

test("the legend clause names the analysis, where exact P are, and the curve-level test", () => {
  assert.equal(timeStarsClause("Šídák multiple comparisons", null, "the interaction tests the curves"),
    "Stars above each time point compare the two groups at that time (Šídák multiple comparisons); "
    + "exact P values are in the results. They are not a test of the curves: the interaction tests the curves");
  assert.match(perTimeClause(tcComparisons(tc)), /Group × Time test asks whether the curves differ in shape/);
  assert.equal(perTimeClause(null), "");
});

// a grouped table: rows = days, data sets Vehicle and Drug
const table = normalizeTable({
  type: "grouped", x: DAYS.map(() => ""), xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "Volume",
  rowTitles: DAYS, subcolumnFormat: "replicates", replicateLayout: "side_by_side",
  datasets: [{ name: "Vehicle", rows: DAYS.map(() => ["1", "2"]) }, { name: "Drug", rows: DAYS.map(() => ["1", "2"]) }],
});
const twoWay = { sources: { residual: { ms: 1, df: 8 } }, multiple_comparisons: { method: "sidak",
  comparisons: DAYS.map((d, i) => ({ family: d, pair: "Vehicle vs. Drug", p_adjusted: P[i] })) } };

test("lines graph: the comparisons within each row, and the legend of their stars", () => {
  const set = timePointComparisons(twoWay, table)!;
  assert.equal(set.timePoints, true);
  assert.equal(set.comparisons.length, 4);
  assert.match(set.curveTest!, /interaction tests whether the curves differ in shape/);
  const graph = { graphType: "grouped_lines", settings: { grouped: {}, format: { comparisons:
    { show: true, placement: "time" } } } } as never;
  const s = legendSentence(graph, table, twoWay);
  assert.match(s, /Stars above each time point compare the two groups at that time \(Šídák multiple comparisons\); exact P values are in the results\. They are not a test of the curves: the two-way ANOVA's interaction/);
  assert.match(s, /\* P ≤ 0\.05/);
  // multiple t tests point to a model of every time point
  const multiT = { rows: DAYS.map((d, i) => ({ row: d, p: P[i], p_adjusted: P[i] })), names: ["Vehicle", "Drug"],
    n_tests: 4, method: "holm_sidak", approach: "correct" };
  assert.match(timePointComparisons(multiT, table)!.curveTest!, /one model of every time point/);
});

test("applyFormat draws one star per day above the highest mark there", () => {
  const traces: Trace[] = [0, 1].map((ds) => tagTrace({ x: [0, 1, 2, 3], y: ds ? [10, 20, 30, 40] : [10, 30, 50, 80],
    mode: "lines+markers", marker: { color: ds ? "#e0730a" : "#2a78d6" },
    error_y: { type: "data", array: [1, 1, 1, 1], visible: true } }, { ds, role: "points" }));
  const ctx = { dark: false, scheme: "default" as const, datasets: ["Vehicle", "Drug"], comparisons: two,
    groupX: (_n: string, family?: string) => (family ? DAYS.indexOf(family) : null), groupHalf: 0.2 };
  const out = applyFormat(traces, { xaxis: {}, yaxis: {} },
    normalizeFormat({ comparisons: { show: true, placement: "time" } }), ctx);
  const stars = out.layout.annotations.filter((a: { name?: string }) => a.name === "time-star");
  assert.deepEqual(stars.map((a: { x: number; text: string }) => [a.x, a.text]),
    [[0, "ns"], [1, "*"], [2, "***"], [3, "****"]]);
  // above Vehicle's mark and its error bar at each day
  stars.forEach((a: { y: number }, i: number) => assert.ok(a.y > [10, 30, 50, 80][i] + 1));
  // the same comparisons as brackets: two lines at one X give no bracket
  const br = applyFormat(traces, { xaxis: {}, yaxis: {} }, normalizeFormat({ comparisons: { show: true } }), ctx);
  assert.equal((br.layout.annotations ?? []).filter((a: { name?: string }) => a.name === "bracket-label").length, 0);
});

// ------------------------------------------------------------ P-111

test("laneMarginBrackets: shortest first, touching brackets in separate lanes", () => {
  const b = laneMarginBrackets([
    { key: "A-C", ya: 80, yb: 20 }, { key: "A-B", ya: 80, yb: 50 }, { key: "B-C", ya: 50, yb: 20 }], 3);
  const lane = Object.fromEntries(b.map((x) => [x.key, x.lane]));
  // A-B and B-C share B's end: separate lanes; A-C overlaps both
  assert.notEqual(lane["A-B"], lane["B-C"]);
  assert.equal(lane["A-C"], 2);
  // curves ending at one level: widened to the minimum span
  const flat = laneMarginBrackets([{ key: "x", ya: 40, yb: 40 }], 4)[0];
  assert.deepEqual([flat.lo, flat.hi], [38, 42]);
});

// a 3-group survival result with pairwise log-rank (Holm)
const km = {
  curves: { A: { points: [] }, B: { points: [] }, C: { points: [] } },
  logrank: { p: 0.001 },
  extras: { pairwise: { correction: "holm", family_size: 3, family: { label: "every pair" },
    comparisons: [{ a: "A", b: "B", p_adjusted: 0.04, p_unadjusted: 0.02 },
      { a: "A", b: "C", p_adjusted: 0.0009, p_unadjusted: 0.0003 },
      { a: "B", b: "C", p_adjusted: 0.3, p_unadjusted: 0.3 }] } },
};

test("survival: the pairwise log-rank family and its adjusted P", () => {
  const set = survivalComparisons(km)!;
  assert.equal(set.margin, true);
  assert.deepEqual(set.comparisons.map((c) => [c.a, c.b, c.p]), [["A", "B", 0.04], ["A", "C", 0.0009],
    ["B", "C", 0.3]]);
  assert.equal(set.label, "Pairwise log-rank tests, every pair of groups, P adjusted for 3 comparisons (Holm)");
  assert.equal(survivalBracketClause(km), "Brackets at the right join the ends of the curves compared "
    + "(Pairwise log-rank tests, every pair of groups, P adjusted for 3 comparisons (Holm))");
  // two groups: the log-rank test itself
  const two2 = { curves: { A: {}, B: {} }, logrank: { p: 0.012 } };
  assert.deepEqual(survivalComparisons(two2)!.comparisons, [{ a: "A", b: "B", p: 0.012 }]);
  assert.equal(survivalComparisons({ curves: { A: {} } }), null);
  assert.equal(survivalComparisons({ error: "x" }), null);
});

test("applyFormat: brackets in the right margin join the curves' ends", () => {
  const ends = [80, 50, 20];
  const traces: Trace[] = ends.map((e, ds) => tagTrace({ x: [0, 10, 20], y: [100, 90, e], mode: "lines",
    line: { shape: "hv" } }, { ds, role: "line" }));
  const out = applyFormat(traces, { xaxis: {}, yaxis: { range: [0, 105] }, margin: { r: 16 } },
    normalizeFormat({ comparisons: { show: true } }),
    { dark: false, scheme: "default", datasets: ["A", "B", "C"], comparisons: survivalComparisons(km)!.comparisons,
      marginBrackets: true });
  const labels = out.layout.annotations.filter((a: { name?: string }) => a.name === "bracket-label");
  // A-B (80 to 50) *, B-C (50 to 20) ns, A-C (80 to 20) ***: the long one furthest out
  const byText = Object.fromEntries(labels.map((a: { text: string; y: number; xshift: number }) =>
    [a.text, [a.y, a.xshift]]));
  assert.deepEqual([byText["*"][0], byText.ns[0], byText["***"][0]], [65, 35, 50]);
  assert.ok(byText["***"][1] > byText["*"][1] && byText["*"][1] !== byText.ns[1]);
  const vertical = out.layout.shapes.filter((s: { name?: string; x0: number; x1: number }) =>
    s.name === "bracket" && s.x0 === s.x1);
  assert.deepEqual(vertical.map((s: { y0: number; y1: number }) => [s.y0, s.y1])
    .sort((p: number[], q: number[]) => p[0] - q[0] || p[1] - q[1]), [[20, 50], [20, 80], [50, 80]]);
  assert.ok(vertical.every((s: { xref: string; xanchor: number }) => s.xref === "paper" && s.xanchor === 1));
  assert.ok(out.layout.margin.r > 16);
  // off by default: nothing drawn
  const off = applyFormat(traces, { xaxis: {}, yaxis: {} }, normalizeFormat({}),
    { dark: false, scheme: "default", datasets: ["A", "B", "C"], comparisons: survivalComparisons(km)!.comparisons,
      marginBrackets: true });
  assert.equal((off.layout.annotations ?? []).length, 0);
  assert.equal((off.layout.shapes ?? []).length, 0);
});
