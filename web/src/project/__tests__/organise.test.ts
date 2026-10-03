// Unit tests for project organisation: sheet groups, floating notes,
// templates, "analyze and graph like" (wand), consistent graph formats
// and info constants hooked into analyses. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addGroup, deleteGroup, groupMembers, groupsOf, moveGroup, moveSheetBefore,
  moveToGroup, renameGroup, repairGroups, setGroupCollapsed,
} from "../groups.ts";
import { sequentialIds } from "../ids.ts";
import { addNote, allNotes, deleteNote, noteTitle, updateNote } from "../notes.ts";
import {
  addSheets, deleteSheet, duplicateSheet, findSheet, makeDataSheet, makeGraphSheet,
  makeInfoSheet, makeProject, makeResultsSheet,
} from "../ops.ts";
import { constantValue, identifierFor, projectConstants, syncInfoLinks } from "../infoLinks.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { emptyTable, setCell, setX } from "../table.ts";
import {
  applyTemplate, clearYValues, parseTemplateFile, serializeTemplate, templateFromFamily,
  templateFileName, TABLE_TOKEN,
} from "../templates.ts";
import type { GraphSheet, InfoSheet, Project, ResultsSheet } from "../types.ts";
import { consistentTargets, makeGraphsConsistent, wandCopy, wandSources } from "../wand.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const settings = { titles: { x: "", y: "" }, scheme: "default" as const };
const loadCtx = () => ({ prefs, ids: sequentialIds("n") });

function sample(): Project {
  let t = emptyTable("xy", { datasets: 1, subcolumns: 2, rows: 3 });
  t = setX(t, 0, "1");
  t = setCell(t, 0, 0, 0, "5");
  return makeProject(prefs, [
    makeDataSheet("d1", "October", t),
    makeResultsSheet("r1", "d1", "nonlin", { model: "m", xIsLog: true }, "Nonlin fit of October"),
    makeGraphSheet("g1", "d1", "r1", "xy", {
      ...settings, format: { frame: { width: 2 } } as never,
    }, "Graph of October"),
    makeDataSheet("d2", "November", emptyTable("xy")),
    makeDataSheet("d3", "Counts", emptyTable("column")),
    makeResultsSheet("r3", "d3", "column", {}, "Column stats of Counts"),
    makeGraphSheet("g3", "d3", "r3", "bar", settings, "Graph of Counts"),
    makeInfoSheet("i1", "Info 1", "d1"),
  ]);
}

// ------------------------------------------------------------ groups

test("groups: create with members, rename, collapse, delete keeps sheets", () => {
  const ids = sequentialIds("grp");
  let { project: p, groupId } = addGroup(sample(), "data", "Week 1", ids, ["d1", "d2", "r1"]);
  assert.equal(groupId, "grp1");
  assert.deepEqual(groupMembers(p, groupId).map((s) => s.id), ["d1", "d2"],
    "a results sheet cannot join a data-table group");
  p = renameGroup(p, groupId, "  Week one ");
  assert.equal(groupsOf(p, "data")[0].name, "Week one");
  assert.equal(renameGroup(p, groupId, "  "), p, "blank rename is ignored");
  p = setGroupCollapsed(p, groupId, true);
  assert.equal(groupsOf(p)[0].collapsed, true);
  p = setGroupCollapsed(p, groupId, false);
  assert.equal("collapsed" in groupsOf(p)[0], false);
  const before = p.sheets.length;
  p = deleteGroup(p, groupId);
  assert.equal(p.sheets.length, before);
  assert.equal(groupsOf(p).length, 0);
  assert.ok(p.sheets.every((s) => s.groupId === undefined));
});

test("groups: move in and out, refuse other sections, reorder groups", () => {
  const ids = sequentialIds("grp");
  let p = addGroup(sample(), "graph", "Figures", ids).project;
  p = addGroup(p, "graph", "Supplement", ids).project;
  assert.equal(moveToGroup(p, "d1", "grp1"), p, "data table into a graph group: refused");
  p = moveToGroup(p, "g1", "grp1");
  assert.equal(findSheet(p, "g1")!.groupId, "grp1");
  assert.equal(moveToGroup(p, "g1", "grp1"), p, "no-op when already there");
  p = moveToGroup(p, "g1", null);
  assert.equal(findSheet(p, "g1")!.groupId, undefined);
  assert.equal(moveToGroup(p, "g1", "missing"), p);
  p = moveGroup(p, "grp2", -1);
  assert.deepEqual(groupsOf(p, "graph").map((g) => g.name), ["Supplement", "Figures"]);
  assert.equal(moveGroup(p, "grp2", -1), p, "first group cannot move up");
});

