// Unit tests for the graph-format layer. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFormat, lettersFor, tagTrace, type Trace } from "../apply.ts";
import { axisMap, generateTicks, niceStep, normInv, normCdf, elapsedLabel } from "../axes.ts";
import {
  normalizeFormat, readFormat, withDatasetFormat, withField, type GraphFormat,
} from "../format.ts";
import {
  atRisk, censoredBy, extractComparisons, resultBlocks, riskSetsFromResult,
  riskSetsFromTable,
} from "../results.ts";
import {
  compactLetters, formatP, letterName, pairKey, parseEngineLetters, pStars, splitPair,
  stackBrackets,
} from "../significance.ts";

const ctx = { dark: false, scheme: "default" as const, datasets: ["A", "B", "C"] };

function xyTraces(): Trace[] {
  return [0, 1].map((ds) => tagTrace({
    x: [1, 2, 3], y: [10 + ds, 20 + ds, 40 + ds], mode: "markers", name: `S${ds}`,
    marker: { color: ds ? "#eb6834" : "#2a78d6", symbol: "circle", size: 9,
      line: { color: "#ffffff", width: 2 } },
    error_y: { type: "data", array: [1, 2, 3], arrayminus: [1, 2, 3], visible: true },
    hovertemplate: "%{y:.4g}",
  }, { ds, role: "points", rows: [0, 1, 2] }));
}

function columnTraces(): Trace[] {
  const out: Trace[] = [];
  [[1, 2, 3], [5, 6, 7], [9, 10, 11]].forEach((vals, ds) => {
    out.push(tagTrace({ x: vals.map((_, j) => ds + (j - 1) * 0.05), y: vals, mode: "markers",
      marker: { color: "#2a78d6" } }, { ds, role: "points", rows: [0, 1, 2],
      keys: ["0:0", "1:0", "2:0"] }));
  });
  return out;
}
const columnLayout = () => ({
  xaxis: { tickvals: [0, 1, 2], ticktext: ["A", "B", "C"], range: [-0.6, 2.6] },
  yaxis: { title: { text: "Value" } },
});

test("an empty format leaves traces and layout untouched (same objects)", () => {
  const t = xyTraces(), l = { yaxis: { title: { text: "Y" } } };
  const out = applyFormat(t, l, {}, ctx);
  assert.equal(out.traces, t);
  assert.equal(out.layout, l);
  assert.deepEqual(applyFormat(t, l, readFormat({}), ctx).traces, t);
  assert.deepEqual(applyFormat(t, l, normalizeFormat({ junk: 1, x: {} }), ctx).layout, l);
});

test("normalizeFormat keeps valid fields only and clamps numbers", () => {
  const f = normalizeFormat({
    datasets: { 0: { symbol: "square", size: 400, color: "red", fillAlpha: 0.4 }, x: {} },
    y: { min: 1, max: "9", scale: "log10", extraTicks: [{ value: 5, label: "cut" }, { v: 1 }] },
    annotations: [{ id: "a1", kind: "text", text: "hi", x: 0.5, y: 0.5, ref: "paper" },
      { kind: "text" }],
    comparisons: { show: true, display: "p", threshold: 5 },
  });
  assert.deepEqual(f.datasets, { 0: { symbol: "square", size: 40, fillAlpha: 0.4 } });
  assert.deepEqual(f.y, { min: 1, scale: "log10", extraTicks: [{ value: 5, label: "cut" }] });
  assert.equal(f.annotations?.length, 1);
  assert.equal(f.comparisons?.threshold, 1);
  assert.deepEqual(normalizeFormat("nope"), {});
});

test("dataset formats merge for several datasets and unset removes", () => {
  let f: GraphFormat = withDatasetFormat({}, [0, 2], { symbol: "star", size: 12 });
  assert.deepEqual(f.datasets, { 0: { symbol: "star", size: 12 }, 2: { symbol: "star", size: 12 } });
  f = withDatasetFormat(f, [0], { symbol: undefined });
  assert.deepEqual(f.datasets?.["0"], { size: 12 });
  f = withDatasetFormat(f, [0, 2], { size: undefined, symbol: undefined });
  assert.equal(f.datasets, undefined);
  assert.deepEqual(withField({ title: "x" }, "title", undefined), {});
});

test("symbol, size, colour override and fill alpha reach the right trace", () => {
  const f: GraphFormat = { datasets: { 1: { symbol: "diamond", size: 14, color: "#112233",
    fillAlpha: 0 } } };
  const out = applyFormat(xyTraces(), {}, f, ctx);
  const t = out.traces[1];
  assert.equal(t.marker.symbol, "diamond");
  assert.equal(t.marker.size, 14);
  assert.equal(t.marker.color, "rgba(17,34,51,0)");
  // hollow marker gets an edge in its own colour
  assert.equal(t.marker.line.color, "#112233");
  // the other dataset is unchanged
  assert.deepEqual(out.traces[0], xyTraces()[0]);
});

