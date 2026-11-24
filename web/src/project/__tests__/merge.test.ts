// Add from project (P-74): the merged project holds both sources sheet
// for sheet, every id is unique, every link points where it pointed in
// its own file, and nothing of the open project is overwritten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDerivedSheet } from "../derived.ts";
import { sequentialIds } from "../ids.ts";
import { effectiveConstants, mergeProjects } from "../merge.ts";
import {
  makeDataSheet, makeGraphSheet, makeInfoSheet, makeLayoutSheet, makeProject, makeResultsSheet,
} from "../ops.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { normalizeTable } from "../table.ts";
import type { InfoSheet, Project, Sheet } from "../types.ts";

const prefs = projectPrefs(DEFAULT_PREFS);

const table = (vals: string[]) => normalizeTable({
  type: "column", x: vals.map(() => ""),
  datasets: [{ name: "A", rows: vals.map((v) => [v]) }, { name: "B", rows: vals.map((v) => [`${v}1`]) }],
});

/** A colleague's file: two families, an info sheet linked to the first,
 *  a project-wide one, a layout of both graphs, a group, a note and a
 *  derived table; its ids are the simple ones every small file has. */
function colleague(): Project {
  const info = makeInfoSheet("i1", "Assay info", "d1");
  info.constants = [{ name: "Dilution factor", value: "20" }];
  const layout = makeLayoutSheet("l1", "Figure 1");
  layout.graphIds = ["g1", "g2"];
  layout.items = [
    { id: "it1", kind: "graph", graphId: "g1", x: 0, y: 0, w: 80, h: 60 },
    { id: "it2", kind: "graph", graphId: "g2", x: 90, y: 0, w: 80, h: 60 },
  ];
  const d1 = makeDataSheet("d1", "Data 1", table(["1", "2", "3"]));
  d1.groupId = "grp1";
  d1.floatingNotes = [{ id: "n1", text: "check well B3", color: "yellow", x: 10, y: 10 }];
  const r1 = makeResultsSheet("r1", "d1", "column", { analysis: "ttest" }, "Column stats of Data 1");
  r1.cached = { p: 0.0123 };
  r1.cachedKey = "abc.1";
  return {
    ...makeProject(prefs, [
      d1, r1,
      makeGraphSheet("g1", "d1", "r1", "scatter", { titles: { x: "", y: "" }, scheme: "default" }, "Graph of Data 1"),
      makeDataSheet("d2", "Data 2", table(["4", "5", "6"])),
      makeResultsSheet("r2", "d2", "column", { analysis: "anova" }, "Column stats of Data 2"),
      makeGraphSheet("g2", "d2", "r2", "bar", { titles: { x: "", y: "" }, scheme: "default" }, "Graph of Data 2"),
      makeResultsSheet("r3", "d2", "transform", {}, "Transform of Data 2"),
      makeDerivedSheet("d3", "Transformed Data 2", table(["", "", ""]), { sourceId: "d2", resultsId: "r3" }),
      info, makeInfoSheet("i2", "Project info"), layout,
    ], "Colleague"),
    groups: [{ id: "grp1", section: "data", name: "Plate 1" }],
  };
}

/** The open project, built with the same simple ids. */
function mine(): Project {
  const info = makeInfoSheet("i1", "Project info");
  info.constants = [{ name: "Dilution factor", value: "10" }];
  return makeProject(prefs, [
    makeDataSheet("d1", "Data 1", table(["7", "8"])),
    makeResultsSheet("r1", "d1", "column", {}, "Column stats of Data 1"),
    info,
  ], "Mine");
}

function allIds(p: Project): string[] {
  return [
    ...p.sheets.map((s) => s.id),
    ...p.sheets.flatMap((s) => (s.floatingNotes ?? []).map((n) => n.id)),
    ...(p.groups ?? []).map((g) => g.id),
    ...(p.recipes ?? []).map((r) => r.id),
  ];
}

/** Every reference in the project resolves to a sheet of the right kind. */
function assertLinks(p: Project) {
  const by = new Map(p.sheets.map((s) => [s.id, s]));
  const kind = (id: string | null | undefined) => (id ? by.get(id)?.kind : undefined);
  for (const s of p.sheets) {
    if (s.kind === "results") assert.equal(kind(s.parentId), "data", s.name);
    if (s.kind === "graph") {
      assert.equal(kind(s.parentId), "data", s.name);
      if (s.resultsId) assert.equal(kind(s.resultsId), "results", s.name);
    }
    if (s.kind === "info" && s.parentId) assert.equal(kind(s.parentId), "data", s.name);
    if (s.kind === "data" && s.derived) {
      assert.equal(kind(s.derived.sourceId), "data");
      assert.equal(kind(s.derived.resultsId), "results");
    }
    if (s.kind === "layout") {
      for (const g of s.graphIds) assert.equal(kind(g), "graph");
      for (const it of s.items ?? []) if (it.kind === "graph" && it.graphId) assert.equal(kind(it.graphId), "graph");
    }
    if (s.groupId) assert.ok((p.groups ?? []).some((g) => g.id === s.groupId), s.name);
  }
}

