// P-32: the reason Help me choose gave is saved with the results sheet it
// opened (ResultsSheet.chosen), survives saving, reopening and a share
// link, reaches the methods paragraph, and is dropped once an option the
// chooser set is changed. Files saved before it load unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentChoice, parseChosen, withChoice, withoutChoice } from "../choice.ts";
import { sequentialIds } from "../../project/ids.ts";
import { makeDataSheet, makeProject, makeResultsSheet } from "../../project/ops.ts";
import { parseProjectFile, projectFromJson, serializeProject } from "../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { emptyTable } from "../../project/table.ts";
import type { ResultsSheet } from "../../project/types.ts";
import { statsMethodsParagraph } from "../../report/methods.ts";
import { DEFAULT_REPORT } from "../../report/prefs.ts";
import { shareJson } from "../../share/link.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const fixtures = JSON.parse(readFileSync(new URL("../../report/__tests__/fixtures.json",
  import.meta.url), "utf8")) as Record<string, { result: unknown }>;

const WELCH = {
  test: "Unpaired t test with Welch's correction",
  reason: "Two independent groups. Welch's t test does not assume the two populations have equal SDs.",
  analysis: "column",
  options: { analysis: "ttest", ttestKind: "welch" },
};

function project() {
  return withChoice(makeProject(prefs, [
    makeDataSheet("d1", "Pilot", emptyTable("column")),
    makeResultsSheet("r1", "d1", "column", { analysis: "ttest", ttestKind: "welch", ciLevel: 0.95 },
      "t test of Pilot"),
  ]), "r1", WELCH);
}
const results = (p: ReturnType<typeof project>) => p.sheets.find((s) => s.id === "r1") as ResultsSheet;

test("the chooser's reason is saved and read back from a project file", () => {
  const back = parseProjectFile(serializeProject(project()), { prefs, ids: sequentialIds("n") });
  assert.deepEqual(results(back).chosen, WELCH);
  assert.deepEqual(currentChoice(results(back)), WELCH);
});

test("the reason travels in a share link's JSON", () => {
  const raw = JSON.parse(shareJson(project()));
  const back = projectFromJson(raw, { prefs, ids: sequentialIds("n") });
  assert.deepEqual(results(back).chosen, WELCH);
});

test("the methods paragraph says why, after reopening", () => {
  const back = parseProjectFile(serializeProject(project()), { prefs, ids: sequentialIds("n") });
  const text = statsMethodsParagraph(fixtures.ttest_welch.result, DEFAULT_REPORT, undefined,
    { chosen: currentChoice(results(back)) });
  assert.match(text, /^Data were analysed by [^.]+\. Choice of test \(OpenDose Help me choose\): Two independent groups\. Welch's t test does not assume the two populations have equal SDs\. /);
  // without a reason the paragraph is as it was
  const plain = statsMethodsParagraph(fixtures.ttest_welch.result, DEFAULT_REPORT, undefined);
  assert.equal(text.replace(` Choice of test (OpenDose Help me choose): ${WELCH.reason}`, ""), plain);
});

test("a reason without a full stop gets one; a blank reason adds nothing", () => {
  const a = statsMethodsParagraph(fixtures.ttest_welch.result, DEFAULT_REPORT, undefined,
    { chosen: { test: "x", reason: "Two groups" } });
  assert.match(a, /Choice of test \(OpenDose Help me choose\): Two groups\. /);
  const b = statsMethodsParagraph(fixtures.ttest_welch.result, DEFAULT_REPORT, undefined,
    { chosen: { test: "x", reason: "  " } });
  assert.equal(b, statsMethodsParagraph(fixtures.ttest_welch.result, DEFAULT_REPORT, undefined));
});

test("changing an option the chooser set drops the reason; other options keep it", () => {
  const s = results(project());
  assert.equal(currentChoice({ ...s, options: { ...(s.options as object), ciLevel: 0.9 } })?.test, WELCH.test);
  assert.equal(currentChoice({ ...s, options: { ...(s.options as object), ttestKind: "mann_whitney" } }), null);
  assert.equal(currentChoice({ ...s, options: {} }), null);
  assert.equal(currentChoice({ ...s, analysis: "nonlin" }), null);
  // back to the chooser's value: the reason applies again
  assert.deepEqual(currentChoice({ ...s, options: { analysis: "ttest", ttestKind: "welch" } }), WELCH);
});

test("removing the reason leaves the rest of the sheet; removing twice is a no-op", () => {
  const p = project();
  const q = withoutChoice(p, "r1");
  assert.equal(results(q).chosen, undefined);
  assert.equal("chosen" in results(q), false);
  assert.equal(results(q).name, "t test of Pilot");
  assert.equal(withoutChoice(q, "r1"), q);
  // a data sheet id is ignored
  assert.equal(withChoice(p, "d1", WELCH).sheets[0], p.sheets[0]);
});

test("malformed reasons in a file are dropped, not fatal", () => {
  for (const bad of [null, 3, "why", [], {}, { test: "t", reason: "" }, { test: "t", reason: "r" },
    { test: 1, reason: "r", analysis: "column" }]) {
    assert.equal(parseChosen(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(parseChosen({ test: " t ", reason: "r", analysis: "column", options: [1] }),
    { test: "t", reason: "r", analysis: "column", options: {} });
  const json = JSON.parse(serializeProject(project()));
  json.sheets[1].chosen = { test: 5 };
  const back = projectFromJson(json, { prefs, ids: sequentialIds("n") });
  assert.equal("chosen" in results(back), false);
});

test("a project saved before the reason was kept opens unchanged", () => {
  // rank-test.json was written by the stage fixture builder before P-32.
  const text = readFileSync(new URL("../../../e2e-fixtures/stage/rank-test.json", import.meta.url), "utf8");
  const before = JSON.parse(text);
  const p = parseProjectFile(text, { prefs, ids: sequentialIds("n") });
  for (const s of p.sheets) if (s.kind === "results") assert.equal("chosen" in s, false);
  const again = JSON.parse(serializeProject(p));
  assert.deepEqual(again.sheets, before.sheets);
});
