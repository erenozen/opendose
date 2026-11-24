// Spline and point-to-point standard curves (P-103): options and payload.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STD_OPTIONS, isInterpolating, MODEL_LABELS, normalizeStdOptions, stdPayloads, type StdRow,
} from "../model.ts";

const rows: StdRow[] = [
  { kind: "standard", name: "S1", group: "", conc: 10, dilution: 1, plate: "", signals: [0.2, 0.22], row: 0 },
  { kind: "standard", name: "S2", group: "", conc: 100, dilution: 1, plate: "", signals: [1.1, 1.0], row: 1 },
  { kind: "unknown", name: "U", group: "", conc: null, dilution: 2, plate: "", signals: [0.5], row: 2 },
];

test("the kit models are listed with their no-CI labels and survive a reload", () => {
  assert.equal(MODEL_LABELS.spline, "Cubic spline (no CI)");
  assert.equal(MODEL_LABELS.point_to_point, "Point to point (no CI)");
  assert.equal(normalizeStdOptions({ model: "spline" }).model, "spline");
  assert.equal(normalizeStdOptions({ model: "point_to_point" }).model, "point_to_point");
  assert.equal(normalizeStdOptions({ model: "akima" }).model, "4pl");
  assert.ok(isInterpolating("spline") && !isInterpolating("4pl"));
});

test("interpolating models send log X and no weighting; fitted models are unchanged", () => {
  const sp = stdPayloads(rows, { ...DEFAULT_STD_OPTIONS, model: "spline", weighting: "1/Y2" })[0]
    .payload as { options: Record<string, unknown> };
  assert.equal(sp.options.model, "spline");
  assert.equal(sp.options.log_x, true);
  assert.equal(sp.options.weighting, "none");
  const p2p = stdPayloads(rows, { ...DEFAULT_STD_OPTIONS, model: "point_to_point", logX: false })[0]
    .payload as { options: Record<string, unknown> };
  assert.equal(p2p.options.log_x, false);
  const fourPl = stdPayloads(rows, { ...DEFAULT_STD_OPTIONS, weighting: "1/Y2", bottom: "0" })[0]
    .payload as { options: Record<string, unknown> };
  assert.equal(fourPl.options.weighting, "1/Y2");
  assert.equal("log_x" in fourPl.options, false);
  assert.deepEqual(fourPl.options.constraints, { Bottom: 0 });
});
