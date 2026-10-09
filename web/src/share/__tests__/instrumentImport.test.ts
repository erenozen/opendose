// Instrument recipes (Incucyte, LabChart, multi-read plate runs) on small
// synthetic exports laid out like the real ones (see each recipe file's
// header), and the plate-map grouping they share.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { elapsedHours, incucyteRecipe, parseIncucyte, wellId } from "../recipes/incucyte.ts";
import {
  intervalSeconds, labchartRecipe, parseLabChart, thinRows, timeSeconds,
} from "../recipes/labchart.ts";
import { applyPlateMap, findReads, multiReadRecipe, readValue, wellGroup } from "../recipes/multiRead.ts";
import { initialConfig, runPipeline } from "../recipes/pipeline.ts";
import { findPlateGrid } from "../recipes/plate.ts";
import { detectRecipe, parseSource } from "../recipes/presets.ts";
import type { DataTableModel } from "../../project/types.ts";

const run = (text: string, params?: Record<string, string>) => {
  const m = parseSource(text);
  const recipe = detectRecipe(m);
  const staged = recipe.stage(m, params);
  const cfg = { ...initialConfig(staged), params };
  const out = runPipeline(staged.staging, cfg, { wellColumn: staged.wells?.column, yTitle: staged.yTitle });
  return { recipe, staged, out, table: out.result?.table as DataTableModel };
};

// ------------------------------------------------------------ Incucyte

const INCUCYTE = [
  "Vessel Name: 2024-03-01 HeLa scratch",
  "Metric: Phase Object Confluence (Percent)",
  "Cell Type: HeLa",
  "Analysis: phase mask",
  "",
  "Date Time\tElapsed\tB2\tB3\tC2\tC2 (Std Err Image)",
  "01/03/2024 10:00:00\t0\t5.1\t4.8\t6.0\t0.2",
  "01/03/2024 12:00:00\t2\t7.9\t7.2\t9.5\t0.3",
  "01/03/2024 14:00:00\t4\t12.4\t11.8\t15.1\t0.4",
].join("\n");

test("Incucyte: detected, X = elapsed hours, one data set per well, std err left out", () => {
  const { recipe, staged, out, table } = run(INCUCYTE);
  assert.equal(recipe.id, "incucyte");
  assert.equal(out.error, "");
  assert.equal(table.type, "xy");
  assert.deepEqual(table.x, ["0", "2", "4"]);
  assert.equal(table.xTitle, "Elapsed (h)");
  assert.equal(table.yTitle, "Phase Object Confluence (Percent)");
  assert.deepEqual(table.datasets.map((d) => d.name), ["B2", "B3", "C2"]);
  assert.equal(table.datasets[2].rows[1][0], "9.5");
  assert.equal(staged.name, "Phase Object Confluence");
  assert.ok(staged.notes.some((n) => /1 standard-error column/.test(n)));
  assert.deepEqual(staged.wells, { column: 4, format: 96 });
});

test("Incucyte: columns sharing a group label become replicates; d/h/m elapsed times", () => {
  const text = [
    "Metric: Confluence (Percent)",
    "Date Time\tElapsed\tControl\tControl\tDrug\tDrug\tDrug (Std Err Well)",
    "x\t0d00h00m\t1\t2\t3\t4\t0.1",
    "x\t0d02h30m\t5\t6\t7\t8\t0.1",
  ].join("\n");
  const { table } = run(text);
  assert.deepEqual(table.x, ["0", "2.5"]);
  assert.deepEqual(table.datasets.map((d) => d.name), ["Control", "Drug"]);
  assert.deepEqual(table.datasets[1].rows, [["3", "4"], ["7", "8"]]);
  assert.deepEqual(table.datasets[0].subTitles, ["Control 1", "Control 2"]);
});

test("Incucyte helpers: wells and elapsed formats", () => {
  assert.equal(wellId("b02"), "B2");
  assert.equal(wellId("Q1"), null);
  assert.equal(elapsedHours("1d02h30m"), 26.5);
  assert.equal(elapsedHours("2:30"), 2.5);
  assert.equal(elapsedHours("12"), 12);
  assert.equal(elapsedHours("soon"), null);
  const per = parseIncucyte(parseSource("Date Time\tElapsed\tB2, Image 1\tB2, Image 2\nx\t0\t1\t2\n"));
  assert.deepEqual(per?.series.map((s) => s.group), ["B2", "B2"]);
  assert.equal(incucyteRecipe.detect(parseSource("Time\tA1\n0\t1\n")), 0);
});

