// Dual-luciferase module: reading wells, the blank and control groups,
// the engine payload and the linked ratio table. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { longTable } from "../../kit/columns.ts";
import {
  blankOf, controlOf, DEFAULT_LUC_OPTIONS, lucPayload, normalizeLucOptions, ratioSettings, ratioTable,
  readWells, sampleGroups,
} from "../model.ts";
import { emptyLuciferase, luciferaseSample } from "../sample.ts";

test("the example: 36 wells in 3 experiments, Mock found as the blank group", () => {
  const o = DEFAULT_LUC_OPTIONS;
  const d = readWells(luciferaseSample(), o);
  assert.equal(d.problem, null);
  assert.equal(d.records.length, 36);
  assert.deepEqual(d.experiments, ["Exp 1", "Exp 2", "Exp 3"]);
  assert.deepEqual(d.records[3], { group: "Empty vector", firefly: 7571, renilla: 95376, well: "A4", experiment: "Exp 1" });
  assert.equal(blankOf(o, d.groups), "Mock");
  assert.deepEqual(sampleGroups(o, d.groups), ["Empty vector", "Promoter", "Promoter + TNF-α"]);
  assert.equal(controlOf(o, d.groups), "Empty vector");
  const p = lucPayload(d, o) as { analysis: string; options: Record<string, unknown> };
  assert.equal(p.analysis, "luciferase");
  assert.deepEqual(p.options, {
    control_group: "Empty vector", blank_group: "Mock",
    groups: ["Empty vector", "Promoter", "Promoter + TNF-α"], test: "auto", comparisons: "dunnett",
    low_renilla: 0.1, ci_level: 0.95,
  });
  assert.match(readWells(emptyLuciferase(), o).problem!, /No wells/);
});

test("the blank group can be switched off or chosen, and is never the control", () => {
  const d = readWells(luciferaseSample(), DEFAULT_LUC_OPTIONS);
  const off = normalizeLucOptions({ blankGroup: "(none)" });
  assert.equal(blankOf(off, d.groups), "");
  assert.equal(controlOf(off, d.groups), "Mock");
  assert.equal("blank_group" in (lucPayload(d, off) as { options: object }).options, false);
  const chosen = normalizeLucOptions({ blankGroup: "Empty vector", controlGroup: "Empty vector" });
  assert.equal(controlOf(chosen, d.groups), "Mock");
});

test("plate-reader headers are recognised (Fluc / Rluc), experiment optional", () => {
  const t = longTable([
    { name: "Well", varType: "categorical", values: ["A1", "A2", "A3", "A4"] },
    { name: "Construct", varType: "categorical", values: ["pGL3", "pGL3", "pGL3-Prom", "pGL3-Prom"] },
    { name: "Fluc", varType: "continuous", values: ["1000", "1100", "5000", "5200"] },
    { name: "Rluc", varType: "continuous", values: ["2000", "2100", "2050", "1990"] },
  ]);
  const d = readWells(t, DEFAULT_LUC_OPTIONS);
  assert.equal(d.problem, null);
  assert.deepEqual(d.experiments, []);
  assert.deepEqual(d.records[2], { group: "pGL3-Prom", firefly: 5000, renilla: 2050, well: "A3" });
  assert.equal(blankOf(DEFAULT_LUC_OPTIONS, d.groups), "");
});

test("options are sanitised", () => {
  const o = normalizeLucOptions({ test: "magic", comparisons: "x", lowRenilla: 3, ciLevel: 0.9 });
  assert.equal(o.test, "auto");
  assert.equal(o.comparisons, "dunnett");
  assert.equal(o.lowRenilla, 0.1);
  assert.equal(o.ciLevel, 0.9);
  assert.equal(normalizeLucOptions({ lowRenilla: 0 }).lowRenilla, 0);
});

test("the linked ratio table: experiments as rows, or wells as replicates", () => {
  const exp = {
    unit: "experiment", groups: ["C", "T"],
    matched_ratio: { experiments: ["E1", "E2"], groups: { C: [0.1, 0.2], T: [0.4, 0.6] } },
  };
  const t = ratioTable(exp)!;
  assert.deepEqual(t.rowTitles, ["E1", "E2"]);
  assert.deepEqual(t.datasets.map((d) => d.name), ["C", "T"]);
  assert.deepEqual(t.datasets[1].rows, [["0.4"], ["0.6"]]);
  assert.deepEqual(ratioSettings({}, t, exp),
    { analysis: "ttest", ttestKind: "ratio_paired", datasetA: 1, datasetB: 0 });
  const wells = { unit: "well", groups: ["C", "T"], ratios_by_group: { C: [1, 2, 3], T: [4, 5] } };
  const w = ratioTable(wells)!;
  assert.equal(w.x.length, 3);
  assert.deepEqual(w.datasets[1].rows, [["4"], ["5"], [""]]);
  assert.deepEqual(ratioSettings({ keep: 1 }, w, wells), { keep: 1 });
  assert.equal(ratioTable({ error: "x" }), null);
});
