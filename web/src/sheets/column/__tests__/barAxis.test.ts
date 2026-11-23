// Bars on a log axis or an axis cut above zero (barAxis.ts): the Checks
// row note and its fixes. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  barAxisChip, barAxisProblem, pointsKind, withLinearY, withZeroBreak,
} from "../barAxis.ts";

const g = (graphType: string, format?: unknown) =>
  ({ id: "g1", name: "Graph of Folds", graphType, settings: { titles: { x: "", y: "" },
    scheme: "default" as const, ...(format ? { format } : {}) } }) as never;

test("bars on a log axis, or an axis that starts above 0 (or ends below 0)", () => {
  assert.deepEqual(barAxisProblem(g("bar", { y: { scale: "log10" } })), { kind: "log" });
  assert.deepEqual(barAxisProblem(g("bar", { y: { scale: "log2" } })), { kind: "log" });
  assert.deepEqual(barAxisProblem(g("bar", { y: { min: 1 } })), { kind: "cut", at: 1 });
  assert.deepEqual(barAxisProblem(g("grouped_interleaved", { y: { max: -2 } })), { kind: "cut", at: -2 });
});

test("no note: zero on the axis, a break, or not bars", () => {
  assert.equal(barAxisProblem(g("bar")), null);
  assert.equal(barAxisProblem(g("bar", { y: { min: 0 } })), null);
  assert.equal(barAxisProblem(g("bar", { y: { min: -1 } })), null);
  assert.equal(barAxisProblem(g("bar", { y: { min: 0, gap: { from: 0.2, to: 1 } } })), null);
  assert.equal(barAxisProblem(g("scatter", { y: { scale: "log10" } })), null);
  assert.equal(barAxisProblem(g("grouped_box", { y: { min: 5 } })), null);
});

test("the chip names the graph, cites its source and offers the fixes", () => {
  const c = barAxisChip(g("bar", { y: { min: 1 } }))!;
  assert.equal(c.label, "Bars without zero");
  assert.equal(c.state, "warn");
  assert.equal(c.action, "bar-axis");
  assert.equal(c.target, "g1");
  assert.ok(c.detail.startsWith("The value axis of “Graph of Folds” starts at 1, not at 0."));
  assert.ok(c.sources?.some((s) => s.url === "https://socviz.co/01-look-at-data.html"));
  assert.equal(barAxisChip(g("bar", { y: { scale: "log10" } }))!.label, "Bars on a log axis");
  assert.equal(barAxisChip(g("bar")), null);
});

test("fixes: points instead, a linear axis, 0 with a break", () => {
  assert.equal(pointsKind("bar"), "scatter");
  assert.equal(pointsKind("grouped_stacked"), "grouped_scatter");
  assert.equal(pointsKind("box"), null);
  assert.deepEqual(withLinearY({ y: { scale: "log10", min: 0.1 } }), { y: { scale: "linear", min: 0.1 } });
  const broken = withZeroBreak({ y: { min: 1 } }, 1)!;
  assert.deepEqual(broken.y, { min: 0, gap: { from: 0.2, to: 1 } });
  assert.equal(barAxisProblem(g("bar", broken)), null);
  assert.equal(withZeroBreak({}, -2), null);
});
