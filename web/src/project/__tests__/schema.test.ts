// P-60: the published project-file schema (docs/project-file.schema.json)
// is generated from the model, and every project fixture, and what
// serializeProject writes, validates against it with ajv.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs build scripts, no type declarations
import { generateSchema, SCHEMA_PATH } from "../../../scripts/project-schema.mjs";
// @ts-expect-error: as above
import { projectSchemaErrors } from "../../../scripts/validate-project.mjs";
import { withChoice } from "../../guide/choice.ts";
import { sequentialIds } from "../ids.ts";
import {
  makeDataSheet, makeGraphSheet, makeInfoSheet, makeLayoutSheet, makeProject, makeResultsSheet,
} from "../ops.ts";
import { parseProjectFile, serializeProject } from "../persist.ts";
import { DEFAULT_PREFS, projectPrefs } from "../prefs.ts";
import { withReproduction } from "../reproduce.ts";
import { emptyTable } from "../table.ts";

const errorsOf = projectSchemaErrors as (json: unknown) => string[];
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "..", "..", "e2e-fixtures");
const prefs = projectPrefs(DEFAULT_PREFS);

test("the committed schema is what the model generates now", () => {
  assert.equal(readFileSync(SCHEMA_PATH as string, "utf8"), (generateSchema as () => string)(),
    "docs/project-file.schema.json is out of date: run node scripts/project-schema.mjs from web/");
});

test("every project fixture validates against the schema", () => {
  const files = [
    ...readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).map((f) => join(FIXTURES, f)),
    ...readdirSync(join(FIXTURES, "stage")).filter((f) => f.endsWith(".json"))
      .map((f) => join(FIXTURES, "stage", f)),
  ];
  let projects = 0;
  for (const f of files) {
    const json = JSON.parse(readFileSync(f, "utf8"));
    if (json?.opendose_project === undefined) continue; // import fixtures, not projects
    projects += 1;
    assert.deepEqual(errorsOf(json), [], f);
  }
  assert.ok(projects >= 17, `${projects} project fixtures`);
});

test("what serializeProject writes validates: every sheet kind, a reason, a record, savedWith", () => {
  let p = makeProject(prefs, [
    makeDataSheet("d1", "Pilot", emptyTable("column")),
    makeInfoSheet("i1"),
    makeResultsSheet("r1", "d1", "column", { analysis: "ttest", ttestKind: "welch" }, "t test"),
    makeGraphSheet("g1", "d1", "r1", "scatter", { titles: { x: "", y: "" }, scheme: "default" }, "Graph"),
    makeLayoutSheet("l1"),
  ], "Everything");
  p = withChoice(p, "r1", { test: "Welch", reason: "Two groups.", analysis: "column",
    options: { analysis: "ttest", ttestKind: "welch" } });
  p = withReproduction(p, { file: "a.json", savedWith: null, current: { app: "0.4.0" },
    checkedAt: "2026-11-23T10:00:00.000Z", digits: 4, sheets: [
      { sheetId: "r1", name: "t test", analysis: "ttest", status: "changed", compared: 3,
        changes: [{ path: "p", what: "P", context: [], saved: 0.02, now: null, p: true }] }] });
  const text = serializeProject(p, new Map([["r1", { analysis: "ttest", p: 0.02 }]]),
    { keys: new Map([["r1", "abc.def"]]), selected: "r1", savedWith: { app: "0.4.0", engine: "e" } });
  assert.deepEqual(errorsOf(JSON.parse(text)), []);
  // and what it reads back writes valid JSON again
  const back = parseProjectFile(text, { prefs, ids: sequentialIds("n") });
  assert.deepEqual(errorsOf(JSON.parse(serializeProject(back))), []);
});

test("the schema refuses what OpenDose never writes", () => {
  const ok = JSON.parse(readFileSync(join(FIXTURES, "stage", "rank-test.json"), "utf8"));
  const clone = () => JSON.parse(JSON.stringify(ok));
  const bad: [string, (j: Record<string, any>) => void][] = [
    ["an unknown top-level key", (j) => { j.extra = 1; }],
    ["format version 3", (j) => { j.opendose_project = 3; }],
    ["no sheets", (j) => { delete j.sheets; }],
    ["an unknown sheet kind", (j) => { j.sheets[0].kind = "notebook"; }],
    ["a table type that does not exist", (j) => { j.sheets[0].table.type = "matrix"; }],
    ["a results sheet without its analysis", (j) => { delete j.sheets[1].analysis; }],
    ["a reason without its options", (j) => { j.sheets[1].chosen = { test: "t", reason: "r", analysis: "column" }; }],
    ["a record with an unknown status", (j) => { j.reproductions = [{ file: "f", savedWith: null,
      current: { app: "1" }, checkedAt: "2026-01-01T00:00:00Z", digits: 4,
      sheets: [{ sheetId: "a", name: "A", analysis: "x", status: "fine", compared: 1, changes: [] }] }]; }],
  ];
  for (const [what, edit] of bad) {
    const j = clone();
    edit(j);
    assert.ok(errorsOf(j).length > 0, what);
  }
});