/** A source sheet with its references mapped through `idMap`, as the
 *  merged copy must be (names aside). */
function mapped(s: Sheet, idMap: Map<string, string>, groupOf: (id: string) => string): Sheet {
  const m = (id: string) => idMap.get(id) ?? id;
  const c = structuredClone(s) as Sheet;
  c.id = m(s.id);
  if (c.groupId) c.groupId = groupOf(c.groupId);
  if (c.kind === "results" || c.kind === "graph") c.parentId = m(c.parentId);
  if (c.kind === "graph" && c.resultsId) c.resultsId = m(c.resultsId);
  if (c.kind === "info" && c.parentId) c.parentId = m(c.parentId);
  if (c.kind === "data" && c.derived) c.derived = { ...c.derived, sourceId: m(c.derived.sourceId), resultsId: m(c.derived.resultsId) };
  if (c.kind === "layout") {
    c.graphIds = c.graphIds.map(m);
    c.items = c.items?.map((it) => (it.kind === "graph" && it.graphId ? { ...it, graphId: m(it.graphId) } : it));
  }
  return c;
}

const strip = (s: Sheet) => {
  const c = structuredClone(s) as Sheet & { floatingNotes?: { id: string }[] };
  c.name = "";
  c.floatingNotes = c.floatingNotes?.map((n) => ({ ...n, id: "" }));
  return c;
};

test("a colleague's two families come in whole, with unique ids and working links", () => {
  const base = mine();
  const other = colleague();
  const r = mergeProjects(base, other, sequentialIds("new"));
  const merged = r.project;

  // the open project's sheets are untouched, in place, first
  assert.deepEqual(merged.sheets.slice(0, base.sheets.length), base.sheets);
  // the merged project equals both sources sheet for sheet
  assert.equal(merged.sheets.length, base.sheets.length + other.sheets.length);
  assert.equal(r.sheets, other.sheets.length);
  assert.equal(r.families, 3); // d1, d2 and the derived d3
  const groupOf = (id: string) => merged.groups!.find((g) => g.name === other.groups!.find((x) => x.id === id)!.name)!.id;
  for (const s of other.sheets) {
    const got = merged.sheets.find((x) => x.id === r.idMap.get(s.id));
    assert.ok(got, s.name);
    assert.deepEqual(strip(got!), strip(mapped(s, r.idMap, groupOf)), s.name);
  }
  // unique ids everywhere (sheets, notes, groups)
  const ids = allIds(merged);
  assert.equal(new Set(ids).size, ids.length);
  // the clashing ids were renewed, the others kept
  assert.notEqual(r.idMap.get("d1"), "d1");
  assert.equal(r.idMap.get("d2"), "d2");
  assertLinks(merged);
  // the layout still shows the colleague's two graphs
  const layout = merged.sheets.find((s) => s.kind === "layout")!;
  assert.deepEqual(layout.kind === "layout" && layout.graphIds, [r.idMap.get("g1"), r.idMap.get("g2")]);
  // names stay unique; the cached result travels
  assert.equal(new Set(merged.sheets.map((s) => s.name)).size, merged.sheets.length);
  assert.equal(merged.sheets.find((s) => s.id === r.idMap.get("d1"))!.name, "Data 1 (2)");
  const res = merged.sheets.find((s) => s.id === r.idMap.get("r1"));
  assert.deepEqual(res?.kind === "results" && [res.cached, res.cachedKey], [{ p: 0.0123 }, "abc.1"]);
  assert.equal(r.firstDataId, r.idMap.get("d1"));
});

test("into an empty project nothing is renamed or renumbered", () => {
  const other = colleague();
  const r = mergeProjects(makeProject(prefs, [], "Empty"), other, sequentialIds("new"));
  assert.deepEqual(r.project.sheets, other.sheets);
  assert.deepEqual(r.project.groups, other.groups);
  assert.deepEqual(r.conflicts, []);
});

test("the merged project saves and opens again unchanged", () => {
  const r = mergeProjects(mine(), colleague(), sequentialIds("new"));
  const back = parseProjectFile(serializeProject(r.project), { prefs, ids: sequentialIds("x") });
  assert.deepEqual(back.sheets, r.project.sheets);
  assert.deepEqual(back.groups, r.project.groups);
});

