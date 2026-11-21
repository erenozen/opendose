// Wound-healing module: options, the engine payload, the linked % closure
// table and the unit labels. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../../project/table.ts";
import {
  areaUnit, closureTable, DEFAULT_WOUND, normalizeWound, runWound, timeUnit, woundPayload,
} from "../model.ts";
import { woundSample } from "../sample.ts";

test("the example: 5 times, 3 conditions of 4 wells, units read from the titles", () => {
  const t = woundSample();
  assert.equal(t.subcolumnFormat, "replicates");
  assert.deepEqual(t.x, ["0", "6", "12", "18", "24"]);
  assert.deepEqual(t.datasets.map((d) => [d.name, d.rows[0].length]), [["Control", 4], ["siRNA", 4], ["TGF-β", 4]]);
  assert.equal(timeUnit(t), "h");
  assert.equal(areaUnit(t), "µm²");
  // a new XY table's default X unit (molar) is never taken for a time
  assert.equal(timeUnit(normalizeTable({ type: "xy", x: ["0"], datasets: [] })), "time unit");
  assert.equal(timeUnit(normalizeTable({ type: "xy", x: ["0"], xUnit: "min", datasets: [] })), "min");
});

test("payload: numeric data, the window as numbers or null, the control clamped", () => {
  const p = woundPayload(woundSample(), normalizeWound({ windowStart: "0", windowEnd: "", controlIndex: 9 })) as {
    analysis: string; data: { x: number[]; datasets: { name: string; ys: number[][] }[] }; options: Record<string, unknown>;
  };
  assert.equal(p.analysis, "wound_healing");
  assert.deepEqual(p.data.x, [0, 6, 12, 18, 24]);
  assert.equal(p.data.datasets[2].ys[4][3], 39164);
  assert.deepEqual(p.options.window, [0, null]);
  assert.equal(p.options.control_index, 2);
  assert.equal(p.options.rate_basis, "percent");
  assert.equal(p.options.target, 50);
});

test("options are sanitised", () => {
  const o = normalizeWound({ target: 0, rateBasis: "x", test: "magic", comparisons: "y", controlIndex: -1 });
  assert.deepEqual(o, DEFAULT_WOUND);
  assert.equal(normalizeWound({ target: 80 }).target, 80);
});

test("means-with-errors tables are refused with a reason", () => {
  const t = normalizeTable({ type: "xy", x: ["0", "1"], subcolumnFormat: "mean_sd",
    datasets: [{ name: "C", rows: [["1", "0.1"], ["0.5", "0.1"]] }] });
  const r = runWound(() => assert.fail("engine called"), t, DEFAULT_WOUND);
  assert.match(String(r.error), /one replicate column per well/);
});

test("the linked table holds each well's % closure at its time", () => {
  const src = normalizeTable({ type: "xy", x: ["0", "6", "12"], xTitle: "Time (h)",
    datasets: [{ name: "C", rows: [["100", "200"], ["50", ""], ["25", "100"]] }] });
  const res = {
    conditions: ["C"],
    wells: [
      { condition: "C", well: 1, times: [0, 6, 12], closure: [0, 50, 75] },
      { condition: "C", well: 2, times: [0, 12], closure: [0, 50] },
    ],
  };
  const t = closureTable(res, src)!;
  assert.equal(t.type, "xy");
  assert.equal(t.yTitle, "Wound closure (%)");
  assert.deepEqual(t.x, ["0", "6", "12"]);
  assert.deepEqual(t.datasets[0].rows, [["0", "0"], ["50", ""], ["75", "50"]]);
  assert.equal(closureTable({ error: "x" }, src), null);
});
