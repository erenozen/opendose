// Unit tests for the pure project model. Run: npm run test:unit
// (node --test with native TypeScript type stripping; no extra deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { commit, initHistory, redo, undo, HISTORY_LIMIT } from "../history.ts";
import { sequentialIds } from "../ids.ts";
import {
  addSheets, deleteSheet, duplicateFamily, duplicateSheet, familyChildren,
  findSheet, makeDataSheet, makeGraphSheet, makeInfoSheet, makeLayoutSheet,
  makeProject, makeResultsSheet, moveSheet, renameSheet, setFrozen, sortSection,
  updateTable,
} from "../ops.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import {
  addDataset, deleteRow, emptyTable, insertRows, isExcluded, normalizeTable,
  numericData, pasteBlock, setCell, setSubcolumnCount, toggleExcluded, clearValues,
} from "../table.ts";
import type { DataSheet, GraphSheet, Project, ResultsSheet } from "../types.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const settings = { titles: { x: "", y: "" }, scheme: "default" as const };

function sample(): Project {
  const t = emptyTable("xy", { datasets: 1, subcolumns: 2, rows: 3 });
  return makeProject(prefs, [
    makeDataSheet("d1", "October data", t),
    makeInfoSheet("i1"),
    makeResultsSheet("r1", "d1", "nonlin", { model: "x" }, "Nonlin fit of October data"),
    makeGraphSheet("g1", "d1", "r1", "xy", settings, "Graph of October data"),
    makeDataSheet("d2", "Other", emptyTable("column")),
    makeLayoutSheet("l1"),
  ]);
}

test("emptyTable builds rectangular grids for all eight types", () => {
  for (const type of ["xy", "column", "grouped", "contingency", "survival",
    "partsofwhole", "multivariable", "nested"] as const) {
    const t = emptyTable(type);
    assert.equal(t.type, type);
    for (const d of t.datasets) {
      assert.equal(d.rows.length, t.x.length);
      assert.equal(t.rowTitles.length, t.x.length);
    }
  }
  assert.equal(emptyTable("survival").datasets[0].rows[0].length, 2);
  assert.equal(emptyTable("multivariable").datasets[0].varType, "continuous");
  const summary = emptyTable("xy", { subcolumnFormat: "mean_sd_n" });
  assert.deepEqual(summary.datasets[0].subTitles, ["Mean", "SD", "N"]);
});

test("cell edits, paste and row ops keep invariants", () => {
  let t = emptyTable("xy", { datasets: 2, subcolumns: 2, rows: 2 });
  t = setCell(t, 1, 0, 1, "5");
  assert.equal(t.datasets[1].rows[0][1], "5");
  // flat columns: X, A:Y1, A:Y2, B:Y1, B:Y2
  t = pasteBlock(t, 1, 0, [["1", "2", "3"], ["4", "5", "6"]]);
  assert.equal(t.x.length, 3);
  assert.deepEqual(t.x, ["", "1", "4"]);
  assert.deepEqual(t.datasets[0].rows[2], ["5", "6"]);
  t = insertRows(t, 0, 1);
  assert.equal(t.x.length, 4);
  assert.equal(t.datasets[0].rows[3][0], "5");
  t = deleteRow(t, 0);
  assert.deepEqual(t.x, ["", "1", "4"]);
  t = addDataset(t);
  assert.equal(t.datasets.length, 3);
  assert.equal(t.datasets[2].rows.length, 3);
  t = setSubcolumnCount(t, 0, 3);
  assert.equal(t.datasets[0].rows[0].length, 3);
});

