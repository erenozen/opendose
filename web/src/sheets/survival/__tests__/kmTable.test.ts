// Kaplan-Meier table: counts per distinct time, estimates carried as a step.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { kmTable, survivalGroups } from "../kmTable.ts";

// R's aml, maintained group: survfit gives S(9) = 0.909, S(13) = 0.818
const times = [9, 13, 13, 18, 23, 28, 31, 34, 45, 48, 161];
const events = [1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0];
const points = [
  { time: 0, survival: 1, se: 0, lower: 1, upper: 1 },
  { time: 9, survival: 0.9090909, se: 0.0866784, lower: 0.508, upper: 0.987 },
  { time: 13, survival: 0.8181818, se: 0.1162913, lower: 0.447, upper: 0.951 },
  { time: 18, survival: 0.7159091, se: 0.139665, lower: 0.35, upper: 0.899 },
];

test("one row per distinct time: at risk, events, censored", () => {
  const rows = kmTable(times, events, points);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { time: 9, atRisk: 11, events: 1, censored: 0, survival: 0.9090909,
    se: 0.0866784, lower: 0.508, upper: 0.987 });
  assert.deepEqual([rows[1].atRisk, rows[1].events, rows[1].censored], [10, 1, 1]);
  // censoring only at 28: the estimate of the last event time (here 18) carries over
  const r28 = rows.find((r) => r.time === 28)!;
  assert.deepEqual([r28.atRisk, r28.events, r28.censored, r28.survival], [6, 0, 1, 0.7159091]);
});

test("groups read from the first two subcolumns, rows with both values", () => {
  const t = normalizeTable({ type: "survival", datasets: [
    { name: "A", subTitles: ["Time", "Event"], rows: [["5", "1"], ["8", ""], ["9", "0"]] },
    { name: "Empty", subTitles: ["Time", "Event"], rows: [["", ""]] },
  ] });
  assert.deepEqual(survivalGroups(t), [{ name: "A", times: [5, 9], events: [1, 0] }]);
});
