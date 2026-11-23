// qPCR LoD95: which dilution series are sent as hit-rate series, and the
// methods sentence. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { longTable } from "../../kit/columns.ts";
import { lodMethods } from "../lod.ts";
import { DEFAULT_QPCR_OPTIONS, normalizeQpcrOptions, qpcrPayload, readQpcr } from "../model.ts";

const table = (series: string[][]) => {
  const rows = [
    ["A1", "A", "GAPDH", "18", ""], ["A1", "A", "IL6", "25", ""],
    ["B1", "B", "GAPDH", "18.2", ""], ["B1", "B", "IL6", "23", ""], ...series,
  ];
  return longTable(["Sample", "Group", "Target", "Cq", "Quantity"].map((name, c) => ({
    name, varType: c >= 3 ? "continuous" as const : "categorical" as const, values: rows.map((r) => r[c]),
  })));
};

test("a series with wells that gave no Cq is sent as a hit-rate series; an efficiency series is not", () => {
  const t = table([
    ["", "", "IL6", "33.1", "10"], ["", "", "IL6", "Undetermined", "10"], ["", "", "IL6", "35", "1"],
    ["", "", "GAPDH", "20", "1000"], ["", "", "GAPDH", "23.3", "100"], ["", "", "GAPDH", "26.6", "10"],
  ]);
  const o = normalizeQpcrOptions({ referenceGenes: ["GAPDH"] });
  const p = qpcrPayload(readQpcr(t, o), o) as any;
  assert.deepEqual(Object.keys(p.data.dilution_series), ["IL6"]);
  assert.deepEqual(p.data.dilution_series.IL6, [
    { quantity: 10, cq: "33.1" }, { quantity: 10, cq: "Undetermined" }, { quantity: 1, cq: "35" }]);
  const none = qpcrPayload(readQpcr(table([]), DEFAULT_QPCR_OPTIONS), o) as any;
  assert.equal("dilution_series" in none.data, false);
});

test("the LoD95 methods sentence", () => {
  assert.equal(lodMethods(undefined, "95%"), "");
  const s = lodMethods({
    IL6: { lod95: 26.168, ci: [15.004, 76.6], note: null },
    TNF: { lod95: null, ci: null, note: "every well was detected: the LoD95 lies below the lowest quantity tested (1)" },
  }, "95%");
  assert.match(s, /^The limit of detection \(LoD95, the quantity detected in 95% of wells\)/);
  assert.match(s, /IL6 26\.17 \(95% CI 15 to 76\.6\); TNF not estimated \(every well was detected/);
});
