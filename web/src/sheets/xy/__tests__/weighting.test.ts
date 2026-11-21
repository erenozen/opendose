// Weighting by 1/Y^K: what the engine receives and how the results name
// it. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WEIGHT_K, engineWeighting, weightingLabel, weightK, WEIGHTING_LABELS } from "../../../types.ts";

test("1/Y^K is sent as 1/Y^<K>; the other weightings unchanged", () => {
  assert.equal(engineWeighting({ weighting: "1/YK", weightK: 1.5 }), "1/Y^1.5");
  assert.equal(engineWeighting({ weighting: "1/YK" }), `1/Y^${DEFAULT_WEIGHT_K}`);
  assert.equal(engineWeighting({ weighting: "1/YK", weightK: 0.75 }), "1/Y^0.75");
  for (const w of ["none", "1/Y", "1/Y2", "1/X", "1/X2", "1/SD2"] as const) {
    assert.equal(engineWeighting({ weighting: w, weightK: 3 }), w);
  }
});

test("K stays within the engine's range (above 0, at most 10)", () => {
  assert.equal(weightK({ weightK: 10 }), 10);
  for (const bad of [0, -1, 11, Number.NaN, undefined]) assert.equal(weightK({ weightK: bad }), DEFAULT_WEIGHT_K);
});

test("results name the weighting the engine reports", () => {
  assert.equal(weightingLabel("1/Y^1.5"), "Weight by 1/Y^1.5");
  assert.equal(weightingLabel("1/Y2"), WEIGHTING_LABELS["1/Y2"]);
  assert.equal(weightingLabel(undefined), "");
  assert.match(WEIGHTING_LABELS["1/YK"], /1\/Yᴷ/);
});
