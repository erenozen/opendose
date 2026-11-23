// P-58: reproduction records are saved with the project
// (Project.reproductions), read back checked, capped, and files and share
// links from before load unchanged. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sequentialIds } from "../ids.ts";
import { makeDataSheet, makeProject } from "../ops.ts";
import { parseProjectFile, projectFromJson, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import {
  MAX_REPRODUCTIONS, openedHow, parseReproduction, parseReproductions, withReproduction,
  type ReproductionReport,
} from "../reproduce.ts";
import { emptyTable } from "../table.ts";
import { familyProject, shareJson } from "../../share/link.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const ids = () => sequentialIds("n");

const REPORT: ReproductionReport = {
  file: "saved-with-0.2.0.json",
  savedWith: { app: "0.2.0", engine: "e0", libraries: { scipy: "1.14.1" } },
  current: { app: "0.4.0", commit: "abc1234", engine: "e1", libraries: { scipy: "1.16.0" } },
  checkedAt: "2026-11-23T10:00:00.000Z",
  digits: 4,
  sheets: [
    { sheetId: "r1", name: "t test of Pilot", analysis: "ttest", status: "changed", compared: 12,
      changes: [{ path: "p", what: "P", context: ["Control vs Treated"], saved: 0.0234, now: 0.0312, p: true },
        { path: "n_b", what: "n", context: ["Treated"], saved: 6, now: null, p: false }] },
    { sheetId: "r2", name: "Fit", analysis: "nonlin", status: "skipped", compared: 0, changes: [],
      note: "its data or options changed before the check finished" },
  ],
};

const base = () => makeProject(prefs, [makeDataSheet("d1", "Pilot", emptyTable("column"))]);

test("a finished check is saved with the project and read back as it was", () => {
  const p = withReproduction(base(), REPORT);
  const back = parseProjectFile(serializeProject(p), { prefs, ids: ids() });
  assert.deepEqual(back.reproductions, [REPORT]);
});

test("records from an autosave or a share link keep their source", () => {
  const auto = { ...REPORT, source: "autosave" as const, file: "Assay" };
  const link = { ...REPORT, source: "link" as const, file: "Assay", checkedAt: "2026-11-23T11:00:00.000Z" };
  const p = withReproduction(withReproduction(base(), auto), link);
  const back = projectFromJson(JSON.parse(shareJson(p)), { prefs, ids: ids() });
  assert.deepEqual(back.reproductions, [auto, link]);
  assert.equal(openedHow(REPORT), "reopening “saved-with-0.2.0.json”");
  assert.equal(openedHow(auto), "restoring the autosave of “Assay”");
  assert.equal(openedHow(link), "opening the share link of “Assay”");
});

test("records are kept newest last, at most MAX_REPRODUCTIONS; the same check is kept once", () => {
  let p = base();
  for (let i = 0; i < MAX_REPRODUCTIONS + 5; i++) {
    p = withReproduction(p, { ...REPORT, checkedAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString() });
  }
  assert.equal(p.reproductions?.length, MAX_REPRODUCTIONS);
  assert.equal(p.reproductions?.[0].checkedAt, new Date(Date.UTC(2026, 10, 1, 0, 5)).toISOString());
  const again = withReproduction(p, p.reproductions![MAX_REPRODUCTIONS - 1]);
  assert.equal(again.reproductions?.length, MAX_REPRODUCTIONS);
  // a file holding more than the cap keeps the newest
  const many = Array.from({ length: 30 }, (_, i) => ({ ...REPORT, file: `f${i}.json` }));
  assert.deepEqual(parseReproductions(many).map((r) => r.file), many.slice(-MAX_REPRODUCTIONS).map((r) => r.file));
});

test("a malformed record is dropped whole; the others and the project still load", () => {
  const bad: unknown[] = [
    null, "x", { ...REPORT, file: "" }, { ...REPORT, checkedAt: "yesterday" }, { ...REPORT, digits: 0 },
    { ...REPORT, digits: 2.5 }, { ...REPORT, current: null }, { ...REPORT, savedWith: { app: 3 } },
    { ...REPORT, source: "email" }, { ...REPORT, sheets: "all" },
    { ...REPORT, sheets: [{ ...REPORT.sheets[0], status: "fine" }] },
    { ...REPORT, sheets: [{ ...REPORT.sheets[0], compared: -1 }] },
    { ...REPORT, sheets: [{ ...REPORT.sheets[0], changes: [{ ...REPORT.sheets[0].changes[0], saved: "0.02" }] }] },
    { ...REPORT, sheets: [{ ...REPORT.sheets[0], changes: [{ ...REPORT.sheets[0].changes[0], context: [1] }] }] },
  ];
  for (const b of bad) assert.equal(parseReproduction(b), null, JSON.stringify(b).slice(0, 80));
  // a file without savedWith recorded (null) is a valid record
  assert.deepEqual(parseReproduction({ ...REPORT, savedWith: null }), { ...REPORT, savedWith: null });
  const json = JSON.parse(serializeProject(withReproduction(base(), REPORT)));
  json.reproductions = [...bad, REPORT];
  const p = projectFromJson(json, { prefs, ids: ids() });
  assert.deepEqual(p.reproductions, [REPORT]);
  json.reproductions = "none";
  assert.equal("reproductions" in projectFromJson(json, { prefs, ids: ids() }), false);
});

test("no records: the file has no reproductions key", () => {
  assert.equal("reproductions" in JSON.parse(serializeProject(base())), false);
  assert.equal("reproductions" in JSON.parse(serializeProject({ ...base(), reproductions: [] })), false);
});

test("sharing one family leaves the project's records out", () => {
  const p = withReproduction(base(), REPORT);
  assert.equal(familyProject(p, "d1")?.reproductions, undefined);
  assert.equal("reproductions" in JSON.parse(shareJson(familyProject(p, "d1")!)), false);
});

test("a project saved before records were kept opens unchanged", () => {
  // potency-experiments.json was saved by the app before P-58.
  const text = readFileSync(new URL("../../../e2e-fixtures/potency-experiments.json", import.meta.url), "utf8");
  const before = JSON.parse(text);
  const p = parseProjectFile(text, { prefs, ids: ids() });
  assert.equal("reproductions" in p, false);
  const again = JSON.parse(serializeProject(p));
  assert.deepEqual(again.sheets, before.sheets);
  assert.equal(again.title, before.title);
});
