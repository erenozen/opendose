// Unit tests for the grouping-column mixed model's options and payload.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  defaultMixedGrouping, isGeneralModel, lmmPayload, mixedGroupingPayload, normalizeMixedGrouping,
  runMixedGrouping,
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

// ------------------------------------------------ P-87: the general model

function animals() {
  const rows = [["WT", "M1", "S1", "20.1", "21.5"], ["WT", "M1", "S2", "18.4", "20.2"],
    ["KO", "M2", "S1", "22.3", "23.9"], ["KO", "M2", "S1", "19.0", ""]];
  const names = ["Genotype", "Animal", "Slice", "Size", "Current"];
  return normalizeTable({
    type: "multivariable",
    x: rows.map(() => ""),
    datasets: names.map((name, c) => ({
      name, varType: c < 3 ? "categorical" : "continuous", rows: rows.map((r) => [r[c]]),
    })),
  }, "multivariable");
}

test("general model: older options stay the grouping-column ANOVA", () => {
  const o = normalizeMixedGrouping({ comparisons: "sidak" }, table());
  assert.equal(isGeneralModel(o), false);
  assert.equal("covariates" in o || "subgroup" in o || "slopes" in o, false);
  assert.equal((mixedGroupingPayload(table(), o).payload as any).analysis, "mixed_grouping");
});

test("general model: nested level, covariate and random slope go to the lmm handler", () => {
  const o = normalizeMixedGrouping({
    outcome: "Current", factor1: "Genotype", factor2: "", grouping: "Animal", subgroup: "Slice",
    covariates: ["Size"], slopes: ["Size", "Nope"], mixedDdf: "satterthwaite",
  }, animals());
  assert.deepEqual(o.slopes, ["Size"]);
  assert.equal(isGeneralModel(o), true);
  const p = mixedGroupingPayload(animals(), o).payload as any;
  assert.equal(p.analysis, "lmm");
  assert.deepEqual(p.options.factors, ["Genotype"]);
  assert.deepEqual(p.options.covariates, ["Size"]);
  assert.deepEqual(p.options.slopes, ["Size"]);
  assert.equal(p.options.slope_structure, "correlated");
  assert.equal(p.options.group, "Animal");
  assert.equal(p.options.subgroup, "Slice");
  assert.equal(p.options.ddf, "satterthwaite");
  assert.equal(p.options.comparison_scope, "a_means");
  assert.deepEqual(p.data.variables.map((v: any) => v.name), ["Current", "Genotype", "Size", "Animal", "Slice"]);
  assert.deepEqual(p.data.variables.find((v: any) => v.name === "Size").values, [20.1, 18.4, 22.3, 19]);
  assert.deepEqual(p.data.variables.find((v: any) => v.name === "Current").values, [21.5, 20.2, 23.9, null]);
});

test("general model: containment df become Kenward-Roger; covariates only need no factor", () => {
  const o = normalizeMixedGrouping({ outcome: "Current", factor1: "", factor2: "", grouping: "Animal",
    covariates: ["Size"] }, animals());
  const p = lmmPayload(animals(), o).payload as any;
  assert.equal(p.options.ddf, "kenward_roger");
  assert.deepEqual(p.options.factors, []);
  assert.equal(p.options.comparisons, null);
  assert.match(lmmPayload(animals(), { ...o, covariates: [] }).error ?? "", /factor .* or a covariate/);
  assert.match(lmmPayload(animals(), { ...o, subgroup: "Animal" }).error ?? "", /different variables/);
  assert.match(lmmPayload(animals(), { ...o, subgroup: "Gone" }).error ?? "", /nested level again/);
});