test("excluded cells survive row edits and read as null", () => {
  let t = emptyTable("column", { datasets: 1, rows: 3 });
  t = setCell(t, 0, 0, 0, "1");
  t = setCell(t, 0, 1, 0, "2");
  t = setCell(t, 0, 2, 0, "3");
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 2, sub: 0 });
  assert.deepEqual(numericData(t).datasets[0].ys, [[1], [2], [null]]);
  t = deleteRow(t, 0);
  assert.ok(isExcluded(t, { kind: "y", dataset: 0, row: 1, sub: 0 }));
  t = insertRows(t, 0);
  assert.ok(isExcluded(t, { kind: "y", dataset: 0, row: 2, sub: 0 }));
  t = toggleExcluded(t, { kind: "y", dataset: 0, row: 2, sub: 0 });
  assert.equal(numericData(t).datasets[0].ys[2][0], 3);
  assert.equal(clearValues(t).datasets[0].rows[2][0], "");
});

test("normalizeTable repairs ragged input", () => {
  const t = normalizeTable({ type: "xy", x: ["1"], datasets: [{ name: "A", rows: [["1"], ["2", "3"]] }] });
  assert.equal(t.x.length, 2);
  assert.deepEqual(t.datasets[0].rows, [["1", ""], ["2", "3"]]);
});

test("history: commit, coalesce, undo, redo, bound", () => {
  const p0 = sample();
  let h = initHistory(p0);
  const p1 = renameSheet(p0, "d1", "A");
  h = commit(h, p1, "k", 1000);
  const p2 = renameSheet(p1, "d1", "AB");
  h = commit(h, p2, "k", 1500);           // coalesced
  assert.equal(h.past.length, 1);
  h = commit(h, renameSheet(p2, "d1", "ABC"), "k", 5000); // window passed
  assert.equal(h.past.length, 2);
  h = undo(h);
  assert.equal(findSheet(h.present, "d1")?.name, "AB");
  h = undo(h);
  assert.equal(findSheet(h.present, "d1")?.name, "October data");
  h = redo(h);
  assert.equal(findSheet(h.present, "d1")?.name, "AB");
  // a new edit clears the redo stack
  h = commit(h, renameSheet(h.present, "d1", "Z"), null, 9000);
  assert.equal(h.future.length, 0);
  let big = initHistory(p0);
  for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
    big = commit(big, renameSheet(big.present, "d1", `n${i}`), null, i * 10000);
  }
  assert.equal(big.past.length, HISTORY_LIMIT);
});

test("deleting a data table removes its family and unlinks the rest", () => {
  let p = sample();
  p = { ...p, sheets: p.sheets.map((s) => (s.kind === "layout" ? { ...s, graphIds: ["g1"] } : s)) };
  p = deleteSheet(p, "d1");
  assert.deepEqual(p.sheets.map((s) => s.id), ["i1", "d2", "l1"]);
  assert.deepEqual((findSheet(p, "l1") as { graphIds: string[] }).graphIds, []);
  // deleting a results sheet unbinds the graph
  const q = deleteSheet(sample(), "r1");
  assert.equal((findSheet(q, "g1") as GraphSheet).resultsId, null);
});

test("duplicate family substitutes names and remaps links", () => {
  let p = sample();
  p = updateTable(p, "d1", (t) => setCell(t, 0, 0, 0, "42"));
  const ids = sequentialIds("n");
  const q = duplicateFamily(p, "g1", { name: "November data", withData: false }, ids);
  const data = q.sheets.find((s) => s.name === "November data") as DataSheet;
  assert.ok(data);
  assert.equal(data.table.datasets[0].rows[0][0], "");
  const kids = familyChildren(q, data.id);
  assert.deepEqual(kids.map((k) => k.name).sort(),
    ["Graph of November data", "Nonlin fit of November data"]);
  const g = kids.find((k) => k.kind === "graph") as GraphSheet;
  const r = kids.find((k) => k.kind === "results") as ResultsSheet;
  assert.equal(g.resultsId, r.id);
  // with data keeps values; original untouched
  const w = duplicateFamily(p, "d1", { name: "Copy", withData: true }, sequentialIds("w"));
  const wd = w.sheets.find((s) => s.name === "Copy") as DataSheet;
  assert.equal(wd.table.datasets[0].rows[0][0], "42");
  assert.equal(familyChildren(w, "d1").length, 2);
});

