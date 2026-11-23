// Colours pinned to group names (P-56, graph/nameColors.ts): the
// project-level map, its migration (files and share links from before
// open unchanged), what it changes on a graph and the palette check.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sequentialIds } from "../../project/ids.ts";
import { parseProjectFile, serializeProject } from "../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { shareJson } from "../../share/link.ts";
import { pzfxSelection } from "../../share/pzfx.ts";
import {
  nameColorIndex, parseGroupColors, pinIndex, pinWarnings, stripNameColors, withNameColors,
  withPinnedColors,
} from "../nameColors.ts";
import type { GraphFormat } from "../format.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const load = (text: string) => parseProjectFile(text, { prefs, ids: sequentialIds() });
// A project file saved before pins existed (committed with the stage fixtures)
const BEFORE = readFileSync(new URL("../../../e2e-fixtures/stage/rank-test.json", import.meta.url), "utf8");
const ORANGE = "#e69f00";
const DARK_EXPORT = "#1c1c1e";

test("a project saved before pins opens unchanged and saves without the key", () => {
  const p = load(BEFORE);
  assert.equal("groupColors" in p, false);
  const text = serializeProject(p);
  assert.equal(JSON.parse(text).groupColors, undefined);
  // and reloads to the same project
  assert.deepEqual(load(text), p);
  // a share link made from it carries no pins either
  assert.equal(JSON.parse(shareJson(p)).groupColors, undefined);
});

test("pins travel with the file and with share links; bad entries are dropped", () => {
  const p = { ...load(BEFORE), groupColors: [{ name: "KO", color: ORANGE }] };
  const text = serializeProject(p);
  assert.deepEqual(load(text).groupColors, [{ name: "KO", color: ORANGE }]);
  assert.deepEqual(JSON.parse(shareJson(p)).groupColors, [{ name: "KO", color: ORANGE }]);
  assert.deepEqual(parseGroupColors([{ name: " ko ", color: "#E69F00" }, { name: "KO", color: "#000000" },
    { name: "WT", color: "red" }, { name: "", color: "#111111" }, null, "x"]),
  [{ name: "ko", color: ORANGE }]);
  assert.equal(parseGroupColors(undefined), undefined);
  assert.equal(parseGroupColors({}), undefined);
  // empty after cleaning: the loader leaves the key out
  const empty = JSON.parse(text);
  empty.groupColors = [{ name: "KO", color: "orange" }];
  assert.equal("groupColors" in load(JSON.stringify(empty)), false);
});

test(".pzfx export reads the same tables with or without pins", () => {
  const p = load(BEFORE);
  const pinned = { ...p, groupColors: [{ name: "Control", color: ORANGE }] };
  assert.deepEqual(pzfxSelection(pinned), pzfxSelection(p));
});

test("a pinned name is drawn in its colour on every graph; others are untouched", () => {
  const pins = pinIndex([{ name: "KO", color: ORANGE }]);
  const empty: GraphFormat = {};
  // three graphs with a KO data set at different positions
  for (const names of [["WT", "KO"], ["KO"], ["Het", "WT", " ko "]]) {
    const f = withPinnedColors(empty, names, pins);
    const i = names.findIndex((n) => n.trim().toLowerCase() === "ko");
    assert.equal(f.datasets?.[String(i)]?.color, ORANGE);
    names.forEach((_, j) => { if (j !== i) assert.equal(f.datasets?.[String(j)], undefined); });
  }
  // a graph without a pinned name: the same object (not redrawn)
  assert.equal(withPinnedColors(empty, ["WT", "Het"], pins), empty);
  assert.equal(withPinnedColors(empty, ["KO"], new Map()), empty);
  // a colour set on the graph wins
  const own: GraphFormat = { datasets: { "0": { color: "#000000", size: 9 } } };
  assert.equal(withPinnedColors(own, ["KO"], pins), own);
  // the pin keeps the data set's other settings
  const sized: GraphFormat = { datasets: { "0": { size: 9 } } };
  assert.deepEqual(withPinnedColors(sized, ["KO"], pins).datasets, { "0": { size: 9, color: ORANGE } });
});

test("pins come before 'same colour for a group'; drags save without either", () => {
  const project = { sheets: [{ kind: "data", table: { datasets: [{ name: "WT" }, { name: "KO" }] } }] } as never;
  const idx = nameColorIndex(project);
  const pins = pinIndex([{ name: "KO", color: ORANGE }]);
  const drawn = withNameColors(withPinnedColors({}, ["KO", "WT"], pins), ["KO", "WT"], idx, false);
  assert.equal(drawn.datasets?.["0"]?.color, ORANGE);
  assert.ok(drawn.datasets?.["1"]?.color);  // WT took its palette slot
  assert.deepEqual(stripNameColors(drawn, {}), { datasets: undefined });
});

test("the palette check still runs on pinned colours: contrast and colour-vision warnings", () => {
  assert.deepEqual(pinWarnings([{ name: "KO", color: "#d55e00" }], DARK_EXPORT), []);
  // Okabe-Ito orange is under 3:1 on white: warned, not refused
  assert.deepEqual(pinWarnings([{ name: "KO", color: ORANGE }], DARK_EXPORT),
    ["“KO” has low contrast on a white background (2.3:1; marks need 3:1)."]);
  // vermillion and blue differ in hue only as far as grey print can tell
  assert.deepEqual(pinWarnings([{ name: "KO", color: "#d55e00" }, { name: "WT", color: "#0072b2" }], DARK_EXPORT),
    ["“KO” and “WT” look alike in achromatopsia (no colour) (ΔE 8.2)."]);
  const pale = pinWarnings([{ name: "KO", color: "#ffff99" }], DARK_EXPORT);
  assert.equal(pale.length, 1);
  assert.match(pale[0], /^“KO” has low contrast on a white background \(1\.0:1; marks need 3:1\)\.$/);
  const darkMark = pinWarnings([{ name: "KO", color: "#202020" }], DARK_EXPORT);
  assert.match(darkMark[0], /low contrast on the dark background/);
  // red and green: alike for deuteranopes (Machado 2009)
  const rg = pinWarnings([{ name: "KO", color: "#d62728" }, { name: "WT", color: "#2ca02c" }], DARK_EXPORT);
  assert.ok(rg.some((w) => /^“KO” and “WT” look (alike|the same) in deuteranopia/.test(w)), rg.join(" | "));
  // two pins of the same colour on purpose are not flagged as confusable
  assert.deepEqual(pinWarnings([{ name: "A", color: "#d55e00" }, { name: "B", color: "#d55e00" }], DARK_EXPORT), []);
});