test("groups: drag a sheet before another joins its group", () => {
  let p = addGroup(sample(), "data", "G", "grp1", ["d3"]).project;
  p = moveSheetBefore(p, "d1", "d3");
  const order = p.sheets.filter((s) => s.kind === "data").map((s) => s.id);
  assert.deepEqual(order, ["d2", "d1", "d3"]);
  assert.equal(findSheet(p, "d1")!.groupId, "grp1");
  assert.equal(moveSheetBefore(p, "d1", "r1"), p, "only before a sheet of the same kind");
  p = moveSheetBefore(p, "d1", null);
  assert.equal(p.sheets.filter((s) => s.kind === "data").at(-1)!.id, "d1");
});

test("groups: deleting a member or duplicating one keeps the group sane", () => {
  let p = addGroup(sample(), "data", "G", "grp1", ["d2"]).project;
  p = duplicateSheet(p, "d2", sequentialIds("c"));
  assert.equal(groupMembers(p, "grp1").length, 2, "a copy stays in the group");
  p = deleteSheet(p, "d2");
  assert.equal(groupMembers(p, "grp1").length, 1);
  assert.equal(groupsOf(p).length, 1, "the group itself stays");
});

test("groups: survive save / load; bad groups are repaired", () => {
  let p = addGroup(sample(), "results", "Fits", "grp1", ["r1"]).project;
  p = setGroupCollapsed(p, "grp1", true);
  const back = parseProjectFile(serializeProject(p), loadCtx());
  assert.deepEqual(back.groups, [{ id: "grp1", section: "results", name: "Fits", collapsed: true }]);
  assert.equal(findSheet(back, "r1")!.groupId, "grp1");

  const raw = JSON.parse(serializeProject(p));
  raw.groups.push({ id: "grp1", section: "data", name: "dupe" },
    { id: "x", section: "info", name: "bad section" }, "junk");
  raw.sheets.find((s: { id: string }) => s.id === "d1").groupId = "grp1"; // wrong section
  raw.sheets.find((s: { id: string }) => s.id === "d2").groupId = "nowhere";
  const fixed = parseProjectFile(JSON.stringify(raw), loadCtx());
  assert.equal(fixed.groups!.length, 1);
  assert.equal(findSheet(fixed, "d1")!.groupId, undefined);
  assert.equal(findSheet(fixed, "d2")!.groupId, undefined);
  assert.equal(findSheet(fixed, "r1")!.groupId, "grp1");

  const none = repairGroups(sample(), undefined);
  assert.equal("groups" in none, false, "no groups key when there are none");
});

// ------------------------------------------------------------ notes

test("notes: add, edit, collapse, delete; listed project-wide", () => {
  const ids = sequentialIds("note");
  let { project: p, noteId } = addNote(sample(), "g1", ids, { text: "Check the outlier\nat 1 µM" });
  assert.equal(noteId, "note1");
  p = addNote(p, "d1", ids).project;
  assert.equal(allNotes(p).length, 2);
  assert.equal(noteTitle(allNotes(p).find((n) => n.sheet.id === "g1")!.note), "Check the outlier");
  assert.equal(noteTitle(allNotes(p).find((n) => n.sheet.id === "d1")!.note), "Empty note");
  p = updateNote(p, "g1", "note1", { color: "blue", x: -5, y: 40.4, collapsed: true });
  const n = findSheet(p, "g1")!.floatingNotes![0];
  assert.deepEqual([n.color, n.x, n.y, n.collapsed], ["blue", 0, 40, true]);
  assert.equal(updateNote(p, "g1", "note1", { color: "blue" }), p, "no-op edit");
  p = deleteNote(p, "g1", "note1");
  assert.equal(findSheet(p, "g1")!.floatingNotes, undefined, "last note removes the key");
});

