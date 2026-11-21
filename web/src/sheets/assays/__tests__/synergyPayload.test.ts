// Synergy engine payload: the replicate P value switch. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SYNERGY, normalizeSynergy, predictedCells, synergyPayload, synergyTable } from "../synergyModel.ts";

const table = synergyTable(["0", "1", "3"], ["0", "2", "6"],
  [[["100", "80", "60"], ["90", "70", "40"], ["70", "50", "20"]]], "Viability (%)");

test("replicate P values are on by default and leave the payload as it was", () => {
  const o = normalizeSynergy({}, table);
  assert.equal(o.replicateP, true);
  const p = synergyPayload(table, o) as { options: Record<string, unknown> };
  assert.equal("p_iterations" in p.options, false);
});

test("turning replicate P values off sends p_iterations 0", () => {
  const o = normalizeSynergy({ ...DEFAULT_SYNERGY, replicateP: false }, table);
  const p = synergyPayload(table, o) as { options: Record<string, unknown> };
  assert.equal(p.options.p_iterations, 0);
});

test("outlier check and filling are off by default and sent only when on", () => {
  const off = synergyPayload(table, normalizeSynergy({}, table)) as { options: Record<string, unknown> };
  assert.equal("outliers" in off.options, false);
  assert.equal("impute" in off.options, false);
  const on = synergyPayload(table, normalizeSynergy({ outliers: "replace", impute: true }, table)) as
    { options: Record<string, unknown> };
  assert.equal(on.options.outliers, "replace");
  assert.equal(on.options.impute, true);
  assert.equal(normalizeSynergy({ outliers: "drop" }, table).outliers, "none");
});

test("filled and replaced cells are found for marking", () => {
  const cells = predictedCells({ conc1: [0, 1, 3], conc2: [0, 2, 6],
    filled_cells: [{ conc1: 1, conc2: 0, value: 5, reason: "missing" }, { conc1: 3, conc2: 6, value: 9, reason: "outlier" }] });
  assert.deepEqual([...cells].sort(), ["1,0", "2,2"]);
  assert.equal(predictedCells({ conc1: [0, 1], conc2: [0, 1] }).size, 0);
});
