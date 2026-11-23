// P-61: the study design record on an info sheet (project/studyDesign.ts):
// reading saved records, the methods sentences, the ARRIVE 2.0 item 4, 5
// and 8 outcomes, where a table's record lives, opening a project saved
// before the record existed, and the file and .pzfx round trips.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs build script, no type declarations
import { projectSchemaErrors } from "../../../scripts/validate-project.mjs";
import { evaluateChecklists } from "../../report/checklists.ts";
import { pzfxInfo } from "../../share/pzfx.ts";
import { sequentialIds } from "../ids.ts";
import { makeDataSheet, makeInfoSheet, makeProject } from "../ops.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import {
  animalsOutcome, blindingOutcome, blindingSentence, designMethodsSentence, designSheetFor,
  emptyDesign, parseStudyDesign, randomisationOutcome, randomisationSentence, setDesign,
  startDesign, type StudyDesign,
} from "../studyDesign.ts";
import { emptyTable } from "../table.ts";
import type { InfoSheet, Project } from "../types.ts";

const errorsOf = projectSchemaErrors as (json: unknown) => string[];
const here = dirname(fileURLToPath(import.meta.url));
const prefs = projectPrefs(DEFAULT_PREFS);

const FULL: StudyDesign = {
  randomised: "yes", randomisationMethod: "block randomisation (blocks of 4), stratified by sex",
  seed: "20261123",
  blinding: { allocation: "blinded", conduct: "aware", outcome: "blinded", analysis: "aware" },
  exclusionCriteria: "set before the study: animals reaching the humane endpoint before day 21",
  sex: "both", strain: "C57BL/6J mice", age: "8 to 10 weeks",
};

const project = (...extra: InfoSheet[]): Project => makeProject(prefs, [
  makeDataSheet("d1", "Tumour volume", emptyTable("column")), ...extra], "Study");

test("saved records are read field by field; anything unusable is dropped", () => {
  assert.equal(parseStudyDesign(undefined), undefined);
  assert.equal(parseStudyDesign(null), undefined);
  assert.equal(parseStudyDesign([1, 2]), undefined);
  assert.equal(parseStudyDesign("random"), undefined);
  assert.deepEqual(parseStudyDesign({}), emptyDesign());
  assert.deepEqual(parseStudyDesign(FULL), FULL);
  const odd = parseStudyDesign({ randomised: "maybe", seed: 42, sex: "M",
    blinding: { allocation: "blinded", outcome: "yes", other: "aware" }, strain: "Wistar rats" })!;
  assert.equal(odd.randomised, undefined);
  assert.equal(odd.seed, "");
  assert.equal(odd.sex, undefined);
  assert.deepEqual(odd.blinding, { allocation: "blinded" });
  assert.equal(odd.strain, "Wistar rats");
});

test("the methods text names the randomisation method and the seed", () => {
  assert.equal(randomisationSentence(FULL), "Experimental units were allocated to groups at random "
    + "(block randomisation (blocks of 4), stratified by sex; seed 20261123).");
  assert.equal(randomisationSentence({ ...FULL, seed: " " }),
    "Experimental units were allocated to groups at random (block randomisation (blocks of 4), stratified by sex).");
  assert.equal(randomisationSentence({ ...FULL, randomisationMethod: "", seed: "7" }),
    "Experimental units were allocated to groups at random (seed 7).");
  assert.equal(randomisationSentence({ ...FULL, randomised: "no", randomisationMethod: "by litter." }),
    "Allocation to groups was not randomised (by litter).");
  assert.equal(randomisationSentence(emptyDesign()), null);
  assert.equal(designMethodsSentence(FULL),
    "Experimental units were allocated to groups at random (block randomisation (blocks of 4), "
    + "stratified by sex; seed 20261123). The investigators were blinded to group allocation during "
    + "allocation and outcome assessment, and aware of it during the conduct of the experiment and "
    + "data analysis. Inclusion and exclusion criteria: set before the study: animals reaching the "
    + "humane endpoint before day 21. Animals: C57BL/6J mice; sex female and male; age 8 to 10 weeks.");
  assert.equal(designMethodsSentence(emptyDesign()), null);
});

test("blinding is stated only for the stages answered", () => {
  const all = (v: "blinded" | "aware") => ({ ...emptyDesign(),
    blinding: { allocation: v, conduct: v, outcome: v, analysis: v } });
  assert.equal(blindingSentence(all("blinded")), "The investigators were blinded to group allocation at "
    + "every stage (allocation, the conduct of the experiment, outcome assessment and data analysis).");
  assert.equal(blindingSentence(all("aware")), "The investigators were aware of group allocation at every stage.");
  assert.equal(blindingSentence({ ...emptyDesign(), blinding: { analysis: "aware" } }),
    "The investigators were aware of group allocation during data analysis.");
  assert.equal(blindingSentence({ ...emptyDesign(), blinding: { outcome: "blinded" } }),
    "The investigators were blinded to group allocation during outcome assessment.");
  assert.equal(blindingSentence(emptyDesign()), null);
});

test("ARRIVE 2.0 items 4, 5 and 8: met only when stated in full", () => {
  assert.equal(randomisationOutcome(FULL).met, true);
  assert.match(randomisationOutcome(FULL).reason, /seed 20261123/);
  assert.match(randomisationOutcome({ ...FULL, seed: "" }).reason, /no seed recorded/);
  assert.equal(randomisationOutcome(emptyDesign()).met, false);
  assert.equal(randomisationOutcome({ ...FULL, randomisationMethod: " " }).met, false);
  assert.equal(randomisationOutcome({ ...emptyDesign(), randomised: "no" }).met, true);
  assert.equal(blindingOutcome(FULL).met, true);
  const part = blindingOutcome({ ...FULL, blinding: { allocation: "blinded", outcome: "blinded" } });
  assert.equal(part.met, false);
  assert.equal(part.reason, "Say who knew the group allocation during the conduct of the experiment and data analysis.");
  assert.equal(animalsOutcome(FULL).met, true);
  const noSex = animalsOutcome({ ...FULL, sex: undefined, age: "" });
  assert.equal(noSex.met, false);
  assert.equal(noSex.reason, "State the animals' sex and age.");
});

