// Unit tests for the nested two-way ANOVA payload (grouped tables) and the
// long-table fill. The data are engine/tests/test_mixed_nested.py's DATA:
// WT/KO x Vehicle/Drug, 3 mice per cell, 4 values per mouse.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  countUnits, DEFAULT_NESTED_TWO_WAY, nestedFactorNames, nestedFromLong, nestedRecords,
  nestedTwoWayPayload, normalizeNestedTwoWay, rowLevels, runNestedTwoWay,
} from "../nestedTwoWay.ts";

const DATA: [string, string, string, number[]][] = [
  ["WT", "Vehicle", "WV1", [11.4, 11.3, 9.5, 9.7]],
  ["WT", "Vehicle", "WV2", [9.9, 9.3, 10.1, 7.5]],
  ["WT", "Vehicle", "WV3", [11.8, 12.6, 11.7, 11.5]],
  ["WT", "Drug", "WD1", [12.2, 11.2, 11.2, 12.0]],
  ["WT", "Drug", "WD2", [8.2, 10.2, 9.1, 7.8]],
  ["WT", "Drug", "WD3", [9.4, 8.6, 8.3, 9.9]],
  ["KO", "Vehicle", "KV1", [12.3, 11.8, 13.0, 13.3]],
  ["KO", "Vehicle", "KV2", [11.7, 12.2, 10.9, 10.3]],
  ["KO", "Vehicle", "KV3", [12.2, 13.0, 10.6, 11.3]],
  ["KO", "Drug", "KD1", [10.6, 12.4, 12.8, 11.6]],
  ["KO", "Drug", "KD2", [15.8, 15.6, 15.4, 15.9]],
  ["KO", "Drug", "KD3", [12.3, 12.3, 9.9, 12.0]],
];

/** Block layout: rows WT x4 then KO x4 (only the first row of a block
 *  titled), data sets Vehicle / Drug, subcolumns = the three mice. */
function blockTable() {
  const rowTitles = ["WT", "", "", "", "KO", "", "", ""];
  return normalizeTable({
    type: "grouped",
    yTitle: "Soma area",
    x: rowTitles.map(() => ""),
    rowTitles,
    datasets: ["Vehicle", "Drug"].map((b) => ({
      name: b,
      subTitles: ["Mouse 1", "Mouse 2", "Mouse 3"],
      rows: ["WT", "KO"].flatMap((a) => [0, 1, 2, 3].map((k) =>
        DATA.filter((d) => d[0] === a && d[1] === b).map((d) => String(d[3][k])))),
    })),
  }, "grouped");
}

test("block layout: rows of a block share the level, untitled rows continue it", () => {
  const t = blockTable();
  assert.deepEqual(rowLevels(t, "block"), ["WT", "WT", "WT", "WT", "KO", "KO", "KO", "KO"]);
  assert.deepEqual(rowLevels(t, "titles").slice(0, 2), ["WT", "Row 2"]);
});

test("block layout: 12 mice, 48 values; reused titles qualified by their cell", () => {
  const recs = nestedRecords(blockTable(), DEFAULT_NESTED_TWO_WAY);
  const c = countUnits(recs);
  assert.equal(c.units, 12);
  assert.equal(c.values, 48);
  assert.equal(c.maxPerUnit, 4);
  assert.ok(recs.some((r) => r.unit === "Mouse 1 (WT / Vehicle)"));
  assert.ok(recs.some((r) => r.unit === "Mouse 1 (KO / Drug)"));
  // same unit across cells: titles taken as given
  const same = nestedRecords(blockTable(), { ...DEFAULT_NESTED_TWO_WAY, sameUnit: true });
  assert.equal(countUnits(same).units, 12); // the count is per cell; labels repeat
  assert.equal(new Set(same.map((r) => r.unit)).size, 3);
});

