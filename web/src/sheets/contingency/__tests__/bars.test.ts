// Contingency-table graphs: the numbers of each bar (bars.ts).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import { contingencyBars, ctAutoTitles, GRAPH_CT_PERCENT, GRAPH_CT_STACKED } from "../bars.ts";

test("one series per outcome, percent of each group's total, empty groups left out", () => {
  const t = normalizeTable({ type: "contingency", x: ["", "", ""], rowTitles: ["Exposed", "", "Not exposed"],
    datasets: [{ name: "Event", rows: [["15"], [""], ["5"]] }, { name: "No event", rows: [["85"], [""], ["95"]] }] });
  const b = contingencyBars(t);
  assert.deepEqual(b.groups, ["Exposed", "Not exposed"]);
  assert.deepEqual(b.totals, [100, 100]);
  assert.deepEqual(b.series.map((s) => s.name), ["Event", "No event"]);
  assert.deepEqual(b.series[0].counts, [15, 5]);
  assert.deepEqual(b.series[1].percent, [85, 95]);
  assert.equal(ctAutoTitles(GRAPH_CT_PERCENT)(t).y, "Percent of group");
  assert.equal(ctAutoTitles(GRAPH_CT_STACKED)(t).y, "Count");
});

test("excluded cells count as blank", () => {
  const t = normalizeTable({ type: "contingency", x: [""], rowTitles: ["A"],
    datasets: [{ name: "Yes", rows: [["3"]], excluded: ["0:0"] }, { name: "No", rows: [["1"]] }] });
  const b = contingencyBars(t);
  assert.deepEqual(b.series[0].counts, [null]);
  assert.deepEqual(b.series[1].percent, [100]);
});
