// Text and line sizes in points (P-54): the conversion at 96 px to the
// inch, and the axis line width the Format axes dialog sets. Run:
// npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { PX_PER_PT, shownSize, storedSize } from "../sizeUnit.ts";
import { applyFormat } from "../apply.ts";
import { normalizeFormat } from "../format.ts";

test("1 pt = 96/72 px exactly; px sizes saved before read back unchanged", () => {
  assert.equal(PX_PER_PT, 4 / 3);
  // every px value a saved graph can hold shows in px exactly as stored
  for (const px of [1, 1.5, 2, 9.75, 13, 16, 72]) assert.equal(shownSize(px, "px"), px);
  // and in pt at 0.75 of it: 13 px (the default tick text) is 9.75 pt
  assert.equal(shownSize(13, "pt"), 9.75);
  assert.equal(shownSize(16, "pt"), 12);
  assert.equal(shownSize(1, "pt"), 0.75);
  assert.equal(shownSize(undefined, "pt"), undefined);
  assert.equal(shownSize(null, "px"), undefined);
});

test("a size typed in pt is stored in px and reads back as typed (round trip)", () => {
  assert.equal(storedSize(7, "pt"), 28 / 3);
  assert.equal(storedSize(1, "pt"), 4 / 3);
  assert.equal(storedSize(12, "pt"), 16);
  assert.equal(storedSize(7, "px"), 7);
  assert.equal(storedSize(undefined, "pt"), undefined);
  for (const pt of [0.25, 0.5, 1, 5, 6, 7, 7.5, 8, 9.75, 10, 12, 24, 36]) {
    assert.equal(shownSize(storedSize(pt, "pt"), "pt"), pt, `${pt} pt`);
    // 1 pt prints as 1 pt: px × 0.75 (export/pdf.ts) within float rounding
    assert.ok(Math.abs(storedSize(pt, "pt")! * 0.75 - pt) < 1e-12);
  }
});

test("Axis line width: draws the line and its ticks at that width; absent changes nothing", () => {
  const base = () => ({ xaxis: { linecolor: "#888888" }, yaxis: {} });
  const ctx = { dark: false, scheme: "default" as const, datasets: ["A"] };
  const none = applyFormat([], base(), normalizeFormat({}), ctx);
  assert.equal(none.layout.xaxis.showline, undefined);
  const f = normalizeFormat({ y: { lineWidth: 4 / 3 } });
  assert.equal(f.y?.lineWidth, 4 / 3);
  const out = applyFormat([], base(), f, ctx);
  assert.equal(out.layout.yaxis.showline, true);
  assert.equal(out.layout.yaxis.linewidth, 4 / 3);
  assert.equal(out.layout.yaxis.tickwidth, 4 / 3);
  assert.equal(out.layout.xaxis.showline, undefined);
  // the classic theme's 1.5 px axes give way to the user's width
  const classic = applyFormat([], base(), normalizeFormat({ theme: "classic", x: { lineWidth: 2 } }), ctx);
  assert.equal(classic.layout.xaxis.linewidth, 2);
  assert.equal(classic.layout.yaxis.linewidth, 1.5);
  // out of range values are refused by the schema
  assert.equal(normalizeFormat({ x: { lineWidth: 50 } }).x?.lineWidth, 10);
  assert.equal(normalizeFormat({ x: { lineWidth: "2" } }).x, undefined);
});
