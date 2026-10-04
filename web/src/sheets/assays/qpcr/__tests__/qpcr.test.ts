// qPCR module: reading Cq records, reference genes, the engine payload,
// the ΔCq table and the Cq-export import. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { longTable } from "../../kit/columns.ts";
import {
  calibratorOf, dcqSettings, dcqTable, DEFAULT_QPCR_OPTIONS, normalizeQpcrOptions, qpcrPayload,
  readQpcr, referenceGenes, runQpcr, tableFromStaging,
} from "../model.ts";
import { qpcrSample } from "../sample.ts";

test("the example: 108 wells, two targets, two reference genes, three groups", () => {
  const d = readQpcr(qpcrSample(), DEFAULT_QPCR_OPTIONS);
  assert.equal(d.problem, null);
  assert.equal(d.records.length, 108);
  assert.deepEqual(d.targets, ["GAPDH", "ACTB", "IL6", "TNF"]);
  assert.deepEqual(d.groups, ["Control", "LPS", "LPS + inhibitor"]);
  assert.deepEqual(referenceGenes(DEFAULT_QPCR_OPTIONS, d.targets), ["GAPDH", "ACTB"]);
  assert.equal(calibratorOf(DEFAULT_QPCR_OPTIONS, d.groups), "Control");
});

test("payload: options, efficiencies as entered, undetermined wells", () => {
  const t = qpcrSample();
  const o = normalizeQpcrOptions({ referenceGenes: ["GAPDH"], calibrator: "LPS", efficiencyMode: "entered",
    efficiencies: { IL6: "95", TNF: "", nope: "2" }, undetermined: "40", test: "anova" });
  const p = qpcrPayload(readQpcr(t, o), o) as any;
  assert.equal(p.analysis, "qpcr");
  assert.deepEqual(p.options.reference_genes, ["GAPDH"]);
  assert.equal(p.options.calibrator, "LPS");
  assert.deepEqual(p.options.efficiencies, { IL6: 95 });
  assert.equal(p.options.undetermined_value, 40);
  assert.equal(p.options.test, "anova");
  assert.deepEqual(p.data.records[0], { sample: "CON-1", group: "Control", target: "GAPDH", cq: "17.83", well: "A1" });
});

test("rows with a quantity form a dilution series, not samples", () => {
  const t = longTable([
    { name: "Sample", varType: "categorical", values: ["S1", "", "", "", "S1"] },
    { name: "Group", varType: "categorical", values: ["A", "", "", "", "A"] },
    { name: "Target", varType: "categorical", values: ["T", "T", "T", "T", "R"] },
    { name: "Cq", varType: "continuous", values: ["25", "20", "23.3", "26.6", "18"] },
    { name: "Quantity", varType: "continuous", values: ["", "1000", "100", "10", ""] },
  ]);
  const o = normalizeQpcrOptions({ efficiencyMode: "curve", referenceGenes: ["R"] });
  const d = readQpcr(t, o);
  assert.equal(d.records.length, 2);
  assert.deepEqual(d.curves.T.map((p) => p.quantity), [1000, 100, 10]);
  assert.deepEqual(Object.keys((qpcrPayload(d, o) as any).data.standard_curves), ["T"]);
  assert.match(runQpcr(() => ({}), t, normalizeQpcrOptions({})).error!, /reference gene/);
});

const fakeResult = {
  groups: ["Ctrl", "Drug"], targets: ["IL6"],
  results: [
    { target: "IL6", group: "Ctrl", dcq: 10.1 }, { target: "IL6", group: "Ctrl", dcq: 9.9 },
    { target: "IL6", group: "Drug", dcq: 7 }, { target: "IL6", group: "Drug", dcq: null },
  ],
};

test("ΔCq table: a column table for one target, grouped for several", () => {
  const t = dcqTable(fakeResult)!;
  assert.equal(t.type, "column");
  assert.deepEqual(t.datasets.map((d) => d.rows.map((r) => r[0])), [["10.1", "9.9"], ["7", ""]]);
  assert.equal((dcqSettings({}, t) as any).ttestKind, "unpaired");
  const two = dcqTable({ ...fakeResult, targets: ["IL6", "TNF"],
    results: [...fakeResult.results, { target: "TNF", group: "Drug", dcq: 5 }] })!;
  assert.equal(two.type, "grouped");
  assert.deepEqual(two.rowTitles, ["IL6", "TNF"]);
  assert.deepEqual(two.datasets[1].rows[1], ["5", ""]);
  assert.equal(dcqTable({ error: "x" }), null);
});

test("Cq export import: group from the sample name", () => {
  const t = tableFromStaging(["Well", "Sample Name", "Target Name", "CT"],
    [["A1", "Ctrl 1", "GAPDH", "18.2"], ["A2", "LPS-3", "IL6", "Undetermined"]], true);
  const d = readQpcr(t, DEFAULT_QPCR_OPTIONS);
  assert.deepEqual(d.records, [
    { sample: "Ctrl 1", group: "Ctrl", target: "GAPDH", cq: "18.2", well: "A1", pair: "" },
    { sample: "LPS-3", group: "LPS", target: "IL6", cq: "Undetermined", well: "A2", pair: "" },
  ]);
});