test("Incucyte: a plate map groups the wells, wells become replicates", () => {
  const m = parseSource(INCUCYTE);
  const staged = incucyteRecipe.stage(m);
  const cfg = { ...initialConfig(staged),
    plateMap: { B2: { role: "negative" as const }, B3: { role: "negative" as const },
      C2: { role: "sample" as const, compound: "Drug", conc: 10 } } };
  const out = runPipeline(staged.staging, cfg, { wellColumn: staged.wells!.column });
  const t = out.result!.table;
  assert.deepEqual(t.datasets.map((d) => d.name), ["Vehicle", "Drug 10"]);
  assert.deepEqual(t.datasets[0].rows[0], ["5.1", "4.8"]);
  assert.deepEqual(t.datasets[0].subTitles, ["B2", "B3"]);
});

// ------------------------------------------------------------ LabChart

const LABCHART = [
  "Interval=\t0.5 s",
  "ExcelDateTime=\t4.5352e+04\t01/03/2024 10:00:00.000",
  "TimeFormat=\tStartOfBlock",
  "DateFormat=\t",
  "ChannelTitle=\tPressure\tFlow",
  "Range=\t10.000 V\t10.000 V",
  "UnitName=\tmmHg\tml/min",
  "0\t98.1\t1.20",
  "0.5\t98.3\t1.21",
  "1\t99.0\t1.25\t#* Drug added",
  "1.5\t99.4\t1.30",
  "2\t99.9\t1.32",
].join("\n");

test("LabChart: detected, channels with units as data sets, comments noted", () => {
  const { recipe, staged, out, table } = run(LABCHART);
  assert.equal(recipe.id, "labchart");
  assert.equal(out.error, "");
  assert.equal(table.type, "xy");
  assert.deepEqual(table.x, ["0", "0.5", "1", "1.5", "2"]);
  assert.equal(table.xTitle, "Time (s)");
  assert.deepEqual(table.datasets.map((d) => d.name), ["Pressure (mmHg)", "Flow (ml/min)"]);
  assert.equal(table.datasets[0].rows[2][0], "99");
  assert.ok(staged.notes.some((n) => n.includes("1 s: Drug added")), staged.notes.join(" | "));
});

test("LabChart: time unit, every k-th sample and a window", () => {
  const { table, staged } = run(LABCHART, { unit: "ms", every: "2", from: "0.5", to: "2" });
  assert.equal(table.xTitle, "Time (ms)");
  // samples inside [0.5, 2] s: 0.5, 1, 1.5, 2; every 2nd from the first
  assert.deepEqual(table.x, ["500", "1500"]);
  assert.ok(staged.notes[0].includes("every 2nd sample"), staged.notes[0]);
});

test("LabChart: no time column (sample × interval) and a second block", () => {
  const text = [
    "Interval=\t0.01 s", "ChannelTitle=\tECG", "UnitName=\tmV",
    "0.10", "0.20", "0.30",
    "Interval=\t0.01 s", "ChannelTitle=\tECG", "UnitName=\tmV",
    "0.40", "0.50",
  ].join("\n");
  const blocks = parseLabChart(parseSource(text))!;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].time, [0, 0.01, 0.02]);
  const second = labchartRecipe.stage(parseSource(text), { block: "2" });
  assert.equal(second.staging.rows.length, 2);
  assert.equal(second.name, "LabChart block 2");
});

test("LabChart helpers", () => {
  assert.equal(intervalSeconds("0.001 s"), 0.001);
  assert.equal(intervalSeconds("2 ms"), 0.002);
  assert.equal(intervalSeconds("1000 Hz"), 0.001);
  assert.equal(timeSeconds("01:00:01.5"), 3601.5);
  const many = Array.from({ length: 10001 }, (_, i) => i);
  // auto: the smallest step leaving at most 2000 rows
  assert.deepEqual([thinRows(many, null, null, 0).step, thinRows(many, null, null, 0).idx.length], [6, 1667]);
  const capped = thinRows(Array.from({ length: 50000 }, (_, i) => i), null, null, 1);
  assert.ok(capped.capped && capped.idx.length <= 20000);
});

// ------------------------------------------------------------ multi-read plates

const plateBlock = (label: string, f: (r: number, c: number) => number) => [
  label,
  "\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12",
  ..."ABCDEFGH".split("").map((row, r) =>
    [row, ...Array.from({ length: 12 }, (_, c) => f(r, c).toFixed(3))].join("\t")),
  "",
].join("\n");