test("the ARRIVE checklist ticks items 4, 5 and 8 from the record", () => {
  const base = {
    dataId: "d1", dataName: "Tumour volume", results: [], graphs: [], meta: {}, excludedCount: 0,
    minN: null, powerJustification: null, software: "OpenDose", normalityChecked: false,
  };
  const arrive = (design: { design: StudyDesign; sheetId: string } | null) =>
    evaluateChecklists({ ...base, design }).find((l) => l.id === "arrive")!.items;
  const none = arrive(null);
  for (const id of ["e4", "e5", "e8"]) {
    const it = none.find((i) => i.id === id)!;
    assert.equal(it.status, "unmet", id);
    assert.match(it.reason, /^No study design recorded/);
    assert.deepEqual(it.fix, { kind: "design", label: "Record the study design" });
  }
  const full = arrive({ design: FULL, sheetId: "i1" });
  for (const id of ["e4", "e5", "e8"]) assert.equal(full.find((i) => i.id === id)!.status, "met", id);
  assert.match(full.find((i) => i.id === "e4")!.text, /^4\. Randomisation/);
  const half = arrive({ design: { ...FULL, age: "" }, sheetId: "i1" }).find((i) => i.id === "e8")!;
  assert.equal(half.status, "unmet");
  assert.deepEqual(half.fix, { kind: "design", sheetId: "i1", label: "Open the study design" });
});

test("a table's record: its own info sheet first, else the project's", () => {
  const own = { ...makeInfoSheet("i1", "Mine", "d1"), design: FULL };
  const wide = { ...makeInfoSheet("i2", "Project info"), design: { ...FULL, seed: "1" } };
  const other = { ...makeInfoSheet("i3", "Other", "d9"), design: FULL };
  assert.equal(designSheetFor(project(wide, own), "d1")?.id, "i1");
  assert.equal(designSheetFor(project(wide, other), "d1")?.id, "i2");
  assert.equal(designSheetFor(project(other), "d1"), null);
  assert.equal(designSheetFor(project(makeInfoSheet("i4", "No record", "d1")), "d1"), null);
});

test("starting a record uses the table's info sheet, else makes one", () => {
  const plan = makeInfoSheet("i1", "Analysis plan: Tumour volume", "d1");
  const a = startDesign(project(plan), "d1", sequentialIds("n"));
  assert.equal(a.sheetId, "i1");
  assert.deepEqual((a.project.sheets[1] as InfoSheet).design, emptyDesign());
  const b = startDesign(project(), "d1", sequentialIds("n"));
  const made = b.project.sheets.find((s) => s.id === b.sheetId) as InfoSheet;
  assert.equal(made.name, "Study design: Tumour volume");
  assert.equal(made.parentId, "d1");
  assert.deepEqual(made.design, emptyDesign());
  // an existing record is kept as it is
  const kept = startDesign(setDesign(a.project, "i1", FULL), "d1", sequentialIds("n"));
  assert.deepEqual((kept.project.sheets[1] as InfoSheet).design, FULL);
});

test("a project saved before the record existed opens unchanged", () => {
  // e2e-fixtures/stage/row-ids.json was saved before P-61 (no `design` key).
  const text = readFileSync(join(here, "..", "..", "..", "e2e-fixtures", "stage", "row-ids.json"), "utf8");
  assert.ok(!text.includes("\"design\""));
  const p = parseProjectFile(text, { prefs, ids: sequentialIds("n") });
  const info = p.sheets.filter((s) => s.kind === "info");
  assert.ok(info.length >= 1);
  for (const s of info) assert.equal("design" in s, false);
  const again = serializeProject(p);
  assert.ok(!again.includes("\"design\""));
  assert.deepEqual(parseProjectFile(again, { prefs, ids: sequentialIds("n") }), p);
  assert.deepEqual(errorsOf(JSON.parse(again)), []);
});

test("a record survives saving and opening, and validates against the schema", () => {
  const p = project({ ...makeInfoSheet("i1", "Design", "d1"), design: FULL });
  const text = serializeProject(p);
  assert.deepEqual(errorsOf(JSON.parse(text)), []);
  const back = parseProjectFile(text, { prefs, ids: sequentialIds("n") });
  assert.deepEqual((back.sheets[1] as InfoSheet).design, FULL);
  assert.deepEqual(JSON.parse(serializeProject(back)), JSON.parse(text));
  // the schema refuses a record OpenDose never writes
  const bad = JSON.parse(text);
  bad.sheets[1].design.randomised = "sometimes";
  assert.ok(errorsOf(bad).length > 0);
});

test(".pzfx export: the record goes into the Info sheet's notes", () => {
  const p = project({ ...makeInfoSheet("i1", "Design", "d1"), notes: "Pilot.", design: FULL });
  const [info] = pzfxInfo(p, "d1");
  assert.equal(info.notes, `Pilot.\n\nStudy design\n${designMethodsSentence(FULL)}`);
  // an empty record adds nothing, and alone does not make a sheet worth writing
  const empty = project({ ...makeInfoSheet("i1", "Design", "d1"), design: emptyDesign() });
  assert.deepEqual(pzfxInfo({ ...empty, sheets: empty.sheets.map((s) => (s.kind === "info"
    ? { ...s, constants: [] } : s)) }, "d1"), []);
});