test("error bars: direction, caps and envelope", () => {
  const up = applyFormat(xyTraces(), {}, { datasets: { 0: { errorDir: "up", errorCap: 0 } } }, ctx);
  assert.deepEqual(up.traces[0].error_y.arrayminus, [0, 0, 0]);
  assert.equal(up.traces[0].error_y.width, 0);
  const env = applyFormat(xyTraces(), {}, { datasets: { 0: { errorStyle: "envelope" } } }, ctx);
  const band = env.traces.find((t) => t.fill === "toself");
  assert.ok(band);
  assert.deepEqual(band!.y, [11, 22, 43, 37, 18, 9]);
  assert.equal(env.traces.find((t) => t.name === "S0")!.error_y.visible, false);
});

test("X error from another dataset hides that dataset", () => {
  const out = applyFormat(xyTraces(), {}, { datasets: { 0: { xErrorFrom: 1 } } }, ctx);
  assert.equal(out.traces.length, 1);
  assert.deepEqual(out.traces[0].error_x.array, [11, 21, 41]);
});

test("connecting line sorts points by X", () => {
  const t = xyTraces();
  t[0].x = [3, 1, 2]; t[0].y = [30, 10, 20];
  const out = applyFormat(t, {}, { datasets: { 0: { connect: "spline" } } }, ctx);
  assert.deepEqual(out.traces[0].x, [1, 2, 3]);
  assert.deepEqual(out.traces[0].y, [10, 20, 30]);
  assert.equal(out.traces[0].mode, "lines+markers");
  assert.equal(out.traces[0].line.shape, "spline");
});

test("plotting order and hidden columns move category positions", () => {
  const f: GraphFormat = { order: [2, 0, 1], datasets: { 1: { show: false } } };
  const out = applyFormat(columnTraces(), columnLayout(), f, { ...ctx, categorical: true });
  assert.deepEqual(out.layout.xaxis.tickvals, [0, 1]);
  assert.deepEqual(out.layout.xaxis.ticktext, ["C", "A"]);
  assert.deepEqual(out.layout.xaxis.range, [-0.6, 1.6]);
  const c = out.traces.find((t) => t.y[0] === 9)!;
  assert.ok(Math.abs(c.x[1] - 0) < 1e-9);
  // C is drawn first (back), A last
  assert.equal(out.traces[0].y[0], 9);
});

test("spaghetti joins equal keys across columns", () => {
  const out = applyFormat(columnTraces(), columnLayout(), { connect: "spaghetti" },
    { ...ctx, categorical: true });
  const lines = out.traces[0];
  assert.equal(lines.mode, "lines");
  assert.deepEqual(lines.x.slice(0, 4), [0, 1, 2, null]);
  assert.deepEqual(lines.y.slice(0, 3), [1, 5, 9]);
});

test("log10 axis with a manual range", () => {
  const out = applyFormat(xyTraces(), { yaxis: {} },
    { y: { scale: "log10", min: 1, max: 1000, numbers: "power10" } }, ctx);
  assert.equal(out.layout.yaxis.type, "log");
  assert.deepEqual(out.layout.yaxis.range, [0, 3]);
  assert.equal(out.layout.yaxis.exponentformat, "power");
});

test("log2 axis transforms data, error bars and hover", () => {
  const t = [tagTrace({ x: [0], y: [8], error_y: { type: "data", array: [8], visible: true },
    hovertemplate: "%{y:.3g}" }, { ds: 0, role: "points" })];
  const out = applyFormat(t, { yaxis: {} }, { y: { scale: "log2" } }, ctx);
  assert.deepEqual(out.traces[0].y, [3]);
  assert.deepEqual(out.traces[0].error_y.array, [1]);
  assert.deepEqual(out.traces[0].error_y.arrayminus, [0]); // 8-8 = 0 is off the scale
  assert.equal(out.traces[0].hovertemplate, "%{customdata:.3g}");
  assert.ok(out.layout.yaxis.tickvals.includes(3));
  assert.ok(out.layout.yaxis.ticktext.includes("8"));
});