const TWO_WAVELENGTHS = ["Plate: run 1", "", plateBlock("Read 1:450", (r, c) => 0.1 + r * 0.01 + c * 0.001),
  plateBlock("Read 2:620", (r) => 0.05 + r * 0.001)].join("\n");

test("Multi-read: two wavelengths become two rows, wells the data sets", () => {
  const { recipe, out, table, staged } = run(TWO_WAVELENGTHS);
  assert.equal(recipe.id, "multiread");
  assert.equal(out.error, "");
  assert.equal(table.type, "grouped");
  assert.deepEqual(table.rowTitles, ["Read 1:450", "Read 2:620"]);
  assert.equal(table.datasets.length, 96);
  assert.equal(table.datasets[0].name, "A1");
  const b3 = table.datasets.find((d) => d.name === "B3")!;
  assert.equal(b3.rows[0][0], "0.112");
  assert.equal(b3.rows[1][0], "0.051");
  assert.ok(staged.notes[0].startsWith("2 reads of a 96-well plate"), staged.notes[0]);
});

test("Multi-read: kinetic reads named by time become X (minutes)", () => {
  const text = [plateBlock("Time 0:00:00", () => 0.1), plateBlock("Time 0:05:00", () => 0.2),
    plateBlock("Time 0:10:00", (r, c) => (r === 0 && c === 0 ? 0.35 : 0.3))].join("\n");
  const { table } = run(text);
  assert.equal(table.type, "xy");
  assert.deepEqual(table.x, ["0", "5", "10"]);
  assert.equal(table.xTitle, "Time (min)");
  assert.equal(table.datasets[0].rows[2][0], "0.35");
  // forced to rows
  const rows = run(text, { reads: "rows" }).table;
  assert.equal(rows.type, "grouped");
  assert.deepEqual(rows.rowTitles, ["Time 0:00:00", "Time 0:05:00", "Time 0:10:00"]);
});

test("Multi-read: each grid reads as findPlateGrid reads it alone (shared plate rule)", () => {
  const reads = findReads(parseSource(TWO_WAVELENGTHS));
  assert.equal(reads.length, 2);
  const alone = findPlateGrid(parseSource(plateBlock("Read 2:620", (r) => 0.05 + r * 0.001)))!;
  assert.deepEqual(reads[1].grid.values, alone.values);
  assert.deepEqual(reads[1].grid.warnings, alone.warnings);
  // bare grids (no row letters) stacked under labels
  const bare = (label: string, v: number) => [label,
    ...Array.from({ length: 8 }, () => Array(12).fill(v.toFixed(2)).join("\t")), ""].join("\n");
  const two = findReads(parseSource([bare("Wavelength: 450 nm", 1), bare("Wavelength: 620 nm", 2)].join("\n")));
  assert.deepEqual(two.map((r) => r.label), ["Wavelength: 450 nm", "Wavelength: 620 nm"]);
  assert.deepEqual(two.map((r) => r.grid.values[7][11]), [1, 2]);
  // a single plate is not a multi-read run
  assert.equal(multiReadRecipe.detect(parseSource(plateBlock("Read 1:450", () => 1))), 0);
});

test("Read labels: times, wavelengths, numbers", () => {
  assert.deepEqual(readValue("Time 0:05:00"), { x: 5, kind: "time" });
  assert.deepEqual(readValue("Cycle 2 (300 s)"), { x: 5, kind: "time" });
  assert.deepEqual(readValue("Read 1:450"), { x: 450, kind: "wavelength" });
  assert.deepEqual(readValue("Abs 620 nm"), { x: 620, kind: "wavelength" });
  assert.deepEqual(readValue("Cycle Nr. 3"), { x: 3, kind: "number" });
  assert.equal(readValue("Fluorescence"), null);
});

test("Plate map: wells grouped by what they hold, empty wells dropped", () => {
  assert.equal(wellGroup({ role: "sample", compound: "Drug", conc: 0.5 }), "Drug .5");
  assert.equal(wellGroup({ role: "blank" }), "Blank");
  assert.equal(wellGroup(undefined), "");
  const { staged } = run(TWO_WAVELENGTHS);
  const grouped = applyPlateMap(staged.staging, 2, { A1: { role: "blank" }, A2: { role: "blank" } });
  assert.equal(grouped.rows.length, 4);
  assert.deepEqual([...new Set(grouped.rows.map((r) => r[3]))], ["Blank"]);
  assert.equal(applyPlateMap(staged.staging, 2, {}), staged.staging);
});
