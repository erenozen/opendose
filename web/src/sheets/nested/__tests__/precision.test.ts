// The nested table's precision payload (P-94) and the standard curve's
// precision samples. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import {
  DEFAULT_NESTED_PRECISION, nestedPrecisionPayload, normalizeNestedPrecision, precisionLayout,
  runNestedPrecision,
} from "../precision.ts";
import { precisionSamples } from "../../assays/stdcurve/precision.ts";
import type { StdRow } from "../../assays/stdcurve/model.ts";

// Day 1: Run 1 (24.1, 26.7), Run 2 (24.9, 25.1); Day 2: Run 1 (27.5, blank), Run 2 (26.0, 25.0)
const ep = () => normalizeTable({
  type: "nested", x: ["", ""], yTitle: "mg/dL",
  datasets: [
    { name: "Day 1", subTitles: ["Run 1", "Run 2"], rows: [["24.1", "24.9"], ["26.7", "25.1"]] },
    { name: "Day 2", subTitles: ["Run 1", "Run 2"], rows: [["27.5", "26.0"], ["", "25.0"]] },
  ],
});

test("columns are days and subcolumns runs; blanks left out", () => {
  assert.equal(precisionLayout(ep()), "days");
  const p = nestedPrecisionPayload(ep(), DEFAULT_NESTED_PRECISION).payload as any;
  assert.equal(p.analysis, "precision_study");
  const s = p.data.samples[0];
  assert.equal(s.name, "mg/dL");
  assert.deepEqual(s.values, [24.1, 26.7, 24.9, 25.1, 27.5, 26, 25]);
  assert.deepEqual(s.runs, ["Run 1", "Run 1", "Run 2", "Run 2", "Run 1", "Run 2", "Run 2"]);
  assert.deepEqual(s.days, ["Day 1", "Day 1", "Day 1", "Day 1", "Day 2", "Day 2", "Day 2"]);
  assert.equal("nominal" in s, false);
  assert.deepEqual(p.options, { recovery_limit: 15, cv_limit: 15, ci_level: 0.95 });
});

test("one subcolumn per column: the columns are the runs", () => {
  const t = normalizeTable({ type: "nested", x: ["", ""], datasets: [
    { name: "Run A", rows: [["1"], ["2"]] }, { name: "Run B", rows: [["3"], ["4"]] }] });
  assert.equal(precisionLayout(t), "runs");
  const s = (nestedPrecisionPayload(t, DEFAULT_NESTED_PRECISION).payload as any).data.samples[0];
  assert.deepEqual(s.runs, ["Run A", "Run A", "Run B", "Run B"]);
  assert.equal("days" in s, false);
  assert.equal(s.name, "All values");
});

test("nominal and limits; problems said", () => {
  const o = normalizeNestedPrecision({ nominal: "25", recoveryLimit: 20, cvLimit: -3 });
  assert.equal(o.cvLimit, 15);
  const s = (nestedPrecisionPayload(ep(), o).payload as any);
  assert.equal(s.data.samples[0].nominal, 25);
  assert.equal(s.options.recovery_limit, 20);
  assert.match(nestedPrecisionPayload(ep(), { ...o, nominal: "abc" }).error ?? "", /nominal concentration/);
  const empty = normalizeTable({ type: "nested", x: [""], datasets: [{ name: "A", rows: [[""]] }] });
  assert.match(nestedPrecisionPayload(empty, o).error ?? "", /^Enter replicate values/);
  const r = runNestedPrecision({ analyze: () => ({ analysis: "precision_study", samples: [] }) }, ep(), o);
  assert.equal(r.layout, "days");
});

test("standard curve: a sample on two plates is a precision sample with its nominal and day", () => {
  const row = (name: string, plate: string, day: string, conc: number | null): StdRow =>
    ({ kind: "unknown", name, group: "", conc, dilution: 1, plate, day, signals: [1, 1], row: 0 });
  const rows = [row("QC mid", "1", "D1", 150), row("S1", "1", "D1", null),
    row("QC mid", "2", "D2", 150), row("Once", "2", "D2", null)];
  const plates = [
    { plate: "1", res: { unknowns: [
      { name: "QC mid", status: "ok", corrected_replicates: [148, 152] },
      { name: "S1", status: "ok", corrected_replicates: [10, 11] }] } },
    { plate: "2", res: { unknowns: [
      { name: "QC mid", status: ">ULOQ", corrected_replicates: [600, 610] },
      { name: "Once", status: "ok", corrected_replicates: [5, 6] }] } },
  ];
  const { samples, notes } = precisionSamples(rows, plates);
  assert.equal(samples.length, 1);
  assert.deepEqual(samples[0], { name: "QC mid", values: [148, 152], runs: ["1", "1"],
    days: ["D1", "D1"], nominal: 150 });
  assert.equal(notes[0], "QC mid: 2 replicates outside the quantification range (or off the curve) "
    + "left out of its precision.");
});
