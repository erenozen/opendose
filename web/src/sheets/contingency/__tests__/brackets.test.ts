// Brackets for the pairs of rows on the contingency graphs (P-14): which
// pairs, their adjusted P, where they sit on a category axis with stacked
// bars, and what the legend says. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFormat, measureTraces, tagTrace, type Trace } from "../../../graph/apply.ts";
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel, GraphSettings } from "../../../project/types.ts";
import { contingencyBars, GRAPH_CT_GROUPED, GRAPH_CT_PERCENT, GRAPH_CT_STACKED } from "../bars.ts";
import { ctBracketLegend, ctBracketRefusal, ctBracketsDrawn, ctComparisons } from "../brackets.ts";

// The plan's acceptance data: WT 18/20, Het 15/20, KO 5/20 positive.
const table = (titles = ["WT", "Het", "KO"]): DataTableModel => normalizeTable({
  type: "contingency", x: ["", "", ""], rowTitles: titles,
  datasets: [
    { name: "Positive", rows: [["18"], ["15"], ["5"]] },
    { name: "Negative", rows: [["2"], ["5"], ["15"]] },
  ],
});

// engine/tests/reference/pairwise_proportions.py (scipy per pair,
// statsmodels multipletests "holm"): raw 0.4075, 1.240e-4, 0.004427;
// Holm 0.4075, 3.719e-4, 0.008853 (the e2e-results P-14 pins).
const pairwise = (method = "holm") => ({
  comparisons: [
    { pair: "WT vs. Het", rows: [0, 1], test: "fisher", p_unadjusted: 0.40753, p_adjusted: 0.40753,
      family_size: 3, method },
    { pair: "WT vs. KO", rows: [0, 2], test: "chi_square", p_unadjusted: 1.2397e-4, p_adjusted: 3.7190e-4,
      family_size: 3, method },
    { pair: "Het vs. KO", rows: [1, 2], test: "chi_square", p_unadjusted: 0.0044266, p_adjusted: 0.0088533,
      family_size: 3, method },
  ],
  method, approach: method === "bh" ? "fdr" : "fwer", test: "auto",
  family: { size: 3, method, label: `${method === "bh" ? "Benjamini-Hochberg" : "Holm"}, 3 comparisons (all pairs of 3 rows)` },
});
const result = (method?: string) => ({ analysis: "contingency", rows: 3, cols: 2, pairwise_rows: pairwise(method) });
const graph = (graphType: string, comparisons?: object): { graphType: string; settings: GraphSettings } =>
  ({ graphType, settings: { titles: { x: "", y: "" }, scheme: "default",
    ...(comparisons ? { format: { comparisons } } : {}) } as GraphSettings });

test("the pairs of rows become comparisons of rows with their Holm-adjusted P", () => {
  const set = ctComparisons(result(), table(), GRAPH_CT_PERCENT)!;
  assert.deepEqual(set.comparisons, [
    { a: "WT", b: "Het", p: 0.40753 }, { a: "WT", b: "KO", p: 3.7190e-4 },
    { a: "Het", b: "KO", p: 0.0088533 }]);
  assert.equal(set.unmatched, 0);
  assert.equal(set.label, "pairs of rows, adjusted P (Holm)");
  assert.equal(set.letters, false, "the rows are not the graph's data sets: no compact letters");
  assert.equal(ctComparisons(result("bh"), table(), GRAPH_CT_STACKED)!.label,
    "pairs of rows, q values (Benjamini-Hochberg)");
});

test("no pairs without pairwise results; a pair with no test is left out and counted", () => {
  assert.equal(ctComparisons({ analysis: "contingency" }, table(), GRAPH_CT_PERCENT), null);
  assert.equal(ctComparisons(null, table(), GRAPH_CT_PERCENT), null);
  const r = result();
  r.pairwise_rows.comparisons[0] = { ...r.pairwise_rows.comparisons[0], p_adjusted: null as never };
  const set = ctComparisons(r, table(), GRAPH_CT_STACKED)!;
  assert.equal(set.comparisons.length, 2);
  assert.equal(set.unmatched, 1);
});

test("grouped bars and rows with the same name refuse, with the reason", () => {
  assert.equal(ctBracketRefusal(GRAPH_CT_PERCENT, table()), null);
  assert.equal(ctBracketRefusal(GRAPH_CT_STACKED, table()), null);
  assert.match(ctBracketRefusal(GRAPH_CT_GROUPED, table())!, /^grouped bars show each row as a cluster/);
  assert.equal(ctComparisons(result(), table(), GRAPH_CT_GROUPED), null);
  assert.match(ctBracketRefusal(GRAPH_CT_PERCENT, table(["WT", "WT", "KO"]))!, /both named “WT”/);
});