test("adding the same file twice still gives unique ids and names", () => {
  const once = mergeProjects(makeProject(prefs, []), colleague(), sequentialIds("a")).project;
  const twice = mergeProjects(once, colleague(), sequentialIds("b"));
  const ids = allIds(twice.project);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(twice.project.sheets.map((s) => s.name)).size, twice.project.sheets.length);
  assertLinks(twice.project);
  assert.equal(twice.families, 3);
});

test("a constant with another value is a conflict, never overwritten", () => {
  const base = mine();
  const r = mergeProjects(base, colleague(), sequentialIds("new"));
  const c = r.conflicts.filter((x) => x.kind === "constant");
  // here project-wide 10; there linked to Data 1 (20): project-wide wins
  assert.deepEqual(c, [{ kind: "constant", label: "Dilution factor", here: "10", there: "20", used: "10" }]);
  const kept = r.project.sheets.find((s) => s.id === "i1") as InfoSheet;
  assert.deepEqual(kept.constants, [{ name: "Dilution factor", value: "10" }]);
  const theirs = r.project.sheets.find((s) => s.id === r.idMap.get("i1")) as InfoSheet;
  assert.deepEqual(theirs.constants, [{ name: "Dilution factor", value: "20" }]);
  assert.equal(effectiveConstants(r.project).get("dilution_factor")?.value, "10");
});

test("a constant that would change the open project's value says so", () => {
  // here only linked to a table (rank 2); there project-wide (rank 1)
  const base = mine();
  const info = base.sheets.find((s) => s.id === "i1") as InfoSheet;
  info.parentId = "d1";
  const other = colleague();
  const theirs = other.sheets.find((s) => s.id === "i2") as InfoSheet;
  theirs.constants = [{ name: "dilution factor", value: "30" }];
  const r = mergeProjects(base, other, sequentialIds("new"));
  const c = r.conflicts.find((x) => x.kind === "constant");
  assert.deepEqual(c, { kind: "constant", label: "Dilution factor", here: "10", there: "30", used: "30" });
});

test("preferences: the open project's are kept and differences listed", () => {
  const other = colleague();
  other.prefs = { ...other.prefs, digits: 6, report: { pStyle: "apa", hideNs: false, smd: "d", variance: "eta2", pFloor: "1e-4" } };
  const r = mergeProjects(mine(), other, sequentialIds("new"));
  assert.deepEqual(r.project.prefs, prefs);
  const labels = r.conflicts.filter((c) => c.kind === "preference").map((c) => [c.label, c.here, c.there]);
  assert.deepEqual(labels, [
    ["Significant digits in results", "4", "6"],
    ["P-value style", "GraphPad (P = 0.0321, P < 0.0001)", "APA 7 (p = .032, p < .001)"],
  ]);
});

test("pinned colours: a new name comes in, a taken one keeps its colour", () => {
  const base = { ...mine(), groupColors: [{ name: "KO", color: "#e69f00" }] };
  const other = { ...colleague(), groupColors: [{ name: "ko ", color: "#0072b2" }, { name: "WT", color: "#000000" }] };
  const r = mergeProjects(base, other, sequentialIds("new"));
  assert.deepEqual(r.project.groupColors, [{ name: "KO", color: "#e69f00" }, { name: "WT", color: "#000000" }]);
  assert.deepEqual(r.conflicts.filter((c) => c.kind === "color"),
    [{ kind: "color", label: "KO", here: "#e69f00", there: "#0072b2" }]);
});

test("recipes: an identical one is not doubled, a different one with the name is renamed", () => {
  const spec = { recipe: "plain", delimiter: "," };
  const base = { ...mine(), recipes: [{ id: "rc1", name: "Reader", savedAt: "", basis: "", spec }] };
  const other = {
    ...colleague(), recipes: [
      { id: "rc1", name: "Reader", savedAt: "", basis: "", spec },
      { id: "rc2", name: "Reader", savedAt: "", basis: "", spec: { ...spec, delimiter: ";" } },
    ],
  };
  // normalizeRecipes keeps one per name in a file; here both reach the merge
  const r = mergeProjects(base, other, sequentialIds("new"));
  assert.deepEqual(r.project.recipes!.map((x) => x.name), ["Reader", "Reader (2)"]);
  assert.equal(new Set(r.project.recipes!.map((x) => x.id)).size, 2);
});

test("a file with no sheets adds nothing", () => {
  const base = mine();
  const r = mergeProjects(base, makeProject(prefs, []), sequentialIds("new"));
  assert.equal(r.sheets, 0);
  assert.equal(r.families, 0);
  assert.deepEqual(r.project.sheets, base.sheets);
});
