// Excluded values never reach the engine from a grouped table: the payload
// every grouped analysis builds (two-way ANOVA, multiple t tests, three-way,
// row means, column statistics) blanks them. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { groupedPayload } from "../stats.ts";

const table = normalizeTable({ type: "grouped", rowTitles: ["r1", "r2"], datasets: [
  { name: "A", rows: [["1", "999"], ["2", "3"]], excluded: ["0:1"] },
  { name: "B", rows: [["4", "5"], ["6", "7"]] },
] });

test("the grouped payload blanks excluded values", () => {
  assert.deepEqual(groupedPayload(table).datasets[0].ys, [[1, null], [2, 3]]);
  assert.deepEqual(groupedPayload(table).datasets[1].ys, [[4, 5], [6, 7]]);
});
