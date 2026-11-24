// Comparing two versions of a project (P-73) on fixture pairs: cells,
// exclusions added and put back (table and left out of one analysis),
// options, and the reported numbers that moved, P first, written by the
// replay log's diff (replayDiff.ts). Results are stand-ins with the
// engine's shape; nothing here checks a statistic.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareProjects, diffSummary, MAX_CELLS, rankChanges, type CompareSide,
} from "../compareProjects.ts";
import { sequentialIds } from "../ids.ts";
import { parseProjectFile } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { tableP } from "../../report/pformat.ts";
import type { DataSheet, Project, ResultsSheet } from "../types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const STUDY = readFileSync(join(here, "..", "..", "..", "e2e-fixtures", "project-study.json"), "utf8");
const prefs = projectPrefs(DEFAULT_PREFS);
const load = () => parseProjectFile(STUDY, { prefs, ids: sequentialIds("s") });

// The t test result's shape (engine column analysis, ttest) with the
// reference P values of e2e-fixtures/reference/compare_versions_ttest.json.
const REF = JSON.parse(readFileSync(join(here, "..", "..", "..", "e2e-fixtures", "reference",
  "compare_versions_ttest.json"), "utf8")) as { before: { p: number; t: number }; after: { p: number; t: number } };
const ttest = (r: { p: number; t: number }) => ({ analysis: "column", ttest: { t: r.t, p: r.p, df: 8.9 } });

const side = (project: Project, result: unknown, options: unknown = { ttestKind: "welch" },
  missing?: string): CompareSide => ({
  project,
  results: new Map(missing ? [] : [["r1", result]]),
  options: new Map([["r1", options]]),
  missing: new Map(missing ? [["r1", missing]] : []),
});

const edit = (p: Project, fn: (d: DataSheet, r: ResultsSheet) => void): Project => {
  const q = structuredClone(p);
  fn(q.sheets[0] as DataSheet, q.sheets[1] as ResultsSheet);
  return q;
};

test("an exclusion in the table is listed, with the P value before and after", () => {
  const a = load();
  const b = edit(a, (d) => {
    d.table.datasets[0].excluded = ["3:0"];
    d.table.datasets[0].exclusionReasons = { "3:0": "pipetting error" };
  });
  const diff = compareProjects(side(a, ttest(REF.before)), side(b, ttest(REF.after)));
  assert.equal(diff.tables.length, 1);
  assert.deepEqual(diff.tables[0].excludedAdded,
    [{ group: "Control", where: "row 4", value: "14.1", reason: "pipetting error" }]);
  assert.deepEqual(diff.tables[0].cells, []);
  const t = diff.analyses[0];
  assert.equal(t.status, "changed");
  assert.equal(t.changes[0].kind, "p");
  assert.equal(t.changes[0].text, `${tableP(REF.before.p)} → ${tableP(REF.after.p)}`);
  assert.equal(diffSummary(diff), "1 value excluded, 2 result numbers moved.");
  // the other way round, the value is put back
  const back = compareProjects(side(b, ttest(REF.after)), side(a, ttest(REF.before)));
  assert.equal(back.tables[0].excludedRemoved[0].value, "14.1");
  assert.equal(back.tables[0].excludedAdded.length, 0);
});

test("cells, options and values left out of one analysis are each named", () => {
  const a = load();
  const b = edit(a, (d, r) => {
    d.table.datasets[1].rows[0][0] = "12.0";
    d.table.rowTitles[1] = "Mouse 2";
    r.leftOut = [{ dataset: 1, row: 2, sub: 0, value: "11.4", reason: "clot in the well" }];
  });
  const same = ttest(REF.before);
  const diff = compareProjects(side(a, same), side(b, same, { ttestKind: "student" }));
  assert.deepEqual(diff.tables[0].cells, [
    { where: "Row title, row 2", before: "", after: "Mouse 2" },
    { where: "Treated, row 1", before: "11.9", after: "12.0" },
  ]);
  const t = diff.analyses[0];
  assert.deepEqual(t.options, [{ key: "ttestKind", before: "“welch”", after: "“student”" }]);
  assert.deepEqual(t.leftOutAdded, [{ group: "Treated", where: "row 3", value: "11.4", reason: "clot in the well" }]);
  assert.equal(t.status, "same");
  assert.equal(diffSummary(diff),
    "2 cells changed, 1 value excluded, 1 analysis option changed.");
});

