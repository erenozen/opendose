// Values left out of one analysis only (P-68, project/leftOut.ts): the
// identity with a table-level exclusion, the migration of files saved
// before it existed, and the rules (a reason always, the table never
// changed). Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// app/analysis.ts resultKey hashes exactly this text (with the build stamp)
const resultKey = (a: string, o: unknown, t: unknown) => JSON.stringify([a, o, t]);
import { exclusionGroups, exclusionSentence, setReasons } from "../exclusions.ts";
import {
  analysisTable, leftOutClause, leftOutProblem, leftOutRows, leftOutState, parseLeftOut,
  sheetTable, withLeftOut, withoutLeftOut,
} from "../leftOut.ts";
import { duplicateSheet, makeDataSheet, makeProject, makeResultsSheet } from "../ops.ts";
import { parseProjectFile, projectFromJson, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { replayPlanOf } from "../replay.ts";
import { deleteRow, normalizeTable, numericData, toggleExcluded, type CellRef } from "../table.ts";
import type { DataSheet, DataTableModel, LeftOutValue, Project, ResultsSheet } from "../types.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "..", "..", "e2e-fixtures");

/** The built-in "Two-group t test" template's table (app/templates.ts). */
function twoGroups(): DataTableModel {
  return normalizeTable({
    type: "column",
    datasets: [
      { name: "Control", rows: [["23.1"], ["25.4"], ["21.8"], ["24.9"], ["22.6"], ["26.0"]] },
      { name: "Treated", rows: [["28.4"], ["30.2"], ["27.1"], ["31.5"], ["29.0"], ["28.8"]] },
    ],
  });
}
const C3 = { dataset: 0, row: 2, sub: 0 };
const C3_REF: CellRef = { kind: "y", ...C3 };
const REASON = "pipetting error noted";
const TTEST = { analysis: "ttest", ttestKind: "unpaired" };

function project(): Project {
  return makeProject(prefs, [
    makeDataSheet("d1", "t test", twoGroups()),
    makeResultsSheet("r1", "d1", "column", TTEST, "Unpaired t test"),
  ], "P");
}
const res = (p: Project, id: string) => p.sheets.find((s) => s.id === id) as ResultsSheet;
const data = (p: Project) => p.sheets.find((s) => s.id === "d1") as DataSheet;

test("identity: leaving a value out of one analysis is excluding it in the table", () => {
  const t = twoGroups();
  const lo: LeftOutValue[] = [{ ...C3, value: "21.8", reason: REASON }];
  const tableLevel = setReasons(toggleExcluded(t, C3_REF), [C3_REF], REASON);
  const perAnalysis = analysisTable(t, lo);
  assert.deepEqual(perAnalysis, tableLevel);
  // the very same engine input and fingerprint, so the very same numbers
  assert.equal(JSON.stringify(perAnalysis), JSON.stringify(tableLevel));
  assert.deepEqual(numericData(perAnalysis), numericData(tableLevel));
  assert.equal(resultKey("column", TTEST, perAnalysis), resultKey("column", TTEST, tableLevel));
  assert.equal(numericData(perAnalysis).datasets[0].ys.flat().filter((v) => v !== null).length, 5);
  // the table itself is untouched
  assert.deepEqual(t, twoGroups());
});

test("no left-out values: the analysis sees the table itself (same object, same key)", () => {
  const t = twoGroups();
  assert.equal(analysisTable(t, undefined), t);
  assert.equal(analysisTable(t, []), t);
  assert.equal(sheetTable(null, t), t);
  // applying twice changes nothing (useAnalysisResult may get it applied)
  const once = analysisTable(t, [{ ...C3, value: "21.8", reason: REASON }]);
  assert.equal(analysisTable(once, [{ ...C3, value: "21.8", reason: REASON }]), once);
});

test("acceptance: the duplicated t test leaves one value out with its reason; the original is unchanged", () => {
  let p = project();
  p = duplicateSheet(p, "r1", () => "r2");
  const before = JSON.stringify(res(p, "r1"));
  p = withLeftOut(p, "r2", [C3], REASON);
  const copy = res(p, "r2");
  assert.deepEqual(copy.leftOut, [{ ...C3, value: "21.8", reason: REASON }]);
  assert.equal(JSON.stringify(res(p, "r1")), before, "the original analysis is unchanged");
  assert.equal(res(p, "r1").leftOut, undefined);
  assert.deepEqual(data(p).table, twoGroups(), "the value stays in the table");
  // n drops by one in the copy only
  const nOf = (s: ResultsSheet) => exclusionGroups(sheetTable(s, data(p).table))!
    .map((g) => `${g.name} ${g.entered}/${g.analysed}`);
  assert.deepEqual(nOf(res(p, "r1")), ["Control 6/6", "Treated 6/6"]);
  assert.deepEqual(nOf(copy), ["Control 6/5", "Treated 6/6"]);
  // the Exclusions block and the methods name it
  assert.equal(exclusionSentence(sheetTable(copy, data(p).table)),
    "Control, n = 6 enrolled, 5 analysed (1 excluded: pipetting error noted); no exclusions in Treated");
  assert.equal(leftOutClause(data(p).table, copy.leftOut),
    "1 value left out of this analysis only, as a sensitivity analysis (it stays in the table and "
    + "in the other analyses): Control, row 3 (21.8; pipetting error noted)");
  assert.equal(leftOutClause(data(p).table, res(p, "r1").leftOut), null);
  // put back: the key goes, so the sheet is as it was
  p = withoutLeftOut(p, "r2", "0:2:0");
  assert.equal(res(p, "r2").leftOut, undefined);
  assert.equal("leftOut" in res(p, "r2"), false);
});

test("never without a reason, never a blank or already-excluded cell", () => {
  const p = project();
  assert.equal(withLeftOut(p, "r1", [C3], "   "), p, "no reason: nothing changes");
  const t = data(p).table;
  assert.match(leftOutProblem(t, { dataset: 0, row: 9, sub: 0 }), /Choose a cell/);
  const blank = normalizeTable({ ...t, datasets: [{ ...t.datasets[0], rows: [[""], ["1"]] }] });
  assert.match(leftOutProblem(blank, { dataset: 0, row: 0, sub: 0 }), /blank/);
  const excl = toggleExcluded(t, C3_REF);
  assert.match(leftOutProblem(excl, C3), /already excluded in the table/);
  const once = withLeftOut(p, "r1", [C3], REASON);
  assert.match(leftOutProblem(t, C3, res(once, "r1").leftOut), /already left out/);
  assert.equal(withLeftOut(once, "r1", [C3], REASON), once, "leaving it out twice changes nothing");
});

test("a cell that changed is not left out, and says so", () => {
  let p = withLeftOut(project(), "r1", [C3], REASON);
  const lo = res(p, "r1").leftOut;
  // a row above it deleted: row 3 now holds 24.9, not 21.8
  const moved = deleteRow(data(p).table, 0);
  assert.equal(leftOutState(moved, lo![0]), "changed");
  assert.equal(analysisTable(moved, lo), moved, "nothing else is left out in its place");
  assert.equal(leftOutRows(moved, lo)[0].state, "changed");
  assert.equal(leftOutClause(moved, lo), null);
  // excluded in the table later: every analysis leaves it out anyway
  const excl = toggleExcluded(data(p).table, C3_REF);
  assert.equal(leftOutState(excl, lo![0]), "in-table");
  assert.equal(analysisTable(excl, lo), excl);
  // an edited value is "changed" too
  p = { ...p };
  const edited = normalizeTable({ ...data(p).table, datasets: [
    { ...data(p).table.datasets[0], rows: [["23.1"], ["25.4"], ["21.9"], ["24.9"], ["22.6"], ["26.0"]] },
    data(p).table.datasets[1]] });
  assert.equal(leftOutState(edited, lo![0]), "changed");
});

test("leftOut is read from files strictly", () => {
  assert.equal(parseLeftOut(undefined), undefined);
  assert.equal(parseLeftOut([]), undefined);
  assert.equal(parseLeftOut("x"), undefined);
  assert.deepEqual(parseLeftOut([
    { dataset: 0, row: 2, sub: 0, value: "21.8", reason: "  pipetting   error " },
    { dataset: 0, row: 2, sub: 0, value: "21.8", reason: "duplicate" },
    { dataset: -1, row: 0, sub: 0, value: "1", reason: "r" },
    { dataset: 0, row: 1.5, sub: 0, value: "1", reason: "r" },
    { dataset: 0, row: 1, sub: 0, value: 1, reason: "r" },
    { dataset: 0, row: 1, sub: 0, value: "1", reason: "" },
    null,
  ]), [{ dataset: 0, row: 2, sub: 0, value: "21.8", reason: "pipetting error" }]);
});

test("saved and reopened: the left-out values travel with the file and the share link JSON", () => {
  const p = withLeftOut(project(), "r1", [C3], REASON);
  const back = parseProjectFile(serializeProject(p), { prefs, ids: () => "x" });
  assert.deepEqual(res(back, "r1").leftOut, res(p, "r1").leftOut);
  // the replay plan (Apply to new data) drops them: they name cells of these data
  const plan = replayPlanOf(p) as { sheets: Record<string, unknown>[] };
  assert.equal(plan.sheets.find((s) => s.id === "r1")!.leftOut, undefined);
});

test("migration: every project saved before P-68 opens unchanged and computes the same input", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name.endsWith(".json")) files.push(join(d, e.name));
    }
  };
  walk(FIXTURES);
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const raw = JSON.parse(text);
    if (raw?.opendose_project === undefined) continue;
    assert.equal(text.includes("leftOut"), false, `${f} predates P-68`);
    let n = 0;
    const p = projectFromJson(raw, { prefs, ids: () => `id${n++}` });
    for (const s of p.sheets) {
      if (s.kind !== "results") continue;
      assert.equal("leftOut" in s, false);
      const d = p.sheets.find((x) => x.id === s.parentId) as DataSheet | undefined;
      if (d?.kind !== "data") continue;
      // the analysis sees the very table it saw before: same fingerprint
      assert.equal(sheetTable(s, d.table), d.table);
      assert.equal(resultKey(s.analysis, s.options, sheetTable(s, d.table)),
        resultKey(s.analysis, s.options, d.table));
      checked++;
    }
    // saved again, no key appears
    assert.equal(serializeProject(p).includes("leftOut"), false);
  }
  assert.ok(checked >= 17, `${checked} results sheets checked`);
});
