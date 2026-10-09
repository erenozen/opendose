// Unit tests for the grouping-column mixed model's options and payload.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  defaultMixedGrouping, mixedGroupingPayload, normalizeMixedGrouping, runMixedGrouping,
} from "../mixedGrouping.ts";

function table() {
  const rows = [["WT", "Vehicle", "M1", "11.4"], ["WT", "Vehicle", "M1", "11.3"],
    ["KO", "Drug", "M2", "15.8"], ["KO", "Drug", "M2", ""]];
  const names = ["Genotype", "Treatment", "Mouse", "Area"];
  return normalizeTable({
    type: "multivariable",
    x: rows.map(() => ""),
    datasets: names.map((name, c) => ({
      name, varType: c < 3 ? "categorical" : "continuous", rows: rows.map((r) => [r[c]]),
    })),
  }, "multivariable");
}

test("defaults: grouping found by name, outcome continuous, factors categorical", () => {
  const o = defaultMixedGrouping(table());
  assert.equal(o.grouping, "Mouse");
  assert.equal(o.outcome, "Area");
  assert.equal(o.factor1, "Genotype");
  assert.equal(o.factor2, "Treatment");
  assert.equal(o.unit, "mouse");
});

test("payload: the four variables, factors, grouping and engine options", () => {
  const o = normalizeMixedGrouping({ comparisons: "sidak" }, table());
  const p = mixedGroupingPayload(table(), o).payload as any;
  assert.equal(p.analysis, "mixed_grouping");
  assert.deepEqual(p.options.factors, ["Genotype", "Treatment"]);
  assert.equal(p.options.grouping, "Mouse");
  assert.equal(p.options.unit_name, "mice");
  assert.deepEqual(p.data.variables.find((v: any) => v.name === "Area").values, [11.4, 11.3, 15.8, null]);
  // one factor: the scope falls back to its marginal means
  const one = mixedGroupingPayload(table(), { ...o, factor2: "" }).payload as any;
  assert.deepEqual(one.options.factors, ["Genotype"]);
  assert.equal(one.options.comparison_scope, "a_means");
});

test("payload: missing or clashing roles are explained", () => {
  const o = normalizeMixedGrouping({}, table());
  assert.match(mixedGroupingPayload(table(), { ...o, grouping: "" }).error ?? "", /grouping column/);
  assert.match(mixedGroupingPayload(table(), { ...o, grouping: "Genotype" }).error ?? "", /different variables/);
  const r = runMixedGrouping({ analyze: () => ({ analysis: "mixed_grouping" }) }, table(), o);
  assert.equal(r.outcome, "Area");
});
