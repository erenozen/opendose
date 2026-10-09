// "Save this mapping as a recipe": specs from a recipe dialog's state,
// applied again to a new file, checked when read back, kept in the
// project file (and so in a share link).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProject } from "../../project/ops.ts";
import { parseProjectFile, serializeProject } from "../../project/persist.ts";
import { normalizeRecipes, withoutRecipe, withRecipe } from "../../project/recipes.ts";
import { DEFAULT_PREFS, projectPrefs } from "../../project/prefs.ts";
import { sequentialIds } from "../../project/ids.ts";
import { initialConfig, runPipeline } from "../recipes/pipeline.ts";
import { parseSource, recipeById } from "../recipes/presets.ts";
import {
  configFromSpec, describeSpec, makeSaved, mergeRecipes, normalizeSpec, specFromConfig, type RecipeSpec,
} from "../recipes/saved.ts";
import { shareJson } from "../link.ts";

const LONG = "Animal,Treatment,Day,Weight\nM1,WT,0,20\nM2,KO,0,21\nM1,WT,7,22\nM2,KO,7,25\n";

test("a recipe dialog's mapping round-trips and applies to the next file by column name", () => {
  const m = parseSource(LONG);
  const staged = recipeById("tidy").stage(m);
  const base = initialConfig(staged);
  // the user makes Day the X, Weight the value, asks for an XY table
  const cfg = { ...base, roles: staged.staging.columns.map((c) =>
    (c.name === "Animal" ? "subject" as const : c.name === "Treatment" ? "group" as const
      : c.name === "Day" ? "time" as const : "value" as const)), output: "xy" as const, name: "Weights" };
  const spec = specFromConfig(staged, cfg);
  assert.deepEqual(spec.roles, { Animal: "subject", Treatment: "group", Day: "time", Weight: "value" });
  const back = normalizeSpec(JSON.parse(JSON.stringify(spec))) as RecipeSpec;
  assert.deepEqual(back, spec);
  // the next file has its columns in another order
  const next = parseSource("Weight,Day,Treatment,Animal\n30,0,WT,M9\n31,7,WT,M9\n");
  const staged2 = recipeById("tidy").stage(next);
  const cfg2 = configFromSpec(staged2, initialConfig(staged2), back);
  assert.deepEqual(cfg2.roles, ["value", "time", "group", "subject"]);
  const out = runPipeline(staged2.staging, cfg2);
  assert.equal(out.result?.table.type, "xy");
  assert.deepEqual(out.result?.table.x, ["0", "7"]);
  assert.equal(cfg2.name, "Weights");
});

test("specs are checked when read: bad fields dropped, unknown recipes refused", () => {
  assert.equal(normalizeSpec({ kind: "recipe", recipe: "nope" }), null);
  assert.equal(normalizeSpec("x"), null);
  const s = normalizeSpec({ kind: "recipe", recipe: "multiread", roles: { A: "value", B: "evil" },
    output: "pie", steps: [{ level: "File", fn: "max" }], params: { reads: "x", "bad key": "1" },
    plateMap: { A1: { role: "blank" }, ZZ9: { role: "blank" } }, pattern: { columnName: "File",
      template: "{condition}.csv", parts: [{ role: "group", name: "Condition" }] } }) as RecipeSpec;
  assert.deepEqual(s.roles, { A: "value" });
  assert.equal(s.output, "column");
  assert.deepEqual(s.steps, [{ level: "File", fn: "mean" }]);
  assert.deepEqual(s.params, { reads: "x" });
  assert.deepEqual(s.plateMap, { A1: { role: "blank" } });
  assert.equal(s.pattern?.template, "{condition}.csv");
  const plain = normalizeSpec({ kind: "plain", source: { delimiter: "tab", skipLines: 3, decimal: "?" },
    filter: { everyK: 2 }, roles: { 1: "x", 2: "y", x: "y", 3: "zz" }, place: { mode: "insert" } });
  assert.equal(plain?.kind, "plain");
  if (plain?.kind !== "plain") return;
  assert.equal(plain.source.delimiter, "tab");
  assert.equal(plain.source.decimal, "auto");
  assert.equal(plain.source.skipLines, 3);
  assert.equal(plain.filter.everyK, 2);
  assert.deepEqual(plain.roles, { 1: "x", 2: "y" });
  assert.equal(plain.place.mode, "insert");
  assert.match(describeSpec(plain, String), /^Plain import: tab delimited, 3 lines skipped, every 2nd row/);
});

test("project recipes: saved in the file and in a share link, names unique", () => {
  const spec = { kind: "recipe", recipe: "incucyte", output: "xy" } as const;
  const r1 = makeSaved("Incucyte confluence", normalizeSpec(spec)!, "Incucyte time series", new Date(0));
  assert.equal(r1.id, "rcp-incucyte-confluence-0");
  const prefs = projectPrefs(DEFAULT_PREFS);
  let p = withRecipe(makeProject(prefs, [], "Recipes"), r1);
  p = withRecipe(p, { ...r1, id: "other" });
  assert.equal(p.recipes?.length, 1);
  const text = serializeProject(p);
  const back = parseProjectFile(text, { prefs, ids: sequentialIds("z") });
  assert.deepEqual(back.recipes?.map((r) => r.name), ["Incucyte confluence"]);
  assert.ok(JSON.parse(shareJson(p)).recipes.length === 1);
  assert.equal(withoutRecipe(p, "other").recipes, undefined);
  assert.deepEqual(normalizeRecipes([{ id: "a", name: "", spec: {} }, { id: "b", name: "B", spec: [] }, 5]), []);
  const merged = mergeRecipes([r1], [{ ...r1, name: "Incucyte confluence" }]);
  assert.equal(merged.length, 1);
  assert.ok(merged[0].inProject && merged[0].inBrowser);
});