test("identical versions have no differences", () => {
  const a = load();
  const r = ttest(REF.before);
  const diff = compareProjects(side(a, r), side(structuredClone(a), r));
  assert.deepEqual(diff.tables, []);
  assert.equal(diff.analyses[0].status, "same");
  assert.equal(diffSummary(diff), "No differences: the same data, options and numbers.");
});

test("a side without a result says so instead of claiming nothing moved", () => {
  const a = load();
  const diff = compareProjects(side(a, null, undefined, "the analysis engine did not load"),
    side(a, ttest(REF.before)));
  assert.equal(diff.analyses[0].status, "missing");
  assert.equal(diff.analyses[0].note, "no result in the earlier one: the analysis engine did not load");
  assert.equal(diffSummary(diff),
    "No differences in the data or options. The numbers of 1 analysis could not be compared.");
  const failed = compareProjects(side(a, ttest(REF.before)), side(a, { error: "too few values" }));
  assert.equal(failed.analyses[0].status, "error");
  assert.match(failed.analyses[0].note ?? "", /failed in the later one: too few values/);
});

test("sheets added, removed and matched by name when ids differ; long cell lists are capped", () => {
  const a = load();
  const b = edit(a, (d) => {
    d.id = "other-id";
    d.table.datasets[0].rows = Array.from({ length: 80 }, (_, i) => [String(i)]);
    d.table.datasets[1].rows = Array.from({ length: 80 }, () => [""]);
    d.table.x = Array.from({ length: 80 }, () => "");
    d.table.rowTitles = Array.from({ length: 80 }, () => "");
  });
  b.sheets.push({ ...structuredClone(b.sheets[1]), id: "r2", name: "Second test" } as ResultsSheet);
  b.title = "Study, revised";
  const r = ttest(REF.before);
  const diff = compareProjects(side(a, r), side(b, r));
  assert.deepEqual(diff.added, ["Results “Second test”"]);
  assert.deepEqual(diff.removed, []);
  assert.ok(diff.tables[0].notes.includes("rows: 6 → 80"));
  assert.equal(diff.tables[0].cells.length, MAX_CELLS);
  assert.ok(diff.tables[0].cellsMore > 0);
  assert.deepEqual(diff.title, { before: "Study", after: "Study, revised" });
});

test("numbers that moved rank before numbers present on one side only, P first", () => {
  const c = (path: string, kind: "p" | "param" | "other", before: number | null, after: number | null) =>
    ({ path, label: path, kind, before, after });
  const ranked = rankChanges({ compared: 6, changed: [
    c("points[3].value", "other", 13.1, null),
    c("points[2].index", "other", 0, 1),
    c("mean", "other", 10, 11),
    c("sd", "other", 1, 3),
    c("ttest.p", "p", 0.1, 0.003),
  ] });
  // summary numbers before per-point lists; gone numbers last
  assert.deepEqual(ranked.map((x) => x.path), ["ttest.p", "sd", "mean", "points[2].index", "points[3].value"]);
});

test("a change from next to zero has no runaway percentage", () => {
  const a = load();
  const res = (v: number) => ({ analysis: "column", ttest: { t: 1, p: 0.5, df: 9, residual_mean: v } });
  const diff = compareProjects(side(a, res(1.464e-15)), side(a, res(-0.8888)));
  const line = diff.analyses[0].changes.find((x) => /Residual mean/i.test(x.label));
  assert.ok(line, JSON.stringify(diff.analyses[0].changes));
  assert.doesNotMatch(line.text, /%/);
  assert.match(line.text, /→ -0\.8888$/);
});
