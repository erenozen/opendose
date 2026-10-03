// Unit tests for the page-layout model. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { sequentialIds } from "../ids.ts";
import {
  applyGrid, clampRect, contentRect, DEFAULT_LETTERS, DEFAULT_PAGE, fillPlaceholders, freeSpot,
  MAX_CELL_ASPECT,
  forgetGraphs, gridRects, letterFor, masterLegend, pageDims, panelLetters,
  placedGraphIds, readingOrder, resolveLayout, sanitizeLayoutFields, seriesFromTraces,
  snapMove, snapResize, storeLayout, type LegendEntry, type ResolvedLayout,
} from "../layout.ts";
import {
  deleteSheet, makeDataSheet, makeGraphSheet, makeLayoutSheet, makeProject,
} from "../ops.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { emptyTable } from "../table.ts";
import type { LayoutItem, LayoutSheet } from "../types.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const near = (a: number, b: number, eps = 0.02) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

function layoutWith(items: LayoutItem[]): ResolvedLayout {
  return { page: DEFAULT_PAGE, items, letters: DEFAULT_LETTERS, grid: { rows: 1, cols: 1 } };
}
const g = (id: string, graphId: string | null, x: number, y: number, w = 80, h = 60):
  LayoutItem => ({ id, kind: "graph", graphId, x, y, w, h });

test("page dimensions follow size and orientation", () => {
  assert.deepEqual(pageDims(DEFAULT_PAGE), { w: 210, h: 297 });
  assert.deepEqual(pageDims({ ...DEFAULT_PAGE, orientation: "landscape" }), { w: 297, h: 210 });
  const letter = pageDims({ ...DEFAULT_PAGE, size: "letter" });
  near(letter.w, 215.9); near(letter.h, 279.4);
  assert.deepEqual(pageDims({ ...DEFAULT_PAGE, size: "custom", width: 180, height: 120,
    orientation: "landscape" }), { w: 180, h: 120 });
  // A custom size typed wider than tall still honours "portrait".
  assert.deepEqual(pageDims({ ...DEFAULT_PAGE, size: "custom", width: 180, height: 120 }),
    { w: 120, h: 180 });
});

test("grid cells keep a figure-like shape and start at the top", () => {
  const c = contentRect(DEFAULT_PAGE);
  const [one] = gridRects(DEFAULT_PAGE, 1, 2);
  near(one.y, c.y);
  near(one.h, one.w * MAX_CELL_ASPECT);       // not stretched down the page
  const land = gridRects({ ...DEFAULT_PAGE, orientation: "landscape" }, 2, 2);
  assert.ok(land.every((r) => r.h <= r.w * MAX_CELL_ASPECT + 0.01));
  // When the rows run out of room first, the page height decides.
  const tall = gridRects(DEFAULT_PAGE, 6, 1);
  near(tall[5].y + tall[5].h, c.y + c.h);
});

test("new items go to the first free spot", () => {
  const c = contentRect(DEFAULT_PAGE);
  assert.deepEqual(freeSpot(DEFAULT_PAGE, [], 50, 10), { x: c.x, y: c.y, w: 50, h: 10 });
  const r = freeSpot(DEFAULT_PAGE, [{ x: 15, y: 15, w: 180, h: 70 }], 120, 20);
  assert.ok(r.y >= 85, `y = ${r.y}`);
  const full = freeSpot(DEFAULT_PAGE, [{ x: 0, y: 0, w: 210, h: 297 }], 50, 10);
  assert.deepEqual({ x: full.x, y: full.y }, { x: c.x, y: c.y });
});

test("grid cells tile the content area with gaps, row-major", () => {
  const cells = gridRects(DEFAULT_PAGE, 2, 3, 6, Infinity);
  assert.equal(cells.length, 6);
  const c = contentRect(DEFAULT_PAGE);
  near(cells[0].x, c.x); near(cells[0].y, c.y);
  const last = cells[5];
  near(last.x + last.w, c.x + c.w);
  near(last.y + last.h, c.y + c.h);
  near(cells[1].x - (cells[0].x + cells[0].w), 6);   // column gap
  near(cells[3].y - (cells[0].y + cells[0].h), 6);   // row gap
  assert.ok(cells.every((r) => Math.abs(r.w - cells[0].w) < 0.02));
});

test("reading order groups rows by vertical centre, then left to right", () => {
  const items = [g("c", null, 110, 20), g("a", null, 15, 22), g("d", null, 15, 100),
    g("b", null, 60, 18, 40, 70)];
  assert.deepEqual(readingOrder(items).map((i) => i.id), ["a", "b", "c", "d"]);
});

