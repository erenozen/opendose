// Axes crossing at a value, crossing ticks and scale bars (apply.ts).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFormat, tagTrace, titleUnit, type Trace } from "../apply.ts";
import { normalizeFormat } from "../format.ts";

const ctx = { dark: false, scheme: "default" as const, datasets: ["A"] };
const traces = (): Trace[] => [tagTrace({ x: [0, 10, 20], y: [-5, 0, 15], mode: "markers" },
  { ds: 0, role: "points", rows: [0, 1, 2] })];
const layout = () => ({ xaxis: { title: { text: "Time (ms)" } }, yaxis: { title: { text: "Current (pA)" } } });

test("X axis crossing Y at 0: placed at 0 within the fixed Y range", () => {
  const f = normalizeFormat({ x: { crossAt: 0 } });
  const { layout: l } = applyFormat(traces(), layout(), f, ctx);
  // data -5..15, padded by 1: range -6..16; 0 sits at 6/22
  assert.deepEqual(l.yaxis.range, [-6, 16]);
  assert.equal(l.xaxis.anchor, "free");
  assert.ok(Math.abs(l.xaxis.position - 6 / 22) < 1e-12);
});

test("crossing ticks: short lines across the axis at each tick, sized in pixels", () => {
  const f = normalizeFormat({ y: { ticks: "cross", tickLen: 6, majorStep: 5 } });
  const { layout: l } = applyFormat(traces(), layout(), f, ctx);
  assert.equal(l.yaxis.ticks, "");
  // range -6..16, ticks every 5: -5, 0, 5, 10, 15
  const ticks = l.shapes.filter((s: { xsizemode?: string }) => s.xsizemode === "pixel");
  assert.deepEqual(ticks.map((s: { y0: number }) => s.y0), [-5, 0, 5, 10, 15]);
  assert.deepEqual([ticks[0].x0, ticks[0].x1, ticks[0].xanchor], [-6, 6, 0]);
});

test("scale bars: axes hidden, bars at the lower left, units from the titles", () => {
  const f = normalizeFormat({ frame: "scalebars", y: { scaleBar: 5 } });
  const { layout: l } = applyFormat(traces(), layout(), f, ctx);
  assert.equal(l.xaxis.visible, false);
  assert.equal(l.yaxis.visible, false);
  const [h, v] = l.shapes.slice(-2);
  // x range -1..21: auto length niceTick(22) = 5; starts at -1
  assert.deepEqual([h.x0, h.x1, h.y0], [-1, 4, -6]);
  assert.deepEqual([v.x0, v.y0, v.y1], [-1, -6, -1]);
  assert.deepEqual(l.annotations.slice(-2).map((a: { text: string }) => a.text), ["5 ms", "5 pA"]);
  assert.equal(titleUnit("Concentration [µM]"), "µM");
  assert.equal(titleUnit("Response"), "");
});
