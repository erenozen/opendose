// Raincloud plots and violins with a stated bandwidth (P-53): the traces
// violinTraces.ts draws and the legend sentence that states the bandwidth.
// Bandwidths and densities: reference/kde.py (numpy, scipy gaussian_kde).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeTable } from "../../project/table.ts";
import { legendSentence } from "../legend.ts";
import { groupDensity } from "../kde.ts";
import { boxStats, percentileOf } from "../boxStats.ts";
import { RAIN, raincloudTraces, VIOLIN_HALF, violinOutline, violinTraces } from "../violinTraces.ts";
import { normalizeColumnGraph } from "../../sheets/column/graphSettings.ts";

const ref = JSON.parse(readFileSync(new URL("./reference/kde.json", import.meta.url), "utf8"));
const NAMES = ["Control", "Treated A", "Treated B"];
const example = normalizeTable({
  type: "column",
  datasets: NAMES.map((n) => ({ name: n,
    rows: (ref[`example ${n}`].values as number[]).map((v) => [String(v)]) })),
});
const graph = (graphType: string, column: Record<string, unknown> = {}, format?: unknown) =>
  ({ graphType, settings: { titles: { x: "", y: "" }, column, ...(format ? { format } : {}) } }) as never;
const style = { color: "#2a78d6", name: "Control", ink: "#000000", ds: 0, rows: [], keys: [],
  symbol: "circle", edge: "#ffffff" };

test("raincloud legend states each group's bw.nrd0 bandwidth (scipy reference, 3 digits)", () => {
  const s = legendSentence(graph("raincloud"), example);
  assert.equal(s, "Raincloud: kernel density (half violin), median with IQR (box) and "
    + "1.5 × IQR (Tukey) (whiskers), with individual values. Gaussian kernel, bandwidth by "
    + "Silverman's rule of thumb (R bw.nrd0): 1.07 (Control), 0.657 (Treated A), 0.868 (Treated B); "
    + "each scaled to the same width. n = 6 per group.");
  for (const n of NAMES) assert.equal(Number(ref[`example ${n}`].h.toPrecision(3)).toString(),
    { Control: "1.07", "Treated A": "0.657", "Treated B": "0.868" }[n]);
});

test("violins: saved ones keep their legend; new ones name the median, quartiles and bandwidth", () => {
  assert.equal(legendSentence(graph("violin"), example),
    "Kernel density (violin) with the mean (line), with individual values. n = 6 per group.");
  assert.equal(normalizeColumnGraph({}).violin, "mean");
  const s = legendSentence(graph("violin", { violin: "quartiles" }), example);
  assert.match(s, /^Kernel density \(violin\) with the median \(solid line\) and quartiles \(dashed lines\), with individual values\. Gaussian kernel, bandwidth by Silverman's rule of thumb \(R bw\.nrd0\): 1\.07 \(Control\)/);
});

test("groups without a density are named with the reason; one bandwidth for all is said once", () => {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "A", rows: [["1"], ["2"], ["4"]] },
    { name: "B", rows: [["3"]] },
    { name: "C", rows: [["5"], ["5"]] },
    { name: "D", rows: [[""]] },
  ] });
  const s = legendSentence(graph("raincloud"), t);
  assert.match(s, /bandwidth by Silverman's rule of thumb \(R bw\.nrd0\) [\d.]+; no density for B \(fewer than 2 values\), C \(all values equal\)\./);
  assert.doesNotMatch(s, /\(D\)|each scaled/);
});

test("on a log10 Y axis the density is of log10(values), and a value <= 0 has none", () => {
  const g = groupDensity([1, 10, 100, 1000], true);
  assert.equal(g.log, true);
  assert.ok(Math.abs(g.kde!.h - groupDensity([0, 1, 2, 3], false).kde!.h) < 1e-12);
  const o = violinOutline(g, 0, 0.4, 0);
  assert.ok(o.y.every((y) => y > 0));
  assert.equal(groupDensity([0, 1, 2], true).why, "nonpositive");
  const s = legendSentence(graph("raincloud", {}, { y: { scale: "log10" } }), example);
  assert.match(s, /bw\.nrd0\) \(log10 units\): .*, on log10 of the values/);
});

test("raincloud traces: cloud to the right, the column statistics' box, rain to the left", () => {
  const values = ref["example Control"].values as number[];
  const g = groupDensity(values, false);
  const off = values.map((_, j) => (j - 2.5) * 0.02);
  const tr = raincloudTraces(g, values, 2, off, "prism", "tukey", style) as Record<string, any>[];
  assert.deepEqual(tr.map((t) => t.meta.odTag.role), ["violin", "box", "points"]);
  const xs = tr[0].x as number[];
  assert.ok(Math.abs(Math.max(...xs) - (2 + RAIN.cloudBase + RAIN.cloudHalf)) < 1e-12);
  assert.ok(Math.abs(Math.min(...xs) - (2 + RAIN.cloudBase)) < 1e-12);
  const b = boxStats(values, "prism", "tukey")!;
  assert.deepEqual([tr[1].q1[0], tr[1].median[0], tr[1].q3[0]], [b.q1, b.median, b.q3]);
  assert.equal(tr[1].meta.fixedWidth, true);
  assert.ok((tr[2].x as number[]).every((x, j) => Math.abs(x - (2 + RAIN.rainX + off[j])) < 1e-12));
  assert.deepEqual(tr[2].y, values);
  // the outline's width follows the scipy density at the reference points
  const r = ref["example Control"];
  r.idx.forEach((i: number, j: number) => {
    const w = xs[1 + i] - (2 + RAIN.cloudBase);
    assert.ok(Math.abs(w - r.density[j] / r.max * RAIN.cloudHalf) < 1e-10, `width at ${r.y[j]}`);
  });
});

test("violin traces: closed outline, quartile lines at the P-04 quartiles, points; n = 1 draws points only", () => {
  const values = ref["example Treated A"].values as number[];
  const g = groupDensity(values, false);
  const tr = violinTraces(g, values, 1, values.map(() => 0), "linear", style) as Record<string, any>[];
  assert.deepEqual(tr.map((t) => t.meta.odTag.role), ["violin", "decor", "decor", "decor", "points"]);
  const o = tr[0];
  assert.equal(o.x[0], o.x[o.x.length - 1]);
  assert.ok(Math.abs(Math.max(...o.x) - (1 + VIOLIN_HALF)) < 1e-12);
  const sorted = [...values].sort((a, b) => a - b);
  [25, 50, 75].forEach((p, j) => assert.equal(tr[1 + j].y[0], percentileOf(sorted, p, "linear")));
  assert.equal(tr[2].line.dash, "solid");
  const one = violinTraces(groupDensity([4], false), [4], 0, [0], "linear", style) as Record<string, any>[];
  assert.deepEqual(one.map((t) => t.meta.odTag.role), ["points"]);
});
