// Unit tests for the figure conventions: point spreading (beeswarm and
// symmetric), colour-vision simulation and colour differences, P-value
// styles, the classic theme and the legend sentence. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFormat, tagTrace, type Trace } from "../apply.ts";
import {
  blend, cvdReport, deltaE2000, deltaE76, MACHADO, parseHex, simulate, simulateHex, toLab,
} from "../cvd.ts";
import { composeLegend, legendSentence, nPhrase } from "../legend.ts";
import { normalizeFormat } from "../format.ts";
import {
  formatPStyle, isNs, starScale, starsFor,
} from "../significance.ts";
import { beeswarm, laneJitter, spreadOffsets, symmetricSpread } from "../swarm.ts";
import { snapToTicks } from "../theme.ts";
import { normalizeTable } from "../../project/table.ts";
import {
  groupedCellReplicates, groupedReplicateMeanTable, replicateInfo, replicateMeanTable,
  replicateSummary,
} from "../../sheets/common/superplot.ts";
import { zscoreMatrix } from "../../sheets/grouped/stats.ts";
import { survivalAt, normalizeSurvivalGraph } from "../../sheets/survival/graphSettings.ts";
import { topPoints, volcanoDefaults, volcanoPoints } from "../../sheets/multivariable/volcanoModel.ts";
import { columnOptionsFor, DEFAULT_REP_MEANS } from "../../sheets/column/superplotStats.ts";

// ------------------------------------------------------------ swarm

const scale = { pxPerY: 10, pxPerX: 100, marker: 8, maxHalf: 10 };

test("beeswarm: no two markers overlap", () => {
  const values = [5, 5, 5, 5, 5.2, 5.4, 6, 6.1, 6.1, 7, 3, 5.1, 5.05, 4.9];
  const xs = beeswarm(values, scale);
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      const dx = (xs[i] - xs[j]) * scale.pxPerX, dy = (values[i] - values[j]) * scale.pxPerY;
      assert.ok(Math.hypot(dx, dy) >= scale.marker - 1e-6, `points ${i} and ${j} overlap`);
    }
  }
});

test("beeswarm: an isolated point stays on the centre line; ties fan out both ways", () => {
  const xs = beeswarm([1, 10, 10, 10], scale);
  assert.equal(xs[0], 0);
  const tie = xs.slice(1).sort((a, b) => a - b);
  assert.ok(tie[0] < 0 && tie[2] > 0, "equal values go left and right");
  assert.ok(Math.abs(tie[1]) < 1e-12, "the first of them sits in the middle");
});

test("beeswarm: compresses to the maximum half-width", () => {
  const xs = beeswarm(Array(40).fill(1), { ...scale, maxHalf: 0.3 });
  assert.ok(Math.max(...xs.map(Math.abs)) <= 0.3 + 1e-12);
});

test("symmetric spread: equal values centred, one marker apart, exact order kept", () => {
  const xs = symmetricSpread([2, 2, 2, 9], scale);
  const row = xs.slice(0, 3).sort((a, b) => a - b);
  assert.deepEqual(row.map((v) => +(v * scale.pxPerX).toFixed(6)), [-8, 0, 8]);
  assert.equal(xs[3], 0);
  const even = symmetricSpread([4, 4], scale).map((v) => v * scale.pxPerX);
  assert.deepEqual(even.sort((a, b) => a - b), [-4, 4]);
});

test("spreadOffsets: jitter is the original fixed lanes", () => {
  assert.deepEqual(spreadOffsets([1, 2, 3], "jitter", null), laneJitter(3));
  assert.deepEqual(laneJitter(6).map((v) => +v.toFixed(3)), [-0.09, -0.045, 0, 0.045, 0.09, -0.09]);
  assert.deepEqual(spreadOffsets([1], "swarm", scale), [0]);
});

// ------------------------------------------------------------ CVD

