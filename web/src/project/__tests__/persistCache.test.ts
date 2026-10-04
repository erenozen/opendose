// Saved results carry the fingerprint of their input, and the file (and
// a share link) remembers the sheet on screen. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDataSheet, makeProject, makeResultsSheet } from "../ops.ts";
import { parseProjectFile, savedSelection, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { emptyTable } from "../table.ts";
import type { ResultsSheet } from "../types.ts";
import { makeFragment, readFragment } from "../../share/link.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const project = () => makeProject(prefs, [
  makeDataSheet("d1", "Data", emptyTable("column", { datasets: 2, subcolumns: 1, rows: 3 })),
  makeResultsSheet("r1", "d1", "column_stats", {}, "Column stats of Data"),
  makeResultsSheet("r2", "d1", "ttest", {}, "t test of Data"),
], "P");

test("results are saved with their fingerprints; the selection travels too", () => {
  const results = new Map<string, unknown>([["r1", { mean: 1 }], ["r2", { t: 2 }]]);
  const keys = new Map([["r1", "abc.123"]]);
  const text = serializeProject(project(), results, { keys, selected: "r2" });
  const back = parseProjectFile(text, { prefs, ids: () => "x" });
  const r1 = back.sheets.find((s) => s.id === "r1") as ResultsSheet;
  const r2 = back.sheets.find((s) => s.id === "r2") as ResultsSheet;
  assert.deepEqual(r1.cached, { mean: 1 });
  assert.equal(r1.cachedKey, "abc.123");
  assert.deepEqual(r2.cached, { t: 2 });
  assert.equal(r2.cachedKey, undefined, "no fingerprint, no reuse");
  assert.equal(savedSelection(text), "r2");
  assert.equal(savedSelection(serializeProject(project(), results, { selected: "gone" })), null);
});

test("a share link keeps the fingerprints and the sheet on screen", () => {
  const results = new Map<string, unknown>([["r1", { mean: 1 }]]);
  const out = makeFragment(project(), results, undefined,
    { keys: new Map([["r1", "k.1"]]), selected: "r1" });
  assert.ok(out.ok);
  const raw = readFragment(out.ok ? out.fragment : "") as { selected: string; sheets: { id: string; cachedKey?: string }[] };
  assert.equal(raw.selected, "r1");
  assert.equal(raw.sheets.find((s) => s.id === "r1")?.cachedKey, "k.1");
});