test("notes: survive save / load; invalid ones are dropped or fixed", () => {
  let p = addNote(sample(), "d1", "a", { text: "hello", color: "pink" }).project;
  p = addNote(p, "g1", "b", { text: "graph note" }).project;
  const back = parseProjectFile(serializeProject(p), loadCtx());
  assert.equal(findSheet(back, "d1")!.floatingNotes![0].text, "hello");
  assert.equal(findSheet(back, "d1")!.floatingNotes![0].color, "pink");
  const raw = JSON.parse(serializeProject(p));
  raw.sheets.find((s: { id: string }) => s.id === "g1").floatingNotes = [
    { id: "a", text: 3, color: "chartreuse", x: "1" }, null, { text: "no id" },
  ];
  const fixed = parseProjectFile(JSON.stringify(raw), loadCtx());
  const notes = findSheet(fixed, "g1")!.floatingNotes!;
  assert.equal(notes.length, 2);
  assert.notEqual(notes[0].id, "a", "an id already used in the project is replaced");
  assert.deepEqual([notes[0].text, notes[0].color, notes[0].x], ["", "yellow", 24]);
});

// ------------------------------------------------------------ templates

test("templates: a family round-trips through a template file", () => {
  const p = sample();
  const t = templateFromFamily(p, "g1", { id: "t1", name: "Dose response", withData: true, now: 5 })!;
  assert.equal(t.tableName, "October");
  assert.equal(t.results[0].name, `Nonlin fit of ${TABLE_TOKEN}`);
  assert.equal(t.graphs[0].resultsKey, t.results[0].key);
  assert.equal(t.info.length, 1);
  assert.equal(templateFileName(t), "dose-response.odtemplate.json");
  const back = parseTemplateFile(serializeTemplate(t));
  assert.deepEqual(back, t);

  const { project, dataId } = applyTemplate(makeProject(prefs), back, "Run 7", sequentialIds("x"));
  const data = findSheet(project, dataId)!;
  assert.equal(data.kind === "data" && data.table.datasets[0].rows[0][0], "5");
  const res = project.sheets.find((s): s is ResultsSheet => s.kind === "results")!;
  const g = project.sheets.find((s): s is GraphSheet => s.kind === "graph")!;
  const info = project.sheets.find((s): s is InfoSheet => s.kind === "info")!;
  assert.equal(res.name, "Nonlin fit of Run 7");
  assert.deepEqual(res.options, { model: "m", xIsLog: true });
  assert.equal(res.parentId, dataId);
  assert.equal(g.resultsId, res.id);
  assert.equal((g.settings.format as { frame: { width: number } }).frame.width, 2);
  assert.equal(info.parentId, dataId);
  assert.equal(new Set(project.sheets.map((s) => s.id)).size, project.sheets.length);
});

test("templates: without data keeps X and titles, clears Y", () => {
  const t = templateFromFamily(sample(), "d1", { id: "t", name: "", withData: false })!;
  assert.equal(t.name, "October", "blank name falls back to the table's");
  assert.equal(t.table.x[0], "1");
  assert.equal(t.table.datasets[0].rows[0][0], "");
  const withData = templateFromFamily(sample(), "d1", { id: "t", name: "x", withData: true })!;
  const { project, dataId } = applyTemplate(sample(), withData, "October", sequentialIds("y"),
    { withData: false });
  const d = findSheet(project, dataId)!;
  assert.equal(d.name, "October (2)", "names never clash");
  assert.equal(d.kind === "data" && d.table.datasets[0].rows[0][0], "");
  assert.equal(clearYValues(withData.table).x[0], "1");
});

test("templates: bad files are refused with a readable message", () => {
  assert.throws(() => parseTemplateFile("{"), /valid JSON/);
  assert.throws(() => parseTemplateFile(JSON.stringify({ opendose_project: 2, sheets: [] })),
    /project file/);
  assert.throws(() => parseTemplateFile(JSON.stringify({ opendose_template: 99, template: {} })),
    /newer version/);
  const t = parseTemplateFile(JSON.stringify({ opendose_template: 1, template: {
    table: { type: "column" }, results: [{ analysis: "" }, { key: "a", analysis: "column" }],
    graphs: [{ graphType: "bar", resultsKey: "zzz" }, { nope: 1 }],
  } }));
  assert.equal(t.results.length, 1);
  assert.equal(t.graphs.length, 1);
  assert.equal(t.graphs[0].resultsKey, null);
  assert.equal(t.table.type, "column");
});

// ------------------------------------------------------------ wand

