// Exercise links for teaching (P-126, share/exercise.ts): reading the
// exercise, masking the analyses' names, the student's choice against the
// link's analyses, and that links without an exercise decode exactly as
// before. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDataSheet, makeProject, makeResultsSheet } from "../../project/ops.ts";
import { serializeProject } from "../../project/persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { normalizeTable } from "../../project/table.ts";
import { readShareBoot } from "../boot.ts";
import {
  cleanTask, exerciseOutcome, maskProject, MAX_TASK_LENGTH, namesText, parseExercise, unmaskProject,
} from "../exercise.ts";
import { makeFragment, readFragment } from "../link.ts";
import { makeProtectedFragment, unprotectJson } from "../protect.ts";

const prefs = projectPrefs(DEFAULT_PREFS);
const TTEST = { analysis: "ttest", ttestKind: "unpaired" };
function project() {
  const t = normalizeTable({ type: "column", datasets: [
    { name: "Control", rows: [["23.1"], ["25.4"], ["21.8"], ["24.9"], ["22.6"], ["26.0"]] },
    { name: "Treated", rows: [["28.4"], ["30.2"], ["27.1"], ["31.5"], ["29.0"], ["28.8"]] }] });
  return makeProject(prefs, [makeDataSheet("d1", "Pipetting", t),
    makeResultsSheet("r1", "d1", "column", TTEST, "Unpaired t test")], "Old link");
}
const ids = () => { let n = 0; return () => `id${n++}`; };
const TASK = "Which test compares these two groups? Then read its P value.";

/** A share link made by main at 380d941 (before exercises) for project()
 *  with one cached result, its fingerprint and the sheet on screen. */
const OLD_LINK = "#p=bVLBasMwDP2V4nMxabp2ba-DwehgO7SnEoKTmNWrYxtbWRdC_n1SnGUdFAJ-epKeXyR3zDppKhtk7rz9lCWwXTpnX9IHZc2AQYGWbMfedDXTylzYnAWpsVJWyPoFxWcpIbDdqWOKyIrIizIDFiAwMqImkXflJIAyH0iBKEi4Y9A6ypVWN7XBxDcqMTz_fRnyh9EK1TxbXwt0y0xTF2iXuKNRxCBsb0q9vQ4RGbwnSw7Dr__R55M14K2O3ZQ5sXTJF1iOYMUfIljwTQQPfBtBytcRrHnCsqyfT4oHLwWN7FZxMwotE57GtsfxjuWCryKzJSECG7os69FwaIo4q2kGXjqtStSnMUzBq2htQ-mgKpkXbU4n68nUsKZhd-OavAyNxhnMmRNeGniZ9iiM0G1QaPlvQ9YBPg-kuts04P1Ai6VzH3Ub44Ty-N_99AaOIzWD2dhQivJMr-mumsvhanMQSlNJwpMkSdMtysWuvWyx-IJz67P-Bw";
const OLD_OPTS = { keys: new Map([["r1", "k.1"]]), selected: "r1" };
const OLD_RESULTS = new Map<string, unknown>([["r1", { analysis: "ttest", p_two_tailed: 0.000229 }]]);

test("a saved link from before exercises decodes as it did, with no exercise", () => {
  const boot = readShareBoot(prefs, ids(), OLD_LINK);
  assert.equal(boot.error, "");
  assert.equal(boot.exercise, null);
  assert.equal(boot.selected, "r1");
  assert.equal(boot.project?.title, "Old link");
  assert.deepEqual(boot.project?.sheets.map((s) => s.name), ["Pipetting", "Unpaired t test"]);
  assert.equal("exercise" in (readFragment(OLD_LINK) as object), false);
  // and a link made now without an exercise is the very same text
  const now = makeFragment(project(), OLD_RESULTS, undefined, OLD_OPTS);
  assert.ok(now.ok);
  assert.equal(now.ok && now.fragment, OLD_LINK);
});

test("the exercise travels in the link, with or without the results, and in protected links", async () => {
  const exercise = { task: TASK, hideTest: true };
  const full = makeFragment(project(), OLD_RESULTS, undefined, { ...OLD_OPTS, exercise });
  assert.ok(full.ok && full.withResults);
  assert.deepEqual(readShareBoot(prefs, ids(), full.ok ? full.fragment : "").exercise, exercise);
  // too large with the results: the bare link keeps the exercise (and the selection)
  const bare = makeFragment(project(), OLD_RESULTS, (full.ok ? full.length : 0) - 1,
    { ...OLD_OPTS, exercise: { task: TASK, hideTest: false } });
  assert.ok(bare.ok && !bare.withResults);
  const b = readShareBoot(prefs, ids(), bare.ok ? bare.fragment : "");
  assert.deepEqual(b.exercise, { task: TASK, hideTest: false });
  assert.equal(b.selected, "r1");
  const sealed = await makeProtectedFragment(project(), "pw-0123456789", undefined, undefined,
    { exercise }, 1000);
  assert.ok(sealed.ok);
  const json = JSON.parse(await unprotectJson(sealed.ok ? sealed.fragment.slice(3) : "", "pw-0123456789"));
  assert.deepEqual(json.exercise, exercise);
  // a project file never carries it
  assert.equal(serializeProject(project()).includes("exercise"), false);
});

test("an exercise is read strictly: a task is required", () => {
  assert.equal(parseExercise(undefined), null);
  assert.equal(parseExercise("x"), null);
  assert.equal(parseExercise([]), null);
  assert.equal(parseExercise({ task: "   " }), null);
  assert.deepEqual(parseExercise({ task: ` ${TASK}\r\n` }), { task: TASK, hideTest: true });
  assert.deepEqual(parseExercise({ task: TASK, hideTest: false }), { task: TASK, hideTest: false });
  assert.equal(cleanTask("a".repeat(MAX_TASK_LENGTH + 50)).length, MAX_TASK_LENGTH);
});

test("withholding the test: neutral names, put back on reveal", () => {
  const p = project();
  const plain = maskProject(p, { task: TASK, hideTest: false });
  assert.equal(plain.project, p);
  const { project: masked, names } = maskProject(p, { task: TASK, hideTest: true });
  assert.deepEqual(masked.sheets.map((s) => s.name), ["Pipetting", "Analysis 1"]);
  assert.deepEqual(names, { r1: "Unpaired t test" });
  assert.deepEqual(unmaskProject(masked, names), p);
  assert.equal(unmaskProject(p, {}), p);
});

test("the student's choice against the link's analyses (P-32's chooser record)", () => {
  const { project: masked, names } = maskProject(project(), { task: TASK, hideTest: true });
  const hit = exerciseOutcome(masked, names, { test: "Unpaired t test", reason: "r",
    analysis: "column", options: { analysis: "ttest", ttestKind: "unpaired" } });
  assert.deepEqual(hit, { analyses: ["Unpaired t test"], matching: ["Unpaired t test"] });
  const miss = exerciseOutcome(masked, names, { test: "Mann-Whitney test", reason: "r",
    analysis: "column", options: { analysis: "ttest", ttestKind: "mann_whitney" } });
  assert.deepEqual(miss.matching, []);
  const none = exerciseOutcome(masked, names, { test: "Something else", reason: "r",
    analysis: "", options: {} });
  assert.deepEqual(none.matching, []);
  assert.equal(namesText(["A", "B", "C"]), "“A”, “B” and “C”");
});