test("antilog, elapsed and probability ticks", () => {
  const anti = generateTicks({ numbers: "antilog" }, -9.2, -5.5)!;
  assert.deepEqual(anti.tickvals, [-9, -8, -7, -6]);
  assert.equal(anti.ticktext[0], "1e-9");
  const el = generateTicks({ numbers: "elapsed", elapsedUnit: "h", majorStep: 0.5 }, 0, 2)!;
  assert.deepEqual(el.ticktext, ["0:00", "0:30", "1:00", "1:30", "2:00"]);
  assert.equal(elapsedLabel(90, "s", true), "1:30");
  const pr = generateTicks({ scale: "probability" }, normInv(0.04), normInv(0.96))!;
  assert.deepEqual(pr.ticktext, ["5", "10", "25", "50", "75", "90", "95"]);
  assert.ok(Math.abs(normCdf(normInv(0.975)) - 0.975) < 1e-6);
  assert.equal(niceStep(10), 2);
  assert.equal(axisMap({ scale: "ln" }).to(-1), null);
});

test("extra ticks, decimal numbering, frame and fonts", () => {
  const out = applyFormat(xyTraces(), { xaxis: {}, yaxis: { title: { text: "Y" } } }, {
    y: { numbers: "decimal", decimals: 2, majorStep: 10, minorCount: 1, ticks: "in",
      extraTicks: [{ value: 25, label: "cut", grid: true }] },
    frame: "box", font: { family: "serif", tickSize: 9, axisTitleSize: 15 },
  }, ctx);
  const y = out.layout.yaxis;
  assert.equal(y.tickformat, ",.2f");
  assert.equal(y.dtick, 10);
  assert.equal(y.minor.dtick, 5);
  assert.equal(y.ticks, "inside");
  assert.equal(y.mirror, true);
  assert.equal(y.tickfont.size, 9);
  assert.equal(y.title.font.size, 15);
  assert.match(out.layout.font.family, /Times/);
  assert.ok(out.layout.annotations.some((a: Trace) => a.text === "cut"));
  assert.equal(out.layout.shapes.length, 2);
});

test("right Y axis and discontinuous axis", () => {
  const r = applyFormat(xyTraces(), { yaxis: {} },
    { datasets: { 1: { rightAxis: true } }, y2: { title: "Other" } }, ctx);
  assert.equal(r.traces[1].yaxis, "y2");
  assert.equal(r.layout.yaxis2.side, "right");
  assert.equal(r.layout.yaxis2.title.text, "Other");
  const g = applyFormat(xyTraces(), { yaxis: { title: { text: "Y" } } },
    { y: { gap: { from: 25, to: 35 } } }, ctx);
  assert.equal(g.layout.yaxis.range[1], 25);
  assert.equal(g.layout.yaxis3.range[0], 35);
  assert.equal(g.traces.filter((t) => t.yaxis === "y3").length, 2);
  assert.ok(g.layout.annotations.some((a: Trace) => a.text === "Y" && a.textangle === -90));
});

test("legend: show, position and per-dataset text", () => {
  const t = columnTraces().map((x) => ({ ...x, showlegend: false }));
  const out = applyFormat(t, columnLayout(), { legend: { show: "show", position: "top-right" },
    datasets: { 0: { legend: "Control" } } }, { ...ctx, categorical: true });
  assert.equal(out.layout.showlegend, true);
  assert.equal(out.traces.filter((x) => x.showlegend).length, 3);
  assert.equal(out.traces[0].name, "Control");
  assert.equal(out.layout.legend.xanchor, "right");
});

test("P value summaries and labels", () => {
  assert.equal(pStars(0.2), "ns");
  assert.equal(pStars(0.05), "*");
  assert.equal(pStars(0.0099), "**");
  assert.equal(pStars(0.001), "***");
  assert.equal(pStars(0.00001), "****");
  assert.equal(formatP(0.01234), "P = 0.0123");
  assert.equal(formatP(0.00004), "P < 0.0001");
  assert.equal(formatP(0.00004, ""), "< 0.0001");
  assert.equal(formatP(0.5, "p = "), "p = 0.5");
  assert.deepEqual(splitPair("A vs. B vs. C", ["A vs. B", "C", "A"]), ["A vs. B", "C"]);
});

test("brackets stack narrow first, wide ones climb over", () => {
  const top = () => 10;
  const b = stackBrackets([
    { key: "ac", x0: 0, x1: 2, label: "" },
    { key: "ab", x0: 0, x1: 1, label: "" },
    { key: "bc", x0: 1, x1: 2, label: "" },
    { key: "de", x0: 3, x1: 4, label: "" },
  ], top, 1);
  const by = Object.fromEntries(b.map((x) => [x.key, x]));
  assert.equal(by.ab.y, 11);
  assert.equal(by.bc.y, 12); // touches A-B at B
  assert.equal(by.ac.y, 13);
  assert.equal(by.de.y, 11); // independent
  assert.equal(by.ac.level, 2);
  // tops are respected
  const high = stackBrackets([{ key: "x", x0: 0, x1: 1, label: "" }], (_lo, hi) => (hi > 0.5 ? 50 : 1), 2);
  assert.equal(high[0].y, 52);
});