test("CIEDE2000 matches Sharma, Wu & Dalal (2005) test pairs", () => {
  assert.equal(+deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]).toFixed(4), 2.0425);
  assert.equal(+deltaE2000([50, 2.5, 0], [73, 25, -18]).toFixed(4), 27.1492);
  assert.equal(+deltaE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387]).toFixed(4),
    1.2644);
  assert.equal(+deltaE2000([50, 0, 0], [50, -1, 2]).toFixed(4), 2.3669);
  assert.equal(deltaE2000([40, 10, 10], [40, 10, 10]), 0);
});

test("CIE76 is the Lab distance; Lab of white and black", () => {
  assert.equal(deltaE76([0, 0, 0], [3, 4, 0]), 5);
  const w = toLab([255, 255, 255]);
  assert.ok(Math.abs(w[0] - 100) < 0.01 && Math.abs(w[1]) < 0.01 && Math.abs(w[2]) < 0.01);
  assert.ok(Math.abs(toLab([0, 0, 0])[0]) < 1e-9);
});

test("Machado matrices: rows sum to 1, so greys stay grey", () => {
  for (const m of Object.values(MACHADO)) {
    for (const row of m) assert.ok(Math.abs(row[0] + row[1] + row[2] - 1) < 1e-3);
  }
  for (const mode of ["protanopia", "deuteranopia", "tritanopia"] as const) {
    const [r, g, b] = simulate([128, 128, 128], mode);
    assert.ok(Math.abs(r - 128) < 1 && Math.abs(g - 128) < 1 && Math.abs(b - 128) < 1);
  }
});

test("red and green collapse under deuteranopia but not for normal vision", () => {
  const red = parseHex("#d62728")!, green = parseHex("#2ca02c")!;
  const normal = deltaE2000(toLab(red), toLab(green));
  const deut = deltaE2000(toLab(simulate(red, "deuteranopia")), toLab(simulate(green, "deuteranopia")));
  assert.ok(normal > 40);
  assert.ok(deut < normal / 2, `deuteranopia ΔE ${deut} vs normal ${normal}`);
  assert.equal(simulateHex("#ff0000", "achromatopsia").slice(1, 3),
    simulateHex("#ff0000", "achromatopsia").slice(3, 5));
});

test("cvdReport flags indistinguishable pairs and low contrast", () => {
  const rows = cvdReport([{ color: "#0072b2" }, { color: "#0073b3" }, { color: "#f0f0f0" }],
    "#ffffff");
  const normal = rows[0];
  assert.equal(normal.mode, "normal");
  assert.ok(normal.confusable.some((p) => p.a === 0 && p.b === 1 && p.severe));
  assert.deepEqual(normal.lowContrast, [2]);
  assert.equal(rows.length, 6);
  // transparency lightens a colour against white
  assert.deepEqual(blend([0, 0, 0], [255, 255, 255], 0.5), [127.5, 127.5, 127.5]);
});

// ------------------------------------------------------------ P styles

test("P styles: GraphPad, APA and NEJM", () => {
  assert.equal(formatPStyle(0.01234, "graphpad"), "P = 0.0123");
  assert.equal(formatPStyle(0.00001, "graphpad"), "P < 0.0001");
  assert.equal(formatPStyle(0.01234, "apa", "p = "), "p = .012");
  assert.equal(formatPStyle(0.0004, "apa", "p = "), "p < .001");
  assert.equal(formatPStyle(0.0004, "apa", ""), "< .001");
  assert.equal(formatPStyle(0.0496, "apa", ""), ".0496");
  assert.equal(formatPStyle(0.04, "nejm"), "P = 0.04");
  assert.equal(formatPStyle(0.0042, "nejm"), "P = 0.004");
  assert.equal(formatPStyle(0.0001, "nejm"), "P < 0.001");
  assert.equal(starsFor(0.00005, "graphpad"), "****");
  assert.equal(starsFor(0.00005, "apa"), "***");
  assert.equal(starsFor(0.05, "graphpad"), "*");
  assert.equal(starsFor(0.05, "nejm"), "ns");
  assert.ok(isNs(0.2) && !isNs(0.01));
  assert.match(starScale("graphpad"), /\*\*\*\* P ≤ 0\.0001/);
  assert.match(starScale("apa"), /\*\*\*p < \.001/);
});