/** The contingency plot's bars as CtPlot builds them (category X, stacked). */
function stackedFigure(percent: boolean) {
  const data = contingencyBars(table());
  const traces: Trace[] = data.series.map((s, d) => tagTrace({
    type: "bar", name: s.name, x: data.groups, y: percent ? s.percent : s.counts,
  }, { ds: d, role: "bar" }));
  const layout = { barmode: "stack", xaxis: { type: "category" }, yaxis: {} };
  return { traces, layout, groups: data.groups };
}

test("on a category axis with stacked bars, each row sits at its index and its stack top counts", () => {
  const { traces, layout } = stackedFigure(false);
  const m = measureTraces(traces, layout);
  // one synthetic bar per position: the row totals 20, 20, 20
  const stack = m.find((t) => !t.meta)!;
  assert.deepEqual(stack.x, [0, 1, 2]);
  assert.deepEqual(stack.y, [20, 20, 20]);
  // other graphs measure exactly as before (the same array)
  const plain = [{ type: "scatter", x: [0, 1], y: [1, 2] }];
  assert.equal(measureTraces(plain, { xaxis: {} }), plain);
  // an explicit category order wins
  const ordered = measureTraces([{ type: "scatter", x: ["KO", "WT"], y: [1, 2] }],
    { xaxis: { type: "category", categoryorder: "array", categoryarray: ["WT", "Het", "KO"] } });
  assert.deepEqual(ordered[0].x, [2, 0]);
});

test("brackets join the rows' stacks above 100% on the percent graph, with the adjusted P", () => {
  const { traces, layout, groups } = stackedFigure(true);
  const set = ctComparisons(result(), table(), GRAPH_CT_PERCENT)!;
  const out = applyFormat(traces, layout, { comparisons: { show: true, display: "p" }, pStyle: "graphpad" }, {
    dark: false, scheme: "default", datasets: ["Positive", "Negative"], comparisons: set.comparisons,
    groupX: (name) => { const i = groups.indexOf(name); return i < 0 ? null : i; },
  });
  const lines = out.layout.shapes.filter((s: Trace) => s.name === "bracket" && s.y0 === s.y1);
  const labels = out.layout.annotations.filter((a: Trace) => a.name === "bracket-label");
  assert.deepEqual(labels.map((a: Trace) => a.text), ["P = 0.4075", "P = 0.0089", "P = 0.00037"]);
  assert.deepEqual(lines.map((s: Trace) => [s.x0, s.x1]), [[0, 1], [1, 2], [0, 2]]);
  // every bracket clears the 100% stack top: one step (10% of the span)
  // up, then a tier per bracket sharing a row (as on column graphs)
  const ys = lines.map((s: Trace) => s.y0);
  assert.deepEqual(ys.map((y: number) => Math.round(y * 1e9) / 1e9), [110, 120, 130]);
  // the counts graph: the row totals (20) are the stack tops
  const counts = stackedFigure(false);
  const c = applyFormat(counts.traces, counts.layout, { comparisons: { show: true } }, {
    dark: false, scheme: "default", datasets: ["Positive", "Negative"], comparisons: set.comparisons,
    groupX: (name) => { const i = counts.groups.indexOf(name); return i < 0 ? null : i; },
  });
  const cy = c.layout.shapes.filter((s: Trace) => s.name === "bracket" && s.y0 === s.y1).map((s: Trace) => s.y0);
  assert.deepEqual(cy.map((y: number) => Math.round(y * 1e9) / 1e9), [22, 24, 26]);
});

test("the legend names the pairs, the test per pair and the family; stars point to the exact P", () => {
  const stars = ctBracketLegend(graph(GRAPH_CT_PERCENT, { show: true }), table(), result())!;
  assert.equal(stars, "Brackets compare pairs of rows, each tested by Fisher's exact test when any "
    + "expected count was below 5 and otherwise by the chi-square test, with P values adjusted for "
    + "3 comparisons (Holm). The exact adjusted P values are in the results (Pairs of rows).");
  const exact = ctBracketLegend(graph(GRAPH_CT_STACKED, { show: true, display: "p" }), table(), result())!;
  assert.ok(exact.endsWith("with P values adjusted for 3 comparisons (Holm)."), exact);
  const fdr = ctBracketLegend(graph(GRAPH_CT_STACKED, { show: true }), table(), result("bh"))!;
  assert.match(fdr, /with q values: false discovery rate controlled over 3 comparisons \(Benjamini-Hochberg\)\. The exact q values/);
  assert.equal(ctBracketLegend(graph(GRAPH_CT_PERCENT), table(), result()), null, "brackets off");
  assert.equal(ctBracketLegend(graph(GRAPH_CT_PERCENT, { show: true }), table(), {}), null, "no pairs");
  assert.match(ctBracketLegend(graph(GRAPH_CT_GROUPED, { show: true }), table(), result())!,
    /^No brackets between rows: grouped bars show each row as a cluster of bars/);
  assert.equal(ctBracketsDrawn(graph(GRAPH_CT_GROUPED, { show: true }), table(), result()), false);
  assert.equal(ctBracketsDrawn(graph(GRAPH_CT_PERCENT, { show: true }), table(), result()), true);
});