test("compact letter display (insert and absorb)", () => {
  // A differs from C only: A=a, B=ab, C=b
  assert.deepEqual(compactLetters(3, [[0, 2]]), ["a", "ab", "b"]);
  assert.deepEqual(compactLetters(3, []), ["a", "a", "a"]);
  assert.deepEqual(compactLetters(3, [[0, 1], [0, 2], [1, 2]], "upper"), ["A", "B", "C"]);
  // 4 groups: 0≠2, 0≠3, 1≠3
  const l = compactLetters(4, [[0, 2], [0, 3], [1, 3]]);
  const share = (i: number, j: number) => [...l[i]].some((c) => l[j].includes(c));
  assert.ok(!share(0, 2) && !share(0, 3) && !share(1, 3));
  assert.ok(share(0, 1) && share(1, 2) && share(2, 3));
  assert.equal(letterName(26), "aa");
  assert.equal(letterName(2, "numbers"), "3");
});

test("letters use the engine answer only while it matches the input", () => {
  const cmps = [{ a: "A", b: "C", p: 0.01 }, { a: "A", b: "B", p: 0.4 }, { a: "B", b: "C", p: 0.3 }];
  assert.deepEqual(lettersFor(["A", "B", "C"], cmps, 0.05), ["a", "ab", "b"]);
  const stale = { input: "old", letters: ["x", "y", "z"] };
  assert.deepEqual(lettersFor(["A", "B", "C"], cmps, 0.05, "lower", stale), ["a", "ab", "b"]);
  assert.deepEqual(parseEngineLetters({ letters: { A: "a", B: "ab", C: "b" } }, ["A", "B", "C"]),
    ["a", "ab", "b"]);
  assert.equal(parseEngineLetters({ error: "unknown analysis: compact_letters" }, ["A"]), null);
});

test("comparisons from engine results draw brackets with stars", () => {
  const anova = { analysis: "anova", kind: "parametric", table: { p: 0.0001 },
    multiple_comparisons: { method: "tukey", comparisons: [
      { pair: "A vs. B", p_adjusted: 0.004 }, { pair: "A vs. C", p_adjusted: 0.00001 },
      { pair: "B vs. C", p_adjusted: 0.3 }] } };
  const set = extractComparisons(anova, ["A", "B", "C"])!;
  assert.equal(set.label, "Tukey multiple comparisons");
  assert.equal(set.comparisons.length, 3);
  const f: GraphFormat = { comparisons: { show: true, hidden: [pairKey(set.comparisons[2])] } };
  const out = applyFormat(columnTraces(), columnLayout(), f,
    { ...ctx, categorical: true, comparisons: set.comparisons });
  const labels = out.layout.annotations.map((a: Trace) => a.text);
  assert.deepEqual(labels.sort(), ["**", "****"]);
  assert.equal(out.layout.shapes.length, 6);
  // letters as an alternative
  const l = applyFormat(columnTraces(), columnLayout(), { letters: { show: true } },
    { ...ctx, categorical: true, comparisons: set.comparisons });
  assert.deepEqual(l.layout.annotations.map((a: Trace) => a.text), ["a", "b", "b"]);
  const tt = extractComparisons({ analysis: "ttest", test: "mann_whitney", p_two_tailed: 0.03,
    names: ["B", "C"] }, ["A", "B", "C"]);
  assert.deepEqual(tt?.comparisons, [{ a: "B", b: "C", p: 0.03 }]);
  assert.equal(tt?.label, "Mann-Whitney test");
  const blocks = resultBlocks(anova);
  assert.equal(blocks.pvalue, "One-way ANOVA P = 0.0001");
});