test("format: theme, P style and hide ns survive normalizing; defaults stay absent", () => {
  const f = normalizeFormat({ theme: "classic", pStyle: "apa",
    comparisons: { show: true, hideNs: true } });
  assert.equal(f.theme, "classic");
  assert.equal(f.pStyle, "apa");
  assert.equal(f.comparisons?.hideNs, true);
  assert.deepEqual(normalizeFormat({ theme: "default", pStyle: "graphpad" }), {});
});

// ------------------------------------------------------------ classic theme

test("snapToTicks: the axis starts and ends on a tick", () => {
  assert.deepEqual(snapToTicks(21.8, 37.4), { range: [20, 40], dtick: 5 });
  assert.deepEqual(snapToTicks(0, 0.93), { range: [0, 1], dtick: 0.2 });
});

test("classic theme: white, black, bold, no grid, offset axes, minor ticks", () => {
  const traces: Trace[] = [tagTrace({ x: [0, 0, 0], y: [21.8, 30, 37.4], mode: "markers" },
    { ds: 0, role: "points" })];
  const layout = { plot_bgcolor: "#fafafa", paper_bgcolor: "#fafafa",
    font: { family: "Inter", color: "#424245", size: 13 },
    xaxis: { tickvals: [0], ticktext: ["A"], range: [-0.6, 0.6], showgrid: false },
    yaxis: { title: { text: "Value" }, gridcolor: "#e5e5ea" },
    legend: { title: { text: "Groups" } } };
  const out = applyFormat(traces, layout, { theme: "classic" },
    { dark: false, scheme: "default", datasets: ["A"], categorical: true }).layout;
  assert.equal(out.plot_bgcolor, "#ffffff");
  assert.equal(out.paper_bgcolor, "#ffffff");
  assert.equal(out.font.weight, "bold");
  assert.equal(out.font.color, "#000000");
  assert.match(out.font.family, /Arial/);
  assert.equal(out.yaxis.showgrid, false);
  assert.equal(out.yaxis.linecolor, "#000000");
  assert.equal(out.yaxis.mirror, false);
  assert.deepEqual(out.yaxis.range, [20, 40]);
  assert.equal(out.yaxis.anchor, "free");
  assert.equal(out.yaxis.minor.ticks, "outside");
  assert.equal(out.xaxis.minor, undefined, "no minor ticks between categories");
  assert.equal(out.legend.title.text, "");
  assert.equal(out.yaxis.title.font.weight, "bold");
});

test("a caption is drawn under the plot even with an empty format", () => {
  const out = applyFormat([], { margin: { b: 48 } }, {},
    { dark: false, scheme: "default", datasets: [], caption: "Mean ± SD. n = 6 per group." });
  const cap = out.layout.annotations.find((a: { name?: string }) => a.name === "caption");
  assert.ok(cap);
  assert.equal(cap.yshift, -48);
  assert.ok(out.layout.margin.b > 48);
});

// ------------------------------------------------------------ legend sentence

test("nPhrase: equal and unequal n", () => {
  assert.equal(nPhrase([{ name: "A", n: 6 }, { name: "B", n: 6 }]), "n = 6 per group");
  assert.equal(nPhrase([{ name: "A", n: 6 }, { name: "B", n: 5 }]), "n = 6 (A), 5 (B)");
  assert.equal(nPhrase([{ name: "A", n: 3 }], "experiments"), "n = 3 experiments per group");
});

