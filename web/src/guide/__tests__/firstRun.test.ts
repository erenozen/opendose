// First run (DECISIONS 4): which pastes replace the example, which
// projects still count as the example, the verbs. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstRunStore, isExampleProject, markExample, PRIMARY_VERB, setPasteNote, tableNoun, usablePaste,
} from "../firstRun.ts";
import { readPaste } from "../paste.ts";
import type { Project, Sheet } from "../../project/types.ts";

const data = (id: string) => ({ kind: "data", id, name: id }) as unknown as Sheet;
const project = (...sheets: Sheet[]) =>
  ({ version: 2, title: "t", sheets, prefs: {} }) as unknown as Project;

test("a block of numbers outside a field replaces the example; a word or a link does not", () => {
  assert.equal(usablePaste(readPaste("Conc\tY\n1\t2\n10\t3"), "page"), true);
  assert.equal(usablePaste(readPaste("1\n2\n3"), "page"), true);
  assert.equal(usablePaste(readPaste("hello"), "page"), false);
  assert.equal(usablePaste(readPaste("https://example.org/a"), "page"), false);
  assert.equal(usablePaste(readPaste("  \n"), "page"), false);
  assert.equal(usablePaste(readPaste("7"), "page"), false);
});

test("in the example's grid only a block of two rows and two columns replaces it", () => {
  assert.equal(usablePaste(readPaste("1\t2\n3\t4"), "grid"), true);
  assert.equal(usablePaste(readPaste("1\n2\n3"), "grid"), false); // one column: a grid edit
  assert.equal(usablePaste(readPaste("4.2"), "grid"), false);
  assert.equal(usablePaste(readPaste("1\t2\t3"), "grid"), false);
});

test("the project is the example while every data table is one of the example's", () => {
  const p = project(data("a"), data("b"), { kind: "info", id: "i", name: "Info" } as unknown as Sheet);
  markExample(p);
  assert.equal(isExampleProject(p), true);
  assert.equal(isExampleProject(project(data("a"))), true); // one deleted: still the example
  assert.equal(isExampleProject(project(data("a"), data("c"))), false); // a table added
  assert.equal(isExampleProject(project()), false);
  assert.deepEqual([...firstRunStore.get().exampleIds], ["a", "b"]);
});

test("marking a new example forgets the last paste", () => {
  const p = project(data("x"));
  setPasteNote({ dataId: "x", text: "", read: readPaste("1\t2\n3\t4")!, before: p, after: p,
    beforeSelected: null, replacedExample: true });
  assert.ok(firstRunStore.get().paste);
  markExample(p);
  assert.equal(firstRunStore.get().paste, null);
});

test("every table type has a verb, and nouns take the right article", () => {
  for (const v of Object.values(PRIMARY_VERB)) assert.ok(v.length > 0 && !/create/i.test(v));
  assert.equal(PRIMARY_VERB.xy, "Fit the curve");
  assert.equal(tableNoun("XY"), "an XY table");
  assert.equal(tableNoun("Column"), "a Column table");
  assert.equal(tableNoun("Multiple variables"), "a Multiple variables table");
});
