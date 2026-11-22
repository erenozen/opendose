import { test } from "node:test";
import assert from "node:assert/strict";
import { inset, intersect, place, type Box } from "../Popover.place.ts";

const viewport: Box = { left: 0, top: 0, right: 1000, bottom: 800 };
const bounds = inset(viewport, 8);
const button = (left: number, top: number, w = 80, h = 30): Box =>
  ({ left, top, right: left + w, bottom: top + h });

test("below the anchor, start-aligned, origin at the anchor's middle on the top edge", () => {
  const p = place({ anchor: button(100, 100), size: { width: 200, height: 150 },
    side: "bottom", align: "start", offset: 6, bounds });
  assert.deepEqual([p.x, p.y, p.side], [100, 136, "bottom"]);
  assert.deepEqual([p.originX, p.originY], [40, 0]);
  assert.equal(p.maxHeight, undefined);
});

test("end alignment lines up the right edges; origin moves to the right", () => {
  const p = place({ anchor: button(700, 100), size: { width: 200, height: 150 },
    side: "bottom", align: "end", offset: 6, bounds });
  assert.equal(p.x, 580);
  assert.equal(p.originX, 160);
});

test("flips to the top when the bottom is short and the top has more room", () => {
  const p = place({ anchor: button(100, 700), size: { width: 200, height: 300 },
    side: "bottom", align: "start", offset: 6, bounds });
  assert.equal(p.side, "top");
  assert.equal(p.y, 700 - 6 - 300);
  assert.equal(p.originY, 300, "scales out of its bottom edge");
});

test("flips to the bottom for a top-side panel under a short top", () => {
  const p = place({ anchor: button(100, 120), size: { width: 200, height: 300 },
    side: "top", align: "start", offset: 8, bounds });
  assert.equal(p.side, "bottom");
  assert.equal(p.y, 158);
  assert.equal(p.originY, 0);
});

test("stays on the preferred side when neither side fits but it has more room; caps the height", () => {
  const p = place({ anchor: button(100, 500), size: { width: 200, height: 900 },
    side: "top", align: "start", offset: 8, bounds });
  assert.equal(p.side, "top");
  assert.equal(p.maxHeight, 500 - 8 - 8);
  assert.equal(p.y, 8, "its first rows stay inside the bounds");
});

test("clamps across the axis at the viewport edge; origin follows the anchor", () => {
  const p = place({ anchor: button(950, 100, 40), size: { width: 300, height: 100 },
    side: "bottom", align: "start", offset: 6, bounds });
  assert.equal(p.x, 1000 - 8 - 300);
  assert.equal(p.originX, 970 - p.x);
  const left = place({ anchor: button(0, 100, 20), size: { width: 300, height: 100 },
    side: "bottom", align: "end", offset: 6, bounds });
  assert.equal(left.x, 8);
  assert.equal(left.originX, 2);
});

test("a clipping boundary narrows the bounds (sticky header, scroll container)", () => {
  const header = inset(viewport, { top: 60 });
  const p = place({ anchor: button(100, 500), size: { width: 200, height: 500 },
    side: "top", align: "start", offset: 8, bounds: header });
  assert.equal(p.side, "top");
  assert.equal(p.y, 60);
  assert.equal(p.maxHeight, 500 - 8 - 60);
  const card: Box = { left: 50, top: 200, right: 600, bottom: 700 };
  const b = intersect(bounds, card);
  assert.deepEqual(b, { left: 50, top: 200, right: 600, bottom: 700 });
  const q = place({ anchor: button(560, 300, 30), size: { width: 200, height: 100 },
    side: "bottom", align: "start", offset: 6, bounds: b });
  assert.equal(q.x, 400);
});

test("a point anchor (right click) opens down-right and flips near the bottom-right corner", () => {
  const at = (x: number, y: number): Box => ({ left: x, top: y, right: x, bottom: y });
  const p = place({ anchor: at(300, 200), size: { width: 220, height: 300 },
    side: "bottom", align: "start", offset: 0, bounds });
  assert.deepEqual([p.x, p.y, p.originX, p.originY], [300, 200, 0, 0]);
  const c = place({ anchor: at(990, 790), size: { width: 220, height: 300 },
    side: "bottom", align: "start", offset: 0, bounds });
  assert.deepEqual([c.x, c.y, c.side], [772, 490, "top"]);
  assert.deepEqual([c.originX, c.originY], [990 - 772, 300]);
});

test("left and right sides mirror the vertical logic", () => {
  const p = place({ anchor: button(900, 300), size: { width: 200, height: 100 },
    side: "right", align: "center", offset: 4, bounds });
  assert.equal(p.side, "left");
  assert.equal(p.x, 900 - 4 - 200);
  assert.equal(p.y, 315 - 50);
  assert.deepEqual([p.originX, p.originY], [200, 50]);
});
