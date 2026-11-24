// Source data per figure (P-65): a panel's sheet holds what its traces
// plot, in data units (a log2 axis is undone), with each group's centre,
// error bars and n, the curve, and a sheet per panel letter.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { applyFormat, tagTrace, type Trace } from "../../graph/apply.ts";
import { panelRows, screenNotes, sourceDataWorkbook, type PanelInput } from "../sourceData.ts";

const sd = (v: number[]) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};

// A column scatter, mean ± SD, as components/ColumnPlot.tsx tags it: the
// points spread sideways around x = i, the mean mark with its SD.
const CONTROL = [1, 2, 3, 4];
const DRUG = [2, 4, 6];
function columnTraces(): Trace[] {
  return [CONTROL, DRUG].flatMap((values, i) => [
    tagTrace({ x: values.map((_, j) => i + 0.1 * (j - 1)), y: values, mode: "markers", name: ["Control", "Drug"][i] },
      { ds: i, role: "points", rows: values.map((_, j) => j), keys: values.map((_, j) => `${j}:0`) }),
    tagTrace({ x: [i], y: [values.reduce((a, b) => a + b, 0) / values.length], mode: "markers",
      error_y: { type: "data", array: [sd(values)], visible: true } }, { ds: i, role: "summary" }),
  ]);
}

function panel(over: Partial<PanelInput>): PanelInput {
  return {
    letter: "a", graph: "Graph of Viability", data: "Viability",
    legend: "Mean ± SD, with individual values. n = 4 (Control), 3 (Drug).",
    test: "Unpaired t test (results sheet “t test of Viability”)",
    datasets: ["Control", "Drug"], rowTitles: ["M1", "M2", "", ""], categorical: true,
    xTicks: { vals: [0, 1], text: ["Control", "Drug"] },
    errors: { centre: "Mean", error: "SD" }, groupN: { Control: 4, Drug: 3 },
    traces: columnTraces(), ...over,
  };
}

const sectionOf = (rows: unknown[][], title: string) => {
  const i = rows.findIndex((r) => r.length === 1 && r[0] === title);
  assert.ok(i >= 0, title);
  const end = rows.findIndex((r, k) => k > i + 1 && r.length === 0);
  return { header: rows[i + 1], body: rows.slice(i + 2, end < 0 ? undefined : end) };
};

test("column scatter: every point, each group's mean, SD and n, by category", () => {
  const { rows, bold } = panelRows(panel({}));
  assert.deepEqual(rows[0], ["Panel a: “Graph of Viability”"]);
  assert.ok(bold.includes(0));
  assert.deepEqual(rows.find((r) => r[0] === "Test"), ["Test", "Unpaired t test (results sheet “t test of Viability”)"]);
  assert.deepEqual(rows.find((r) => r[0] === "Centre and error bars"), ["Centre and error bars", "Mean with SD"]);
  const s = sectionOf(rows, "Centre and error bars of each group");
  assert.deepEqual(s.header, ["Data set", "Category", "Mean", "SD below", "SD above", "n"]);
  assert.deepEqual(s.body, [["Control", "Control", 2.5, sd(CONTROL), sd(CONTROL), 4], ["Drug", "Drug", 4, 2, 2, 3]]);
  assert.equal(sd(CONTROL), 1.2909944487358056); // numpy.std([1, 2, 3, 4], ddof=1)
  const p = sectionOf(rows, "Plotted values");
  assert.deepEqual(p.header, ["Data set", "Mark", "Row", "Category", "Y", "SD below", "SD above"]);
  assert.deepEqual(p.body.map((r) => r[4]), [...CONTROL, ...DRUG]);
  assert.deepEqual(p.body.map((r) => r[2]), ["M1", "M2", 3, 4, "M1", "M2", 3]);
  assert.ok(p.body.every((r) => r[3] === r[0])); // the group's name, not the spread position
});