test("applying a grid places bound graphs first and pads with placeholders", () => {
  const ids = sequentialIds("n");
  const start = layoutWith([
    g("e1", null, 10, 10), g("g2", "graph2", 100, 150), g("g1", "graph1", 10, 150),
    { id: "t", kind: "text", text: "Title", fontSize: 12, bold: true, align: "left",
      x: 10, y: 5, w: 100, h: 10 },
  ]);
  const out = applyGrid(start, 2, 2, ids);
  assert.deepEqual(out.grid, { rows: 2, cols: 2 });
  const cells = gridRects(DEFAULT_PAGE, 2, 2);
  const panels = out.items.filter((i) => i.kind === "graph");
  assert.equal(panels.length, 4);
  // Bound graphs in reading order fill the first cells...
  assert.equal(panels[0].kind === "graph" && panels[0].graphId, "graph1");
  assert.equal(panels[1].kind === "graph" && panels[1].graphId, "graph2");
  assert.deepEqual({ x: panels[0].x, y: panels[0].y }, { x: cells[0].x, y: cells[0].y });
  // ...the existing empty placeholder is reused, one new one is created.
  assert.equal(panels[2].id, "e1");
  assert.equal(panels[3].id, "n1");
  // Text is untouched.
  assert.deepEqual(out.items.find((i) => i.id === "t"), start.items[3]);
});

test("shrinking the grid never drops a placed graph", () => {
  const start = layoutWith([g("a", "g1", 10, 10), g("b", "g2", 110, 10), g("c", "g3", 10, 90)]);
  const out = applyGrid(start, 1, 1, sequentialIds("n"));
  assert.deepEqual(placedGraphIds(out.items).sort(), ["g1", "g2", "g3"]);
  assert.equal(out.items.length, 3);
});

test("fill placeholders takes graphs in project order from the chosen one", () => {
  const start = layoutWith([g("p1", null, 10, 10), g("p2", "gB", 110, 10),
    g("p3", null, 10, 100), g("p4", null, 110, 100)]);
  const out = fillPlaceholders(start, ["gA", "gB", "gC", "gD"], "gB");
  // gB is already on the page, so the empties get gC and gD in reading order.
  assert.deepEqual(out.items.map((i) => (i.kind === "graph" ? i.graphId : null)),
    ["gC", "gB", "gD", null]);
  assert.equal(fillPlaceholders(out, ["gB", "gC", "gD"]), out, "nothing left to place");
});

test("panel letters follow reading order and skip empty placeholders", () => {
  const items = [g("r", "g2", 110, 10), g("l", "g1", 10, 12), g("empty", null, 10, 100),
    { id: "pic", kind: "picture", name: "x", svg: "<svg/>", x: 110, y: 100, w: 80, h: 60 },
  ] as LayoutItem[];
  const m = panelLetters(items, DEFAULT_LETTERS);
  assert.deepEqual([...m.entries()], [["l", "A"], ["r", "B"], ["pic", "C"]]);
  const paren = panelLetters(items, { ...DEFAULT_LETTERS, style: "lower", format: "paren" });
  assert.equal(paren.get("pic"), "(c)");
  assert.equal(panelLetters(items, { ...DEFAULT_LETTERS, show: false }).size, 0);
  assert.equal(letterFor(25), "Z");
  assert.equal(letterFor(26), "AA");
  assert.equal(letterFor(27, "lower"), "ab");
});

test("move snaps to margins and other items' edges, else to the grid", () => {
  const others = [{ x: 100, y: 40, w: 60, h: 50 }];
  // Left edge 1.2 mm from the 15 mm margin sticks to it.
  const a = snapMove({ x: 16.2, y: 70.4, w: 40, h: 30 }, DEFAULT_PAGE, others);
  assert.equal(a.x, 15);
  assert.equal(a.y, 70);   // nothing near: whole-millimetre grid
  // Top edge aligns with the other item's top.
  const b = snapMove({ x: 30.3, y: 41.5, w: 40, h: 30 }, DEFAULT_PAGE, others);
  assert.equal(b.y, 40);
  // Kept on the page.
  const c = snapMove({ x: 200, y: -20, w: 40, h: 30 }, DEFAULT_PAGE, []);
  assert.deepEqual({ x: c.x, y: c.y }, { x: 170, y: 0 });
});

test("resize snaps the right/bottom edge and respects the minimum size", () => {
  const r = snapResize({ x: 15, y: 15, w: 178.6, h: 2 }, DEFAULT_PAGE, []);
  assert.equal(r.w, 180);  // right edge sticks to the right margin (195)
  assert.equal(r.h, 5);    // minimum item size
  assert.deepEqual(clampRect({ x: 0, y: 0, w: 900, h: 50 }, DEFAULT_PAGE).w, 210);
});

