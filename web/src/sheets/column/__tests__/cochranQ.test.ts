// P-45: Cochran's Q from the column table: the payload the engine gets.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS } from "../../../types.ts";
import { columnPayload } from "../run.ts";

const o = { ...DEFAULT_COLUMN_OPTIONS, analysis: "cochran_q" as const };

test("the 0/1 table goes to the engine as one column per condition", () => {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "Stain A", rows: [["1"], ["0"]] }, { name: "Stain B", rows: [["1"], ["1"]] },
    { name: "Stain C", rows: [["0"], [""]] }] });
  const p = columnPayload(t, o) as { analysis: string; data: { datasets: { ys: unknown[][] }[] } };
  assert.equal(p.analysis, "cochrans_q");
  assert.deepEqual(p.data.datasets.map((d) => d.ys.map((r) => r[0])), [[1, 0], [1, 1], [0, null]]);
});
