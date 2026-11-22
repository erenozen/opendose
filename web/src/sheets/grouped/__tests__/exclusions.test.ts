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

test("row means of an XY table link back as an XY table with the same X", async () => {
  const { rowMeansTable } = await import("../tables.ts");
  const result = { calculate: "mean", error_type: "sd", scope: "row", row_titles: ["0.1", "1"],
    rows: [{ value: 2, sd: 0.5, n: 3 }, { value: 4, sd: 1, n: 3 }] };
  const xy = rowMeansTable(result, "Signal", ["0.1", "1"]);
  assert.equal(xy.type, "xy");
  assert.deepEqual(xy.x, ["0.1", "1"]);
  assert.deepEqual(xy.datasets[0].rows, [["2", "0.5", "3"], ["4", "1", "3"]]);
  const grouped = rowMeansTable(result, "Signal");
  assert.equal(grouped.type, "grouped");
  assert.deepEqual(grouped.rowTitles, ["0.1", "1"]);
});