test("series from traces merge curve + points and skip helper traces", () => {
  const s = seriesFromTraces([
    { name: "Drug A band", fill: "toself", hoverinfo: "skip" } as never,
    { name: "Drug A", mode: "lines", legendgroup: "Drug A",
      line: { color: "#2a78d6", dash: "solid", width: 2 }, hoverinfo: "skip" },
    { name: "Drug A (outliers)", mode: "markers", marker: { color: "#2a78d6", symbol: "x" } },
    { name: "Drug A", mode: "markers", legendgroup: "Drug A",
      marker: { color: "#2a78d6", symbol: "circle" } },
    { mode: "markers", marker: { color: "#000", symbol: "line-ew" } },
    { name: "Control", type: "bar", marker: { color: "#eb6834" } },
  ]);
  assert.deepEqual(s, [
    { name: "Drug A", color: "#2a78d6", symbol: "circle", dash: "solid", fill: false },
    { name: "Control", color: "#eb6834", symbol: null, dash: null, fill: true },
  ]);
});

test("master legend de-duplicates exact repeats across graphs", () => {
  const a: LegendEntry = { name: "Control", color: "#2A78D6", symbol: "circle", dash: null, fill: false };
  const b: LegendEntry = { name: "Treated", color: "#eb6834", symbol: "square", dash: null, fill: false };
  const out = masterLegend([
    [a, b],
    [{ ...a, color: "#2a78d6", name: " Control " }, b],   // same series again
    [{ ...a, symbol: "diamond" }],                        // same name, drawn differently
  ]);
  assert.deepEqual(out.map((e) => `${e.name.trim()}/${e.symbol}`),
    ["Control/circle", "Treated/square", "Control/diamond"]);
  assert.deepEqual(masterLegend([]), []);
});

test("pre-composer layouts resolve to placeholders and round-trip through files", () => {
  const old: LayoutSheet = { ...makeLayoutSheet("l1"), graphIds: ["g1"], grid: { rows: 1, cols: 2 } };
  const r = resolveLayout(old);
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.items.map((i) => (i.kind === "graph" ? i.graphId : "?")), ["g1", null]);
  assert.deepEqual(resolveLayout(old).items, r.items, "deterministic ids");

  const withText = storeLayout(old, {
    ...r, items: [...r.items, { id: "t1", kind: "text", text: "Fig. 1", fontSize: 11,
      bold: false, align: "center", x: 15, y: 280, w: 100, h: 8 }],
  });
  assert.deepEqual(withText.graphIds, ["g1"]);
  const t = emptyTable("xy");
  const p = makeProject(prefs, [
    makeDataSheet("d1", "D", t),
    makeGraphSheet("g1", "d1", null, "xy", { titles: { x: "", y: "" }, scheme: "default" }, "G"),
    withText,
  ]);
  const back = parseProjectFile(serializeProject(p), { prefs, ids: sequentialIds("z") });
  const l = back.sheets.find((s) => s.kind === "layout") as LayoutSheet;
  assert.deepEqual(l.items, withText.items);
  assert.deepEqual(l.page, withText.page);
  assert.deepEqual(l.letters, withText.letters);

  // Deleting the graph unbinds its placeholder instead of removing it.
  const after = deleteSheet(back, "g1").sheets.find((s) => s.kind === "layout") as LayoutSheet;
  assert.deepEqual(after.graphIds, []);
  assert.equal(after.items!.length, 3);
  assert.ok(after.items!.every((i) => i.kind !== "graph" || i.graphId === null));
});

test("layout fields from files are sanitized", () => {
  const f = sanitizeLayoutFields({
    page: { size: "a3", orientation: "sideways", margin: -4, background: "red" },
    letters: { fontSize: 500, format: "weird" },
    items: [
      { id: "a", kind: "graph", graphId: 7, x: -5, y: 10, w: 1, h: 50 },
      { id: "a", kind: "text", text: "dup id" },
      { id: "p", kind: "picture", svg: "<script>alert(1)</script>" },
      { id: "q", kind: "teapot" },
      { kind: "text" },
    ],
  });
  assert.equal(f.page!.size, "a4");
  assert.equal(f.page!.orientation, "portrait");
  assert.equal(f.page!.margin, 0);
  assert.equal(f.page!.background, "#ffffff");
  assert.equal(f.letters!.fontSize, 72);
  assert.equal(f.letters!.format, "plain");
  assert.deepEqual(f.items, [{ id: "a", kind: "graph", graphId: null, x: 0, y: 10, w: 5, h: 50 }]);
  assert.deepEqual(sanitizeLayoutFields({}), {});
  const kept = forgetGraphs(makeLayoutSheet("x"), () => true);
  assert.deepEqual(kept, makeLayoutSheet("x"));
});