test("composeLegend: bars with points and the star scale", () => {
  assert.equal(composeLegend({ display: "bar", summary: "mean_sem", points: true,
    groups: [{ name: "A", n: 4 }, { name: "B", n: 4 }], stars: "graphpad" }),
  "Mean ± SEM (bars), with individual values. n = 4 per group. "
    + "ns, P > 0.05; * P ≤ 0.05; ** P ≤ 0.01; *** P ≤ 0.001; **** P ≤ 0.0001.");
  assert.equal(composeLegend({ display: "scatter", summary: "median_iqr", points: true,
    groups: [{ name: "A", n: 9 }] }), "Median with IQR, with individual values. n = 9 per group.");
});

const columnTable = () => normalizeTable({
  type: "column",
  datasets: [
    { name: "Control", rows: [["1", "2", "3"], ["1.2", "2.2", "3.1"]] },
    { name: "Drug", rows: [["2", "4", "5"], ["2.5", "", "5.5"]] },
  ],
});

test("legendSentence: column scatter defaults to mean ± SD with n per group", () => {
  const g = { graphType: "scatter", settings: { titles: { x: "", y: "" }, scheme: "default" as const } };
  assert.equal(legendSentence(g, columnTable()),
    "Mean ± SD, with individual values. n = 6 (Control), 5 (Drug).");
  const bar = { ...g, graphType: "bar", settings: { ...g.settings,
    column: { summary: "mean_ci", points: false } } };
  assert.equal(legendSentence(bar, columnTable()), "Mean with 95% CI (bars). n = 6 (Control), 5 (Drug).");
});

test("legendSentence: SuperPlot counts experiments", () => {
  const g = { graphType: "scatter", settings: { titles: { x: "", y: "" }, scheme: "default" as const,
    column: { superplot: { on: true } } } };
  const s = legendSentence(g, columnTable());
  assert.match(s, /^Mean ± SD of the experiment means/);
  assert.match(s, /n = 3 experiments per group \(11 values in all\)/);
  // results on replicate means switch it on by themselves
  const auto = { ...g, settings: { ...g.settings, column: {} } };
  assert.match(legendSentence(auto, columnTable(), { superplot: { n: 3, replicates: ["a", "b", "c"] } }),
    /experiments per group/);
});

// ------------------------------------------------------------ SuperPlot model

test("replicates: subcolumns by default, mapped subcolumns pool", () => {
  const t = columnTable();
  const info = replicateInfo(t);
  assert.deepEqual(info.names, ["Experiment 1", "Experiment 2", "Experiment 3"]);
  const pooled = replicateInfo({ ...t, replicates: { by: "subcolumns", of: [0, 0, 1] } });
  assert.equal(pooled.names.length, 2);
  assert.equal(pooled.of(0, 0, 1), 0);
  const { groups } = replicateSummary(t);
  assert.deepEqual(groups[0].means.map((m) => +m!.toFixed(2)), [1.1, 2.1, 3.05]);
  assert.deepEqual(groups[1].means, [2.25, 4, 5.25]);
  const mt = replicateMeanTable(t);
  assert.equal(mt.datasets.length, 2);
  assert.deepEqual(mt.rowTitles, info.names);
  assert.deepEqual(mt.datasets[1].rows, [["2.25"], ["4"], ["5.25"]]);
});

test("replicates from an id column (long format)", () => {
  const t = normalizeTable({
    type: "column",
    datasets: [
      { name: "A", rows: [["1"], ["2"], ["3"], ["4"]] },
      { name: "B", rows: [["5"], ["6"], ["7"], ["9"]] },
      { name: "Exp", rows: [["1"], ["1"], ["2"], ["2"]] },
    ],
    replicates: { by: "column", column: 2 },
  });
  assert.deepEqual(t.replicates, { by: "column", column: 2 });
  const info = replicateInfo(t);
  assert.deepEqual(info.names, ["1", "2"]);
  assert.deepEqual(info.groups, [0, 1]);
  const mt = replicateMeanTable(t);
  assert.deepEqual(mt.datasets.map((d) => d.rows.map((r) => r[0])), [["1.5", "3.5"], ["5.5", "8"]]);
});

