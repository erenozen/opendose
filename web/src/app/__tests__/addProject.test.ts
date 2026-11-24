// Which page drops add project files to the open project (P-74), and which
// keep their own route: one project opens in place of the open one, and
// table files go to the Import dialog or the recipe import (P-33).
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectsInDrop } from "../addProject.ts";
import { isTableDrop } from "../../share/recipes/dropKind.ts";

const f = (...names: string[]) => names.map((name) => ({ name }));

test("two or more project files are added; the drop's other files are named", () => {
  assert.deepEqual(projectsInDrop(f("a.json", "B.JSON")), { add: f("a.json", "B.JSON"), skipped: [] });
  assert.deepEqual(projectsInDrop(f("a.json", "b.json", "c.pzfx", "d.csv")),
    { add: f("a.json", "b.json"), skipped: f("c.pzfx", "d.csv") });
});

test("one project file, Prism files and table files keep their routes", () => {
  assert.equal(projectsInDrop(f("a.json")), null);
  assert.equal(projectsInDrop(f("a.json", "b.pzfx")), null);
  assert.equal(projectsInDrop(f("a.csv", "b.csv")), null);
  assert.equal(projectsInDrop(f("plate.zip")), null);
  // the recipe route still takes several CSVs, and never project files
  assert.equal(isTableDrop(f("a.csv", "b.csv")), true);
  assert.equal(isTableDrop(f("a.json", "b.json")), false);
});