test("wand: copies analyses and graphs with fresh ids and the new name", () => {
  const p = sample();
  assert.deepEqual(wandSources(p, "d2").map((s) => s.id), ["d1"]);
  assert.deepEqual(wandSources(p, "d3"), [], "only tables of the same type");
  const { project, created } = wandCopy(p, "d2", "d1", sequentialIds("w"), { prefix: "*" });
  assert.equal(created.length, 2);
  const [r, g] = created as [ResultsSheet, GraphSheet];
  assert.equal(r.parentId, "d2");
  assert.equal(r.name, "*Nonlin fit of November");
  assert.deepEqual(r.options, { model: "m", xIsLog: true });
  assert.notEqual(r.options, (findSheet(p, "r1") as ResultsSheet).options, "options are copied");
  assert.equal(g.resultsId, r.id);
  assert.equal(g.graphType, "xy");
  assert.deepEqual(g.settings.format, { frame: { width: 2 } });
  assert.equal(new Set(project.sheets.map((s) => s.id)).size, project.sheets.length);
  // lands right after the target table
  const i = project.sheets.findIndex((s) => s.id === "d2");
  assert.equal(project.sheets[i + 1].id, r.id);
  assert.equal(wandCopy(p, "d3", "d1", sequentialIds("w")).project, p, "type mismatch: no-op");
  assert.equal(wandCopy(p, "d1", "d1", sequentialIds("w")).project, p);
});

test("make graphs consistent: copies format and scheme to the same kind only", () => {
  let p = wandCopy(sample(), "d2", "d1", sequentialIds("w")).project;
  const copy = p.sheets.find((s): s is GraphSheet => s.kind === "graph" && s.parentId === "d2")!;
  // restyle the copy, then make the original look like it
  p = addSheets(p, []);
  p = { ...p, sheets: p.sheets.map((s) => (s.id === copy.id && s.kind === "graph"
    ? { ...s, settings: { ...s.settings, scheme: "colorblind" as never,
      titles: { x: "Mine", y: "" }, format: { frame: { width: 4 } } as never } } : s)) };
  assert.deepEqual(consistentTargets(p, copy.id).map((g) => g.id), ["g1"]);
  const { project, changed } = makeGraphsConsistent(p, [copy.id]);
  assert.equal(changed, 1);
  const g1 = findSheet(project, "g1") as GraphSheet;
  assert.equal(g1.settings.scheme, "colorblind");
  assert.deepEqual(g1.settings.format, { frame: { width: 4 } });
  assert.deepEqual(g1.settings.titles, { x: "", y: "" }, "titles stay");
  assert.equal((findSheet(project, "g3") as GraphSheet).settings.scheme, "default",
    "another kind is left alone");
  assert.equal(makeGraphsConsistent(project, [copy.id]).changed, 0, "idempotent");
});

// ------------------------------------------------------------ info constants

test("info constants: lookup order and hooked analysis constants", () => {
  let p = sample();
  const info = findSheet(p, "i1") as InfoSheet;
  p = { ...p, sheets: p.sheets.map((s) => (s.id === "i1"
    ? { ...info, constants: [{ name: "Dilution factor", value: "10" }] } : s)) };
  const wide = makeInfoSheet("i2", "Global", null);
  wide.constants = [{ name: "Dilution factor", value: "3" }, { name: "Empty", value: "" }];
  p = addSheets(p, [wide]);
  assert.equal(constantValue(p, "dilution factor", "d1"), "10", "the table's own info sheet wins");
  assert.equal(constantValue(p, "Dilution factor", "d2"), "3", "then project-wide");
  assert.equal(projectConstants(p).length, 2, "empty constants are skipped");
  assert.equal(identifierFor("Dilution factor"), "Dilution_factor");
  assert.equal(identifierFor("2nd dose"), "C_2nd_dose");

  p = addSheets(p, [makeResultsSheet("t1", "d1", "transform", {
    mode: "user", constants: [{ name: "K", value: "1", info: "Dilution factor" }, { name: "B", value: "2" }],
  }, "Transform of October")]);
  p = syncInfoLinks(p);
  const opts = (findSheet(p, "t1") as ResultsSheet).options as { constants: { value: string }[] };
  assert.deepEqual(opts.constants.map((c) => c.value), ["10", "2"]);
  assert.equal(syncInfoLinks(p), p, "nothing to do: same object");
});