test("plotting order and hidden groups follow the formatted graph", () => {
  const ctx = { dark: false, scheme: "default" as const, datasets: ["Control", "Drug"], categorical: true };
  const out = applyFormat(columnTraces(), { xaxis: { tickvals: [0, 1], ticktext: ["Control", "Drug"] } },
    { order: [1, 0] }, ctx);
  const ticks = { vals: out.layout.xaxis.tickvals, text: out.layout.xaxis.ticktext };
  const s = sectionOf(panelRows(panel({ traces: out.traces, xTicks: ticks })).rows, "Centre and error bars of each group");
  assert.deepEqual(s.body.map((r) => [r[0], r[1]]), [["Drug", "Drug"], ["Control", "Control"]]);
  const hidden = applyFormat(columnTraces(), {}, { datasets: { 1: { show: false } } }, ctx);
  const h = sectionOf(panelRows(panel({ traces: hidden.traces })).rows, "Plotted values");
  assert.deepEqual(h.body.map((r) => r[0]), ["Control", "Control", "Control", "Control"]);
});

test("a log2 axis: the sheet holds data values, not log2 of them", () => {
  const t = [tagTrace({ x: [1, 2], y: [8, 0.5], mode: "markers", error_y: { type: "data", array: [8, 0.25], visible: true } },
    { ds: 0, role: "points", rows: [0, 1] }),
  tagTrace({ x: [1, 1.5, 2], y: [8, 2, 0.5], mode: "lines" }, { ds: 0, role: "fit" })];
  const out = applyFormat(t, { yaxis: {} }, { y: { scale: "log2" } },
    { dark: false, scheme: "default", datasets: ["Drug A"] });
  assert.deepEqual(out.traces[0].y, [3, -1]); // drawn in log2 units
  const { rows } = panelRows(panel({ traces: out.traces, categorical: false, xTicks: undefined,
    datasets: ["Drug A"], errors: null, xTitle: "log[Conc.], M", yTitle: "Response" }));
  const p = sectionOf(rows, "Plotted values");
  assert.deepEqual(p.header, ["Data set", "Mark", "Row", "X: log[Conc.], M", "Y: Response", "Error below", "Error above"]);
  assert.deepEqual(p.body, [["Drug A", "Value", "M1", 1, 8, 8, 8], ["Drug A", "Value", "M2", 2, 0.5, 0.25, 0.25]]);
  const c = sectionOf(rows, "Drawn curve");
  assert.deepEqual(c.body, [["Drug A", "Curve", 1, 8], ["Drug A", "Curve", 1.5, 2], ["Drug A", "Curve", 2, 0.5]]);
});

test("boxes from given quartiles: every value and the five numbers; WebGL and outlier notes", () => {
  const box = tagTrace({ type: "box", x: [0], y: [[1, 2, 3, 4, 50]], q1: [2], median: [3], q3: [4],
    lowerfence: [1], upperfence: [4], boxpoints: "outliers" }, { ds: 0, role: "box", rows: [0, 1, 2, 3, 4] });
  const { rows } = panelRows(panel({ traces: [box], datasets: ["Control"] }));
  assert.deepEqual(sectionOf(rows, "Boxes").body, [["Control", 1, 2, 3, 4, 4, 5]]);
  assert.deepEqual(sectionOf(rows, "Plotted values").body.map((r) => r[4]), [1, 2, 3, 4, 50]);
  assert.match(String(rows.find((r) => r[0] === "Note")?.[1]), /only their outliers; every value is in this sheet/);
  assert.match(screenNotes([{ type: "scattergl", y: [1] }])[0], /WebGL/);
});

test("traces it cannot list are named, not dropped silently; decorations are left out", () => {
  const { rows, skipped } = panelRows(panel({ traces: [
    ...columnTraces(), { type: "contour", z: [[1]] }, tagTrace({ x: [0, 1], y: [5, 5] }, { ds: -1, role: "decor" }),
  ] }));
  assert.deepEqual(skipped, ["a contour trace"]);
  assert.match(String(rows[rows.length - 1][1]), /also draws a contour trace/);
});

test("the workbook: README, then a sheet per panel letter", () => {
  const wb = sourceDataWorkbook({ layout: "Figure 2", app: "OpenDose test", date: "2026-11-24T10:00:00.000Z",
    panels: [panel({}), panel({ letter: "b", graph: "Graph of Dose response" })],
    without: [{ letter: "c", why: "a picture of “Old graph”, unlinked from its data" }] });
  const z = unzipSync(wb.bytes);
  const names = [...strFromU8(z["xl/workbook.xml"]).matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["README", "a", "b"]);
  assert.deepEqual(wb.sheets, ["a", "b"]);
  assert.equal(wb.overNature, false);
  assert.match(strFromU8(z["xl/sharedStrings.xml"]), /No source data: a picture of “Old graph”, unlinked from its data\./);
});
