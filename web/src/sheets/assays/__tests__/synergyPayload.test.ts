// Synergy engine payload: the replicate P value switch. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SYNERGY, normalizeSynergy, synergyPayload, synergyTable } from "../synergyModel.ts";

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