test("payload: records, factor names, levels in table order and engine options", () => {
  const o = { ...DEFAULT_NESTED_TWO_WAY, factorA: "Genotype", factorB: "Treatment",
    comparisons: "sidak" as const };
  const b = nestedTwoWayPayload(blockTable(), o);
  assert.ok(b.payload);
  const p = b.payload as any;
  assert.equal(p.analysis, "mixed_nested_two_way");
  assert.equal(p.data.records.length, 48);
  assert.deepEqual(p.options.levels_a, ["WT", "KO"]);
  assert.deepEqual(p.options.levels_b, ["Vehicle", "Drug"]);
  assert.equal(p.options.factor_a_name, "Genotype");
  assert.equal(p.options.unit_name, "mice");
  assert.equal(p.options.unit_labels, "within_cell");
  assert.equal(p.options.comparisons, "sidak");
  assert.equal(p.options.comparison_scope, "b_within_a");
  const none = nestedTwoWayPayload(blockTable(), { ...o, comparisons: "none" });
  assert.equal((none.payload as any).options.comparisons, null);
});

test("payload: one value per unit is refused with a layout hint", () => {
  const t = normalizeTable({ type: "grouped", rowTitles: ["WT", "KO"], x: ["", ""],
    datasets: [{ name: "Vehicle", rows: [["1", "2"], ["3", "4"]] }] }, "grouped");
  const b = nestedTwoWayPayload(t, DEFAULT_NESTED_TWO_WAY);
  assert.match(b.error ?? "", /one value/);
  const empty = nestedTwoWayPayload(normalizeTable({ type: "grouped" }, "grouped"), DEFAULT_NESTED_TWO_WAY);
  assert.match(empty.error ?? "", /Enter values/);
});

test("titles layout: subcolumns with the same title are one unit", () => {
  const t = normalizeTable({
    type: "grouped", rowTitles: ["WT", "KO"], x: ["", ""],
    datasets: [{ name: "Vehicle", subTitles: ["M1", "M1", "M2", "M2"],
      rows: [["1", "2", "3", "4"], ["5", "6", "7", "8"]] }],
  }, "grouped");
  const recs = nestedRecords(t, { ...DEFAULT_NESTED_TWO_WAY, layout: "titles" });
  assert.equal(countUnits(recs).units, 4);
  assert.equal(countUnits(recs).maxPerUnit, 2);
});

test("factor names: typed, else the table's, else defaults; options normalised", () => {
  assert.deepEqual(nestedFactorNames({ factorA: "", factorB: "" }, {}), ["Row factor", "Column factor"]);
  assert.deepEqual(nestedFactorNames({ factorA: "", factorB: "Drug" },
    { factorNames: { rows: "Genotype" } }), ["Genotype", "Drug"]);
  const o = normalizeNestedTwoWay({ layout: "titles", unit: "litter", comparisons: "bogus", ciLevel: 3 });
  assert.equal(o.layout, "titles");
  assert.equal(o.unit, "litter");
  assert.equal(o.comparisons, "tukey");
  assert.equal(o.ciLevel, 0.95);
});

test("run: adds the unit words and the outcome to the engine's result", () => {
  let seen: any = null;
  const r = runNestedTwoWay({ analyze: (p) => { seen = p; return { analysis: "mixed_nested_two_way" }; } },
    blockTable(), DEFAULT_NESTED_TWO_WAY);
  assert.equal(seen.analysis, "mixed_nested_two_way");
  assert.deepEqual(r.unit_words, { singular: "mouse", plural: "mice" });
  assert.equal(r.outcome, "Soma area");
});

test("long table: records become the block layout, units numbered per cell", () => {
  const headers = ["mouse", "genotype", "treatment", "area"];
  const rows = DATA.flatMap(([a, b, u, vals]) => vals.map((v) => [u, a, b, String(v)]));
  const r = nestedFromLong(headers, rows, { value: 3, a: 1, b: 2, unit: 0 },
    normalizeTable({ type: "grouped" }, "grouped"));
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.units, 12);
  assert.equal(r.values, 48);
  assert.deepEqual(r.table.rowTitles, ["WT", "WT", "WT", "WT", "KO", "KO", "KO", "KO"]);
  assert.deepEqual(r.table.datasets.map((d) => d.name), ["Vehicle", "Drug"]);
  assert.deepEqual(r.table.datasets[1].rows[4], ["10.6", "15.8", "12.3"]);
  assert.equal(r.options.factorA, "genotype");
  const back = countUnits(nestedRecords(r.table, normalizeNestedTwoWay(r.options)));
  assert.equal(back.units, 12);
  assert.equal(back.values, 48);
  const bad = nestedFromLong(headers, rows, { value: 3, a: 3, unit: 0 }, r.table);
  assert.ok("error" in bad);
});
