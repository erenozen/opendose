// Colour by group name (nameColors.ts) and the axis scale factor
// (axes.ts / apply.ts scaleTag). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { nameColorIndex, stripNameColors, withNameColors } from "../nameColors.ts";
import { generateTicks } from "../axes.ts";
import { scaleTag } from "../apply.ts";
import { readFormat } from "../format.ts";
import { seriesStyle } from "../../lib/palette.ts";

const project = { sheets: [
  { kind: "data", table: { datasets: [{ name: "Control" }, { name: "Drug A" }] } },
  { kind: "results" },
  { kind: "data", table: { datasets: [{ name: "drug a " }, { name: "Drug B" }, { name: "CONTROL" }] } },
] } as never;

test("names take colours in order of first appearance, case and spaces ignored", () => {
  const m = nameColorIndex(project);
  assert.deepEqual([...m.entries()], [["control", 0], ["drug a", 1], ["drug b", 2]]);
});

test("a graph's data sets are coloured by name; own colours win; saving strips them", () => {
  const m = nameColorIndex(project);
  const f = withNameColors({}, ["Drug A", "Drug B", "Control"], m, false);
  assert.equal(f.datasets?.["0"]?.color, seriesStyle(1, false).color);
  // Drug B: 2nd on this graph, 3rd name in the project
  assert.equal(f.datasets?.["1"]?.color, seriesStyle(2, false).color);
  const own = withNameColors({ datasets: { "2": { color: "#123456" } } }, ["Drug A", "Drug B", "Control"], m, false);
  assert.equal(own.datasets?.["2"]?.color, "#123456");
  const same = withNameColors({}, ["Control", "Drug A"], m, false);
  assert.deepEqual(same, {});                                   // nothing moves: unchanged
  const raw = { datasets: { "1": { fillAlpha: 0.5 } } };
  const drawn = withNameColors(raw, ["Drug A", "Drug B", "Control"], m, false);
  assert.deepEqual(stripNameColors(drawn, raw), raw);
});

test("scale factor: labels divided by 10^k, the title tag", () => {
  const g = generateTicks({ scaleFactor: 3 }, 0, 25000);
  assert.ok(g);
  assert.deepEqual(g!.tickvals.slice(0, 3), [0, 5000, 10000]);
  assert.deepEqual(g!.ticktext.slice(0, 3), ["0", "5", "10"]);
  assert.equal(scaleTag(3), "(×10³)");
  assert.equal(scaleTag(-6), "(×10⁻⁶)");
  assert.equal(generateTicks({ scaleFactor: 3, scale: "log10" }, 0, 5), null);
  assert.equal(readFormat({ format: { y: { scaleFactor: 3.2 } } }).y?.scaleFactor, 3);
  assert.equal(readFormat({ format: { y: { scaleFactor: 0 } } }).y?.scaleFactor, undefined);
  assert.equal(readFormat({ format: { comparisons: { display: "mixed" } } }).comparisons?.display, "mixed");
});
