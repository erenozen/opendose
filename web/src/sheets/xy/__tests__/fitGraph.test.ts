// IC50 / EC50 drop lines on the curve-fit graph (fitGraph.ts), on engine
// fits made by engine/tests/reference/fit_graph.py. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDropLines, DEFAULT_XY_GRAPH, dropLabelText, dropLegend, dropPoints, normalizeXYGraph,
} from "../fitGraph.ts";
import type { Layout } from "../../../graph/apply.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "fitGraph.fixtures.json"), "utf8"));
const OPTS = { dark: false, scheme: "default" as const, label: false, unit: "M", ink: "#111111" };

test("settings: absent fields draw the graph as before", () => {
  assert.deepEqual(normalizeXYGraph(undefined), DEFAULT_XY_GRAPH);
  assert.deepEqual(normalizeXYGraph({ dropLines: "yes", caption: "nowhere" }), DEFAULT_XY_GRAPH);
  assert.deepEqual(normalizeXYGraph({ dropLines: true, dropLabel: true, caption: "figure" }),
    { dropLines: true, dropLabel: true, caption: "figure" });
});

test("relative IC50: the point is (LogIC50, half-way between Top and Bottom)", () => {
  const [p] = dropPoints(ref.cases.relative_4pl);
  assert.equal(p.drawn, true);
  if (!p.drawn) return;
  assert.equal(p.label, "IC50");
  assert.equal(p.kind, "relative");
  assert.equal(p.x, ref.checks.relative_4pl.x);
  // the model's own equation at that x (reference script), to 1e-12
  assert.ok(Math.abs(p.y - ref.checks.relative_4pl.y_curve) < 1e-9);
  assert.equal(Number(p.x.toFixed(5)), -6.98304);
  assert.equal(Number(p.y.toFixed(4)), 50.4181);
  assert.equal(dropLabelText(p, "M"), "IC50 = 1.040e-7 M");
});

test("absolute IC50: the point is (LogAbsoluteIC50, (Top + Baseline) / 2)", () => {
  const [p] = dropPoints(ref.cases.absolute_log);
  assert.equal(p.drawn, true);
  if (!p.drawn) return;
  assert.equal(p.label, "absolute IC50");
  assert.equal(p.kind, "absolute");
  assert.equal(p.x, ref.checks.absolute_log.x);
  assert.ok(Math.abs(p.y - ref.checks.absolute_log.y_curve) < 1e-9);
  assert.equal(Number(p.y.toFixed(4)), 49.9281);
});

test("an IC50 beyond the doses tested is not drawn, with the reason", () => {
  const [p] = dropPoints(ref.cases.extrapolated);
  assert.equal(p.drawn, false);
  if (p.drawn) return;
  assert.equal(p.reason, "the IC50 lies above the highest concentration tested");
});

test("an ambiguous fit is not drawn", () => {
  const r = structuredClone(ref.cases.relative_4pl);
  r.datasets[0].fit.status = "ambiguous";
  const [p] = dropPoints(r);
  assert.equal(p.drawn, false);
  if (!p.drawn) assert.equal(p.reason, "the fit is ambiguous");
});

test("models without a single IC50, failed fits and errors give nothing", () => {
  const r = structuredClone(ref.cases.relative_4pl);
  r.datasets[0].fit.model = "biphasic_log";
  assert.deepEqual(dropPoints(r), []);
  assert.deepEqual(dropPoints({ error: "x" }), []);
  assert.deepEqual(dropPoints(null), []);
  const failed = structuredClone(ref.cases.relative_4pl);
  failed.datasets[0].error = "did not converge";
  assert.deepEqual(dropPoints(failed), []);
});

test("shapes: one end on the curve, the other on the plot edge", () => {
  const points = dropPoints(ref.cases.relative_4pl);
  const out = addDropLines({} as Layout, points, {}, OPTS) as Record<string, any>;
  const [v, h] = out.shapes;
  assert.equal(v.name, "drop:0:v");
  assert.deepEqual([v.x0, v.x1, v.y0, v.y1], [points[0].drawn && points[0].x,
    points[0].drawn && points[0].x, points[0].drawn && points[0].y, 0]);
  assert.deepEqual(v.yref, ["y", "y domain"]);
  assert.deepEqual(h.xref, ["x", "x domain"]);
  assert.equal(h.x1, 0);
  assert.equal(v.line.dash, "dash");
  assert.equal(out.annotations.length, 0);
  const labelled = addDropLines({} as Layout, points, {}, { ...OPTS, label: true }) as Record<string, any>;
  assert.equal(labelled.annotations[0].text, "IC50 = 1.040e-7 M");
});

test("shapes follow the axis scale, hidden data sets and the format colour", () => {
  const points = [{ ds: 0, name: "A", label: "EC50", kind: "relative" as const, drawn: true as const,
    x: 1e-6, y: 50, value: 1e-6 }];
  const log = addDropLines({} as Layout, points, { x: { scale: "log10" } }, OPTS) as Record<string, any>;
  assert.equal(log.shapes[0].x0, -6);
  const coloured = addDropLines({} as Layout, points,
    { datasets: { 0: { color: "#123456" } } }, OPTS) as Record<string, any>;
  assert.equal(coloured.shapes[0].line.color, "#123456");
  const hidden = addDropLines({} as Layout, points, { datasets: { 0: { show: false } } }, OPTS);
  assert.equal((hidden.shapes ?? []).length, 0);
  // log of a value at or below 0 cannot be shown
  const neg = addDropLines({} as Layout, [{ ...points[0], x: -7 }], { x: { scale: "log10" } }, OPTS);
  assert.equal((neg.shapes ?? []).length, 0);
  // a discontinuous Y axis: nothing
  const split = { yaxis3: {} } as unknown as Layout;
  assert.equal(addDropLines(split, points, {}, OPTS), split);
});

test("legend: what the drop lines mark, and why a curve has none", () => {
  assert.equal(dropLegend(ref.cases.relative_4pl, { dropLines: false }), "");
  assert.equal(dropLegend(ref.cases.relative_4pl, { dropLines: true }),
    "Dashed lines mark the IC50 (the concentration giving a response half-way between the "
    + "fitted Top and Bottom).");
  assert.equal(dropLegend(ref.cases.absolute_log, { dropLines: true }),
    "Dashed lines mark the absolute IC50 (where the curve crosses (Top + Baseline) / 2).");
  assert.equal(dropLegend(ref.cases.extrapolated, { dropLines: true }),
    "No IC50 lines for Drug A: the IC50 lies above the highest concentration tested.");
});
