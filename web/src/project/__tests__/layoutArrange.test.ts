// Arranging layout items (layoutArrange.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { alignItems, distributeItems, reorderItems } from "../layoutArrange.ts";
import type { LayoutItem } from "../types.ts";

const box = (id: string, x: number, y: number, w = 10, h = 10): LayoutItem =>
  ({ id, kind: "text", text: id, fontSize: 10, bold: false, align: "left", x, y, w, h });
const ids = (xs: LayoutItem[]) => xs.map((i) => i.id).join("");

test("stacking order: front, back, one step", () => {
  const xs = [box("a", 0, 0), box("b", 0, 0), box("c", 0, 0), box("d", 0, 0)];
  assert.equal(ids(reorderItems(xs, ["a"], "front")), "bcda");
  assert.equal(ids(reorderItems(xs, ["d"], "back")), "dabc");
  assert.equal(ids(reorderItems(xs, ["b"], "forward")), "acbd");
  assert.equal(ids(reorderItems(xs, ["c"], "backward")), "acbd");
  assert.equal(ids(reorderItems(xs, ["a", "c"], "front")), "bdac");
  assert.equal(ids(reorderItems(xs, ["d"], "forward")), "abcd");
});

test("align to the selection, or to the page with one item", () => {
  const xs = [box("a", 10, 5, 20), box("b", 40, 30, 10), box("c", 0, 0)];
  const L = alignItems(xs, ["a", "b"], "left", { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(L.map((i) => i.x), [10, 10, 0]);
  const R = alignItems(xs, ["a", "b"], "right", { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(R.map((i) => i.x), [30, 40, 0]);
  const C = alignItems(xs, ["a", "b"], "hcenter", { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(C.map((i) => i.x), [20, 25, 0]);
  const B = alignItems(xs, ["a", "b"], "bottom", { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(B.map((i) => i.y), [30, 30, 0]);
  const P = alignItems(xs, ["c"], "hcenter", { x: 15, y: 15, w: 180, h: 267 });
  assert.equal(P[2].x, 100);
});

test("distribute: equal gaps, outer items fixed", () => {
  const xs = [box("a", 0, 0, 10), box("b", 15, 0, 20), box("c", 90, 0, 10)];
  const D = distributeItems(xs, ["a", "b", "c"], "h");
  // span 0..100, sizes 40, two gaps of 30: a 0, b 40, c 90
  assert.deepEqual(D.map((i) => i.x), [0, 40, 90]);
  assert.equal(distributeItems(xs, ["a", "b"], "h"), xs);
});
