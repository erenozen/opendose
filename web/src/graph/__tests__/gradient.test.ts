// Colour gradient across data sets (gradient.ts). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradientColors } from "../gradient.ts";

test("evenly spaced in sRGB, both ends included", () => {
  assert.deepEqual(gradientColors("#000000", "#ffffff", 3), ["#000000", "#808080", "#ffffff"]);
  assert.deepEqual(gradientColors("#ff0000", "#0000ff", 2), ["#ff0000", "#0000ff"]);
  assert.deepEqual(gradientColors("#123456", "#ffffff", 1), ["#123456"]);
  assert.deepEqual(gradientColors("red", "#ffffff", 3), []);
});
