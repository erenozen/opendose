// Unit tests for image-export settings. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPreset, belowFontFloor, DEFAULT_EXPORT, fileStem, fromUnit, JOURNAL_PRESETS,
  mmToPx, rasterSize, sanitizeExport, smallestFontPt, toUnit, tooLarge, uniqueStems,
} from "../settings.ts";

test("units convert through CSS pixels (96 per inch)", () => {
  assert.equal(toUnit(96, "in"), 1);
  assert.equal(toUnit(mmToPx(85), "mm"), 85);
  assert.equal(Math.round(fromUnit(25.4, "mm")), 96);
  assert.equal(fromUnit(800, "px"), 800);
});

test("journal presets fix the width in mm and keep the aspect ratio", () => {
  const single = JOURNAL_PRESETS.find((p) => p.id === "single")!;
  const s = applyPreset({ ...DEFAULT_EXPORT, width: 800, height: 600 }, single, 600);
  assert.equal(toUnit(s.width, "mm"), 85);
  assert.ok(Math.abs(s.height / s.width - 0.75) < 0.01);
  assert.equal(s.dpi, 600);
  assert.equal(s.unit, "mm");
  // 85 mm at 600 dpi is ~2008 px wide.
  const px = rasterSize(s.width, s.height, s.dpi);
  assert.ok(Math.abs(px.w - 2008) <= 2, String(px.w));
  const double = JOURNAL_PRESETS.find((p) => p.id === "double")!;
  assert.ok(double.widthMm >= 170 && double.widthMm <= 180);
});

test("font floor: 13 px prints at 9.75 pt, a scaled-down 13 px falls under 6 pt", () => {
  assert.equal(smallestFontPt([13, 15]), 9.8);
  const shrunk = smallestFontPt([13], 0.5);
  assert.equal(shrunk, 4.9);
  assert.ok(belowFontFloor(shrunk));
  assert.ok(!belowFontFloor(smallestFontPt([12])));
  assert.equal(smallestFontPt([]), null);
});

test("raster limits match the old TIFF guard", () => {
  assert.deepEqual(rasterSize(400, 300, 150), { w: 625, h: 468 });
  // The e2e oversize check: 400 × 300 at 2400 dpi is 10000 × 7500 px.
  const big = rasterSize(400, 300, 2400);
  assert.ok(tooLarge(big.w, big.h));
  assert.ok(tooLarge(20000, 100));
  assert.ok(tooLarge(9000, 9000));
  assert.ok(!tooLarge(4000, 3000));
});

test("file names come from sheet names and stay unique in an archive", () => {
  assert.equal(fileStem("Graph of Dose response"), "graph-of-dose-response");
  assert.equal(fileStem("IC₅₀ / µM (n=3)"), "ic50-μm-n-3");
  assert.equal(fileStem("///"), "opendose-graph");
  assert.deepEqual(uniqueStems(["a", "a", "b", "a"]), ["a", "a-2", "b", "a-3"]);
});

test("export settings from files are sanitized", () => {
  assert.deepEqual(sanitizeExport(null), DEFAULT_EXPORT);
  const s = sanitizeExport({ format: "eps", width: 5, dpi: 1e6, unit: "cm", transparent: 1,
    paper: false });
  assert.equal(s.format, "png");
  assert.equal(s.width, 100);
  assert.equal(s.dpi, 2400);
  assert.equal(s.unit, "px");
  assert.equal(s.transparent, false);
  assert.equal(s.paper, false);
});