test("grouped replicate means: subcolumns pooled per experiment, cell by cell", () => {
  const t = normalizeTable({
    type: "grouped", rowTitles: ["R1"],
    datasets: [{ name: "A", rows: [["1", "3", "10", "12"]] }, { name: "B", rows: [["2", "", "5", "7"]] }],
    replicates: { by: "subcolumns", of: [0, 0, 1, 1] },
  });
  const m = groupedReplicateMeanTable(t);
  assert.deepEqual(m.datasets.map((d) => d.rows[0]), [["2", "11"], ["2", "6"]]);
  const { info, cells } = groupedCellReplicates(t);
  assert.equal(info.names.length, 2);
  assert.deepEqual(cells[0][1].counts, [1, 2]);
  const g = { graphType: "grouped_interleaved", settings: { titles: { x: "", y: "" },
    scheme: "default" as const, grouped: { superplot: { on: true } } } };
  assert.match(legendSentence(g, t), /^Mean ± SD of the experiment means \(bars and error bars\)/);
  assert.match(legendSentence(g, t), /n = 2 experiments per group/);
});

test("replicate-mean tests map onto the column analyses", () => {
  assert.equal(columnOptionsFor({ ...DEFAULT_REP_MEANS, test: "paired" }).ttestKind, "paired");
  assert.equal(columnOptionsFor({ ...DEFAULT_REP_MEANS, test: "rm_anova" }).analysis, "rm_anova");
  const k = columnOptionsFor({ ...DEFAULT_REP_MEANS, test: "kruskal" });
  assert.equal(k.analysis, "anova");
  assert.equal(k.anovaKind, "nonparametric");
});

test("heat map z-scores by row and by column", () => {
  const z = zscoreMatrix([[1, 2, 3], [10, 10, null]], "rows");
  assert.deepEqual(z[0], [-1, 0, 1]);
  assert.deepEqual(z[1], [0, 0, null]);
  const c = zscoreMatrix([[1, 5], [3, 5]], "columns");
  assert.ok(Math.abs(c[0][0]! + 0.7071) < 1e-4 && c[0][1] === 0);
});

test("volcano: columns guessed by name, rows classified, top N by P", () => {
  const info = [
    { name: "gene", kind: "categorical" as const, n: 4, levels: [], binary: false },
    { name: "log2FoldChange", kind: "continuous" as const, n: 4, levels: [], binary: false },
    { name: "pvalue", kind: "continuous" as const, n: 4, levels: [], binary: false },
    { name: "padj", kind: "continuous" as const, n: 4, levels: [], binary: false },
  ];
  const s = volcanoDefaults(info);
  assert.equal(s.fc, "log2FoldChange");
  assert.equal(s.p, "padj");
  assert.equal(s.label, "gene");
  assert.equal(s.fcLog2, true);
  const { points } = volcanoPoints([2, -3, 0.5, 4], [0.001, 0.01, 0.0001, 0.2],
    ["a", "b", "c", "d"], s);
  assert.deepEqual(points.map((p) => p.cls), ["up", "down", "ns", "ns"]);
  assert.deepEqual(topPoints(points, 1).map((p) => p.label), ["a"]);
  const raw = volcanoPoints([4, 0.25, -1], [0.01, 0.01, 0.01], ["x", "y", "z"],
    { ...s, fcLog2: false });
  assert.deepEqual(raw.points.map((p) => p.x), [2, -2]);
  assert.equal(raw.dropped, 1);
});

test("survival: step value at a time and the graph settings", () => {
  const pts = [{ time: 0, survival: 1 }, { time: 5, survival: 0.8 }, { time: 9, survival: 0.5 }];
  assert.equal(survivalAt(pts, 7), 0.8);
  assert.equal(survivalAt(pts, 9), 0.5);
  assert.deepEqual(normalizeSurvivalGraph(undefined), { censorMarks: false, nudge: 0 });
  assert.deepEqual(normalizeSurvivalGraph({ censorMarks: true, nudge: 9 }), { censorMarks: true, nudge: 5 });
});
