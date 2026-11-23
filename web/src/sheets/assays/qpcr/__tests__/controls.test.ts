// qPCR NTC and no-RT controls: names (the same list as the engine's
// engine/tests/test_qpcr_controls.py), what the payload sends and the
// chip words. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { longTable } from "../../kit/columns.ts";
import { controlChip } from "../controls.ts";
import { controlKind, DEFAULT_QPCR_OPTIONS, normalizeQpcrOptions, qpcrPayload, readQpcr } from "../model.ts";

test("control names, as the engine reads them", () => {
  const cases: [string, "ntc" | "no_rt" | null][] = [
    ["NTC", "ntc"], ["ntc 2", "ntc"], ["NTC_3", "ntc"], ["No template", "ntc"],
    ["no-template control", "ntc"], ["H2O", null], ["Water", null],
    ["CON-1 no-RT", "no_rt"], ["CON-1-RT", "no_rt"], ["NRT", "no_rt"],
    ["RT- CON-1", "no_rt"], ["minus RT 2", "no_rt"], ["(no RT)", "no_rt"],
    ["CON-1", null], ["Short-1", null], ["Waterloo", null], ["NTCP", null],
    ["Part-3", null], ["RTX", null],
  ];
  for (const [name, kind] of cases) assert.equal(controlKind(name), kind, name);
  assert.equal(controlKind("W12", "NTC"), "ntc");
  assert.equal(controlKind("S1", "Ctrl"), null);
});

const plate = (extra: string[][]) => {
  const rows = [
    ["CON-1", "CON", "GAPDH", "18"], ["CON-1", "CON", "IL6", "27"],
    ["LPS-1", "LPS", "GAPDH", "18.1"], ["LPS-1", "LPS", "IL6", "24"], ...extra,
  ];
  return longTable(["Sample", "Group", "Target", "Cq"].map((name, c) => ({
    name, varType: c === 3 ? "continuous" as const : "categorical" as const, values: rows.map((r) => r[c]),
  })));
};

test("controls are not groups or targets; their thresholds go to the engine", () => {
  const t = plate([["NTC", "", "GAPDH", "34"], ["NTC", "", "TNF", "Undetermined"], ["CON-1 no-RT", "CON", "GAPDH", "30"]]);
  const d = readQpcr(t, DEFAULT_QPCR_OPTIONS);
  assert.equal(d.records.length, 7);
  assert.equal(d.controls, 3);
  assert.deepEqual(d.groups, ["CON", "LPS"]);
  assert.deepEqual(d.targets, ["GAPDH", "IL6"]);
  const p = qpcrPayload(d, normalizeQpcrOptions({ referenceGenes: ["GAPDH"], controlMaxCq: "35", controlMinDelta: 4 })) as any;
  assert.equal(p.options.control_min_delta, 4);
  assert.equal(p.options.control_max_cq, 35);
  assert.equal(p.data.records.length, 7);           // the engine checks the control wells
  const any = qpcrPayload(d, normalizeQpcrOptions({ referenceGenes: ["GAPDH"] })) as any;
  assert.equal("control_max_cq" in any.options, false);     // blank: any Cq counts
  assert.equal(any.options.control_min_delta, 5);
  // a plate without controls sends no control options
  const none = qpcrPayload(readQpcr(plate([]), DEFAULT_QPCR_OPTIONS), normalizeQpcrOptions({ referenceGenes: ["GAPDH"] })) as any;
  assert.equal("control_min_delta" in none.options, false);
  assert.equal(normalizeQpcrOptions({ controlMinDelta: -2 }).controlMinDelta, 5);
});

test("chip words", () => {
  assert.equal(controlChip({ kind: "ntc", control: "NTC", target: "GAPDH", cq: 34 }), "NTC amplified for GAPDH (Cq 34)");
  assert.equal(controlChip({ kind: "ntc", control: "NTC 2", target: "IL6", cq: 36.25 }),
    "NTC “NTC 2” amplified for IL6 (Cq 36.25)");
  assert.equal(controlChip({ kind: "no_rt", control: "CON-1 no-RT", target: "GAPDH", cq: 21 }),
    "No-RT control “CON-1 no-RT” amplified for GAPDH (Cq 21)");
});
