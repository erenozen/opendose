// Standard-curve module: reading the layout (and XY tables), the engine
// payload and the concentrations table. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../../project/table.ts";
import {
  columnSettings, concentrationTable, DEFAULT_STD_OPTIONS, kindOf, normalizeStdOptions, readRows,
  runStdCurve, stdPayloads,
} from "../model.ts";
import { emptyStdcurve, stdcurveSample } from "../sample.ts";

test("row kinds from the Type column or the concentration", () => {
  assert.equal(kindOf("Standard", 10), "standard");
  assert.equal(kindOf("STD", 0), "blank");
  assert.equal(kindOf("Blank", null), "blank");
  assert.equal(kindOf("QC", null), "unknown");
  assert.equal(kindOf("", 5), "standard");
  assert.equal(kindOf("", null), "unknown");
  assert.equal(kindOf("skip", 5), null);
});

test("the example layout reads as 8 levels, a blank and 12 unknown rows", () => {
  const { rows, problem } = readRows(stdcurveSample(), DEFAULT_STD_OPTIONS);
  assert.equal(problem, null);
  assert.equal(rows.filter((r) => r.kind === "standard").length, 8);
  assert.equal(rows.filter((r) => r.kind === "blank").length, 1);
  const unk = rows.filter((r) => r.kind === "unknown");
  assert.equal(unk.length, 12);
  assert.deepEqual(unk[0], { kind: "unknown", conc: null, plate: "", name: "S1", group: "Control",
    dilution: 2, signals: [0.603, 0.581] });
  assert.match(readRows(emptyStdcurve(), DEFAULT_STD_OPTIONS).problem!, /No standards/);
});

test("payload: levels merged, blank as the zero standard, exclusions and Bottom", () => {
  const { rows } = readRows(stdcurveSample(), DEFAULT_STD_OPTIONS);
  const o = normalizeStdOptions({ excludeLevels: [7.81], bottom: "0" });
  const [{ payload }] = stdPayloads(rows, o) as { payload: any }[];
  assert.equal(payload.analysis, "stdcurve_qc");
  assert.deepEqual(payload.data.standards[0], { concentration: 0, signals: [0.063, 0.058] });
  assert.deepEqual(payload.data.standards[1], { concentration: 7.81, signals: [0.236, 0.202], exclude: true });
  assert.equal(payload.options.blank, "zero_standard");
  assert.deepEqual(payload.options.constraints, { Bottom: 0 });
  const qc = payload.data.unknowns.filter((u: any) => u.name === "QC pool");
  assert.deepEqual(qc.map((u: any) => u.dilution), [2, 4, 8, 16]);
  // no blank rows: signals as read, said so
  const noBlank = stdPayloads(rows.filter((r) => r.kind !== "blank"), DEFAULT_STD_OPTIONS);
  assert.equal((noBlank[0].payload as any).options.blank, null);
  assert.match(noBlank[0].note!, /No blank/);
});

test("one curve per plate", () => {
  const t = stdcurveSample();
  const plate = { name: "Plate", varType: "categorical" as const,
    rows: t.datasets[0].rows.map((_, i) => [i % 2 ? "2" : "1"]) };
  const two = { ...t, datasets: [...t.datasets, plate] };
  const sent: any[] = [];
  const run = runStdCurve((p) => { sent.push(p); return { samples: [], unknowns: [] }; }, two, DEFAULT_STD_OPTIONS);
  assert.deepEqual(run.plates!.map((p) => p.plate), ["1", "2"]);
  assert.equal(sent.length, 2);
});

test("an XY table: X = concentration, rows without X are unknowns", () => {
  const t = normalizeTable({
    type: "xy", x: ["0", "10", "100", "", ""], rowTitles: ["", "", "", "Mouse 1", "Mouse 2"],
    datasets: [{ name: "OD", rows: [["0.05", "0.06"], ["0.5", "0.52"], ["1.5", "1.4"], ["0.9", "0.8"], ["1.1", ""]] },
      { name: "Dilution", rows: [[""], [""], [""], ["5"], [""]] }],
  });
  const { rows } = readRows(t, DEFAULT_STD_OPTIONS);
  assert.deepEqual(rows.map((r) => r.kind), ["blank", "standard", "standard", "unknown", "unknown"]);
  assert.equal(rows[3].name, "Mouse 1");
  assert.equal(rows[3].dilution, 5);
  assert.equal(rows[4].dilution, 1);
});

test("concentrations table: reportable sample means per group", () => {
  const run = {
    plates: [{ plate: "", res: {
      samples: [
        { name: "S1", status: "ok", mean: 95 }, { name: "S2", status: "ok", mean: 124 },
        { name: "S4", status: "ok", mean: 317 }, { name: "S8", status: "<LLOQ", mean: null },
        { name: "QC pool", status: "ok", mean: 668 },
      ],
      unknowns: [],
    } }],
    groups: { S1: "Control", S2: "Control", S4: "Treated", S8: "Control" },
  };
  const t = concentrationTable(run, { ...DEFAULT_STD_OPTIONS, unit: "pg/mL" })!;
  assert.equal(t.type, "column");
  assert.deepEqual(t.datasets.map((d) => d.name), ["Control", "Treated"]);   // QC pool has no group
  assert.deepEqual(t.datasets[0].rows, [["95"], ["124"]]);
  assert.deepEqual(t.datasets[1].rows, [["317"], [""]]);
  assert.equal(t.yTitle, "Concentration (pg/mL)");
  assert.equal((columnSettings({}, t) as any).analysis, "ttest");
});