test("duplicate sheet, move, freeze", () => {
  let p = duplicateSheet(sample(), "d1", sequentialIds("c"));
  const copy = p.sheets.find((s) => s.id === "c1")!;
  assert.equal(copy.name, "October data copy");
  assert.equal(familyChildren(p, "c1").length, 0);
  // data sheets reorder among data sheets
  const before = p.sheets.filter((s) => s.kind === "data").map((s) => s.id);
  p = moveSheet(p, "d2", -1);
  const after = p.sheets.filter((s) => s.kind === "data").map((s) => s.id);
  assert.notDeepEqual(before, after);
  assert.equal(after.indexOf("d2"), before.indexOf("d2") - 1);
  // frozen data refuses edits
  p = setFrozen(p, "d1", true);
  const same = updateTable(p, "d1", (t) => setCell(t, 0, 0, 0, "9"));
  assert.equal(same, p);
  p = setFrozen(p, "r1", true, { cached: { ok: 1 } });
  assert.deepEqual((findSheet(p, "r1") as ResultsSheet).cached, { ok: 1 });
});

test("v2 save/load round trip", () => {
  const p = addSheets(sample(), []);
  const text = serializeProject(p, new Map([["r1", { analysis: "x" }]]));
  const q = parseProjectFile(text, { prefs, ids: sequentialIds() });
  assert.equal(q.sheets.length, p.sheets.length);
  assert.deepEqual((findSheet(q, "r1") as ResultsSheet).cached, { analysis: "x" });
  assert.deepEqual((findSheet(q, "d1") as DataSheet).table, (findSheet(p, "d1") as DataSheet).table);
});

test("v1 files migrate into one family", () => {
  const v1 = {
    opendose_project: 1, mode: "xy", x: ["1", "2"],
    datasets: [{ name: "Drug A", rows: [["1", "2"], ["3", "4"]] }],
    options: { model: "michaelis_menten" }, columnOptions: { graphType: "box" },
    xUnit: "µM", scheme: "colorblind", titles: { xy: { x: "Dose", y: "" } },
  };
  const p = parseProjectFile(JSON.stringify(v1), { prefs, ids: sequentialIds() });
  assert.deepEqual(p.sheets.map((s) => s.kind), ["data", "results", "graph"]);
  const d = p.sheets[0] as DataSheet;
  assert.equal(d.table.type, "xy");
  assert.equal(d.table.xUnit, "µM");
  assert.equal(d.table.datasets[0].name, "Drug A");
  const r = p.sheets[1] as ResultsSheet;
  assert.equal((r.options as { model: string }).model, "michaelis_menten");
  assert.equal((r.options as { errorBars: string }).errorBars, "sd");
  const g = p.sheets[2] as GraphSheet;
  assert.equal(g.settings.titles.x, "Dose");
  assert.equal(g.settings.scheme, "colorblind");
  assert.equal(g.resultsId, r.id);

  const col = parseProjectFile(JSON.stringify({ ...v1, mode: "column" }),
    { prefs, ids: sequentialIds() });
  assert.equal((col.sheets[0] as DataSheet).table.type, "column");
  assert.equal((col.sheets[2] as GraphSheet).graphType, "box");
  const surv = parseProjectFile(JSON.stringify({ ...v1, mode: "survival" }),
    { prefs, ids: sequentialIds() });
  assert.equal((surv.sheets[0] as DataSheet).table.type, "survival");
  assert.throws(() => parseProjectFile("{}", { prefs, ids: sequentialIds() }));
});

test("sort a section by name, naturally", () => {
  let p = sample();
  p = addSheets(p, [makeDataSheet("d10", "Data 10", emptyTable("xy")),
    makeDataSheet("d9", "Data 9", emptyTable("xy"))]);
  const q = sortSection(p, "data");
  assert.deepEqual(q.sheets.filter((s) => s.kind === "data").map((s) => s.name),
    ["Data 9", "Data 10", "October data", "Other"]);
  // other kinds keep their slots
  assert.deepEqual(q.sheets.map((s) => s.kind), p.sheets.map((s) => s.kind));
});
