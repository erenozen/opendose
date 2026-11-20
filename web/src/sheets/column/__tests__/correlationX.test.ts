// Correlation on an XY table, X against each Y data set: one request per
// data set, X and the row means of the replicates. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { DEFAULT_COLUMN_OPTIONS, type ColumnOptionsState } from "../../../types.ts";
import { correlationXRequests } from "../correlationX.ts";

const o = { ...DEFAULT_COLUMN_OPTIONS, analysis: "correlation", corrWithX: true,
  corrMethod: "spearman" } as ColumnOptionsState;

test("X against each Y, replicates averaged per row, empty data sets skipped", () => {
  const t = normalizeTable({ type: "xy", xTitle: "Dose", x: ["1", "2", "3"], datasets: [
    { name: "A", rows: [["2", "4"], ["5", ""], ["9", "7"]] },
    { name: "B", rows: [["1"], ["2"], ["3"]] },
    { name: "Empty", rows: [[""], [""], [""]] },
  ] });
  const r = correlationXRequests(t, o);
  assert.ok(!("error" in r));
  assert.equal(r.replicatesAveraged, true);
  assert.deepEqual(r.requests.map((q) => q.name), ["A", "B"]);
  assert.deepEqual(r.requests[0].payload, { analysis: "correlation",
    data: { datasets: [{ name: "Dose", ys: [[1], [2], [3]] }, { name: "A", ys: [[3], [5], [8]] }] },
    options: { method: "spearman", dataset_a: 0, dataset_b: 1 } });
});

test("single values are not reported as averaged; other tables are refused", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "2"], datasets: [{ name: "A", rows: [["2"], ["4"]] }] });
  const r = correlationXRequests(t, o);
  assert.ok(!("error" in r) && r.replicatesAveraged === false);
  assert.equal((r.requests[0].payload.data as { datasets: { name: string }[] }).datasets[0].name, "X");
  const col = normalizeTable({ type: "column", datasets: [{ name: "A", rows: [["1"]] }] });
  assert.ok("error" in correlationXRequests(col, o));
});