test("grouped graphs: brackets per X axis via groupX, colour arrays recoloured", () => {
  // Two panels (x and x2), two bars each; per-point colour arrays.
  const bar = (axis: string, ds: number, xs: number[], ys: number[]) => tagTrace({
    type: "bar", xaxis: axis, x: xs, y: ys,
    marker: { color: xs.map(() => (ds ? "#eb683455" : "#2a78d655")) },
  }, { ds, role: "bar" });
  const traces = [bar("x", 0, [-0.2, 0.8], [10, 12]), bar("x", 1, [0.2, 1.2], [11, 30]),
    bar("x2", 0, [-0.2, 0.8], [50, 52]), bar("x2", 1, [0.2, 1.2], [51, 53])];
  const pos: Record<string, { x: number; xref: string }> = {
    "r1:A": { x: -0.2, xref: "x" }, "r1:B": { x: 0.2, xref: "x" },
    "r2:A": { x: -0.2, xref: "x2" }, "r2:B": { x: 0.2, xref: "x2" },
  };
  const f: GraphFormat = { comparisons: { show: true }, datasets: { 0: { color: "#112233" } } };
  const out = applyFormat(traces, {}, f, {
    ...ctx, datasets: ["A", "B"],
    comparisons: [{ a: "A", b: "B", p: 0.01, family: "r1" }, { a: "A", b: "B", p: 0.2, family: "r2" },
      { a: "A", b: "B", p: 0.01, family: "nowhere" }],
    groupX: (name, family) => pos[`${family}:${name}`] ?? null, groupHalf: 0.2,
  });
  const lines = out.layout.shapes.filter((x: Trace) => x.name === "bracket");
  assert.deepEqual([...new Set(lines.map((x: Trace) => x.xref))].sort(), ["x", "x2"]);
  const labels = out.layout.annotations.filter((a: Trace) => a.name === "bracket-label");
  assert.deepEqual(labels.map((a: Trace) => `${a.xref}:${a.text}`).sort(), ["x2:ns", "x:**"]);
  // each panel's bracket clears its own bars only (panel 2 bars ~ 50)
  const y = (xref: string) => lines.find((x: Trace) => x.xref === xref && x.y0 === x.y1).y0;
  assert.ok(y("x") < 30 && y("x2") > 51);
  // the per-point colour array of data set 0 took the user colour
  assert.deepEqual(out.traces[0].marker.color, ["#11223355", "#11223355"]);
  assert.deepEqual(out.traces[1].marker.color, ["#eb683455", "#eb683455"]);
});

test("number at risk from the table, and from the result as a fallback", () => {
  const sets = riskSetsFromTable([{ name: "G", rows: [["5", "1"], ["10", "0"], ["15", "1"],
    ["", "1"], ["20", "1"]] }]);
  assert.deepEqual(sets[0].times, [5, 10, 15, 20]);
  assert.equal(atRisk(sets[0], 0), 4);
  assert.equal(atRisk(sets[0], 10), 3);
  assert.equal(censoredBy(sets[0], 12), 1);
  const out = applyFormat([tagTrace({ x: [0, 20], y: [100, 0], mode: "lines",
    line: { color: "#2a78d6" } }, { ds: 0, role: "line" })], { xaxis: {}, margin: { b: 48 } },
  { atRisk: { show: true } }, { ...ctx, datasets: ["G"], riskSets: sets });
  const counts = out.layout.annotations.filter((a: Trace) => a.xref === "x").map((a: Trace) => a.text);
  assert.deepEqual(counts, ["4", "4", "3", "2", "1"]); // at t = 0, 5, 10, 15, 20
  assert.equal(out.layout.xaxis.dtick, 5);
  assert.ok(out.layout.margin.b > 48);
  const approx = riskSetsFromResult({ curves: { G: { points: [
    { time: 0, at_risk: 3 }, { time: 4, at_risk: 2 }, { time: 9, at_risk: 0 }] } } });
  assert.equal(atRisk(approx[0], 5), 2);
});

test("user annotations: text with arrow, data coordinates, results block", () => {
  const f: GraphFormat = { y: { scale: "log10" }, annotations: [
    { id: "a1", kind: "text", text: "peak\nhere", x: 2, y: 100, ref: "data", arrow: true },
    { id: "a2", kind: "rect", x0: 0, y0: 0, x1: 0.5, y1: 0.5, ref: "paper" },
    { id: "a3", kind: "results", what: "pvalue", x: 0.1, y: 0.9, ref: "paper" },
  ] };
  const out = applyFormat(xyTraces(), { yaxis: {} }, f,
    { ...ctx, results: { pvalue: "P = 0.01" }, editRevision: 3 });
  const a1 = out.layout.annotations.find((a: Trace) => a.name === "user:a1");
  assert.equal(a1.y, 2); // log10 axis units
  assert.equal(a1.text, "peak<br>here");
  assert.equal(a1.showarrow, true);
  assert.equal(out.layout.shapes[0].editable, true);
  assert.equal(out.layout.shapes[0].xref, "paper");
  assert.equal(out.layout.annotations.find((a: Trace) => a.name === "user:a3").text, "P = 0.01");
  assert.equal(out.layout.editrevision, "3");
});
