// Densitometry module: reading lanes, the engine payload, the matched
// table and the export import (same-row and band-per-row exports).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DENS_OPTIONS, densPayload, guessImport, matchedSettings, matchedTable, normalizeDensOptions,
  readLanes, tableFromExport,
} from "../model.ts";
import { densitometrySample, emptyDensitometry } from "../sample.ts";

test("the example: 16 lanes on 4 blots with backgrounds", () => {
  const d = readLanes(densitometrySample(), DEFAULT_DENS_OPTIONS);
  assert.equal(d.problem, null);
  assert.equal(d.records.length, 16);
  assert.deepEqual(d.blots, ["Blot 1", "Blot 2", "Blot 3", "Blot 4"]);
  assert.deepEqual(d.records[0], { blot: "Blot 1", lane: "1", group: "Control", sample: "C1.1",
    target: 9654, reference: 21899, background: 1221, reference_background: 617 });
  assert.match(readLanes(emptyDensitometry(), DEFAULT_DENS_OPTIONS).problem!, /No lanes/);
});

test("payload: control group, saturation, control lanes", () => {
  const d = readLanes(densitometrySample(), DEFAULT_DENS_OPTIONS);
  const o = normalizeDensOptions({ controlGroup: "Drug", saturation: "65535", controlMode: "lane",
    controlLanes: { "Blot 1": "2", "Blot 9": "1" }, test: "ratio_paired" });
  const p = densPayload(d, o) as any;
  assert.equal(p.options.control_group, "Drug");
  assert.equal(p.options.saturation_limit, 65535);
  assert.deepEqual(p.options.control_lanes, { "Blot 1": "2" });
  assert.equal(p.options.test, "ratio_paired");
  assert.equal((densPayload(d, DEFAULT_DENS_OPTIONS) as any).options.control_group, "Control");
});

test("matched table: blots down the rows, ratio paired t for two groups", () => {
  const res = { groups: ["Control", "Drug"],
    matched_normalized: { blots: ["B1", "B2"], groups: { Control: [0.35, 0.41], Drug: [0.95, null] } } };
  const t = matchedTable(res)!;
  assert.equal(t.type, "column");
  assert.deepEqual(t.rowTitles, ["B1", "B2"]);
  assert.deepEqual(t.datasets[1].rows, [["0.95"], [""]]);
  assert.deepEqual(matchedSettings({}, t), { analysis: "ttest", ttestKind: "ratio_paired", datasetA: 1, datasetB: 0 });
});

test("import: target and loading control on one row", () => {
  const headers = ["Blot", "Lane", "Treatment", "Adj. Volume (Int)", "Actin"];
  const m = guessImport(headers);
  assert.equal(m.roles.target, 3);
  assert.equal(m.roles.reference, 4);
  assert.equal(m.roles.group, 2);
  const t = tableFromExport([["1", "1", "Ctrl", "100", "50"], ["1", "2", "Drug", "300", "60"]], m);
  const d = readLanes(t, DEFAULT_DENS_OPTIONS);
  assert.deepEqual(d.records[1], { blot: "1", lane: "2", group: "Drug", target: 300, reference: 60 });
});

test("import: one row per band, paired by blot and lane", () => {
  const m = { ...guessImport(["Lane", "Group", "Protein", "Volume"]), bandColumn: 2,
    targetValue: "pERK", referenceValue: "GAPDH", blotName: "Gel A" };
  m.roles.target = 3;
  const t = tableFromExport([
    ["1", "Ctrl", "pERK", "100"], ["1", "Ctrl", "GAPDH", "40"],
    ["2", "Drug", "GAPDH", "50"], ["2", "Drug", "pERK", "250"],
  ], m);
  const d = readLanes(t, DEFAULT_DENS_OPTIONS);
  assert.deepEqual(d.records.map((r) => [r.blot, r.lane, r.target, r.reference]),
    [["Gel A", "1", 100, 40], ["Gel A", "2", 250, 50]]);
});
