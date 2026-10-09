// Many per-image tables at once: unzip, stacking with the file name as a
// column, file-name templates, and the column / grouped tables with the
// replicate map set for SuperPlots.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  filePattern, isTableEntry, previewNames, stackTables, stageStacked, unzipTables,
} from "../recipes/multiFile.ts";
import { compileTemplate, fieldRole, matchTemplate, templateFit, templateParts } from "../recipes/pattern.ts";
import { initialConfig, runPipeline } from "../recipes/pipeline.ts";
import { recipeById } from "../recipes/presets.ts";
import { experimentLabel, valueUnit } from "../recipes/replicateOutput.ts";
import { replicateInfo } from "../../sheets/common/superplot.ts";

/** Fiji "Analyze Particles" Results saved per image: an untitled row
 *  number column, then measurements. */
const fiji = (areas: number[]) => [" ,Area,Mean", ...areas.map((a, i) => `${i + 1},${a},${100 + i}`)].join("\n");

// 2 conditions × 3 replicates × 2 images; image values = mean of its cells
const FILES = ["ctrl", "drug"].flatMap((cond, ci) => [1, 2, 3].flatMap((rep) => [1, 2].map((img) => ({
  name: `${cond}_rep${rep}_img0${img}.csv`,
  text: fiji([10 + ci * 5 + rep, 12 + ci * 5 + rep, 14 + ci * 5 + rep + img]),
}))));

test("templates: fields, roles, matching with and without the extension", () => {
  const c = compileTemplate("{condition}_rep{replicate}_img{image}.csv")!;
  assert.deepEqual(c.fields, ["condition", "replicate", "image"]);
  assert.deepEqual(matchTemplate(c, "ctrl_rep1_img03.csv"), ["ctrl", "1", "03"]);
  assert.deepEqual(matchTemplate(c, "CTRL_REP2_IMG10.CSV"), ["CTRL", "2", "10"]);
  assert.equal(matchTemplate(c, "ctrl_r1_img03.csv"), null);
  const noExt = compileTemplate("{genotype}-{animal}-{*}")!;
  assert.deepEqual(matchTemplate(noExt, "WT-M3-slice2.tif"), ["WT", "M3", "slice2"]);
  assert.deepEqual(templateParts("{genotype}-{animal}-{*}").map((p) => p.role), ["group", "subject", "skip"]);
  assert.equal(fieldRole("Day"), "time");
  assert.equal(fieldRole("image"), "meta");
  assert.equal(templateFit("{a}_{b}.csv", ["x_y.csv", "z.csv"]), 0.5);
  assert.equal(compileTemplate("no fields"), null);
  assert.deepEqual(previewNames(["a_rep1_img1.csv", "bad.csv"], "{condition}_rep{replicate}_img{image}.csv"),
    [{ name: "a_rep1_img1.csv", parts: ["a", "1", "1"] }, { name: "bad.csv", parts: null }]);
});

test("stacking: file name first, columns matched by title, empty and differing files reported", () => {
  const s = stackTables([
    { name: "b_rep1_img2.csv", text: "Area,Mean\n5,1\n" },
    { name: "b_rep1_img10.csv", text: "Mean,Area,Extra\n2,6,x\n" },
    { name: "a_rep1_img1.csv", text: "Area,Mean\n" },
  ]);
  assert.deepEqual(s.matrix[0], ["File", "Area", "Mean", "Extra"]);
  // natural order: img2 before img10; a_ first
  assert.deepEqual(s.matrix.slice(1), [["b_rep1_img2.csv", "5", "1", ""], ["b_rep1_img10.csv", "6", "2", "x"]]);
  assert.deepEqual(s.empty, ["a_rep1_img1.csv"]);
  assert.deepEqual(s.differing, ["b_rep1_img10.csv"]);
  // folders inside a zip become a Folder column
  const f = stackTables([{ name: "ctrl/img1.csv", text: "Area\n1\n" }]);
  assert.deepEqual(f.matrix, [["File", "Folder", "Area"], ["img1.csv", "ctrl", "1"]]);
});

test("unzip: table files only, no macOS resource forks", () => {
  const zip = zipSync({
    "ctrl_rep1_img01.csv": strToU8("Area\n1\n"),
    "__MACOSX/._ctrl_rep1_img01.csv": strToU8("junk"),
    "notes.pdf": strToU8("%PDF"),
    "sub/drug_rep1_img01.csv": strToU8("﻿Area\n2\n"),
  });
  const files = unzipTables(zip);
  assert.deepEqual(files.map((f) => f.name), ["ctrl_rep1_img01.csv", "sub/drug_rep1_img01.csv"]);
  assert.equal(files[1].text, "Area\n2\n");
  assert.equal(isTableEntry("x/._a.csv"), false);
});

test("per-image CSVs: one table with condition, replicate and image columns", () => {
  const stacked = stackTables(FILES);
  const s = stageStacked(stacked.matrix);
  assert.equal(s.names.length, 12);
  assert.equal(s.pattern.template, "{condition}_rep{replicate}_img{image}.csv");
  assert.deepEqual(s.staging.columns.map((c) => [c.name, c.role]),
    [["File", "level"], ["#", "meta"], ["Area", "value"], ["Mean", "meta"]]);
  const staged = recipeById("images").stage(stacked.matrix);
  const out = runPipeline(staged.staging, initialConfig(staged));
  assert.equal(out.error, "");
  assert.deepEqual(out.records.columns.slice(-3).map((c) => [c.name, c.role]),
    [["Condition", "group"], ["Replicate", "subject"], ["Image", "meta"]]);
  assert.deepEqual(out.records.rows[0].slice(-3), ["ctrl", "1", "01"]);
  // aggregated per image (file): 12 images
  assert.equal(out.aggregated.rows.length, 12);
  const t = out.result!.table;
  assert.equal(t.type, "column");
  assert.deepEqual(t.datasets.map((d) => d.name), ["ctrl", "drug", "Experiment"]);
  assert.deepEqual(t.replicates, { by: "column", column: 2, unit: "images" });
  // rows matched by experiment: rep1's two images, then rep2's …
  assert.deepEqual(t.datasets[2].rows.map((r) => r[0]),
    ["Replicate 1", "Replicate 1", "Replicate 2", "Replicate 2", "Replicate 3", "Replicate 3"]);
  // ctrl rep1 img01: mean(11, 13, 16) = 13.333…; img02: mean(11, 13, 17)
  assert.equal(Number(t.datasets[0].rows[0][0]).toFixed(4), "13.3333");
  assert.equal(t.datasets[0].rows[1][0], "13.6666666667");
  assert.deepEqual(out.result!.counts, [{ name: "ctrl", n: 6 }, { name: "drug", n: 6 }]);
  assert.deepEqual(out.replicates, { experiments: 3, column: "Replicate", unit: "images" });
  const info = replicateInfo(t);
  assert.deepEqual(info.names, ["Replicate 1", "Replicate 2", "Replicate 3"]);
  assert.deepEqual(info.groups, [0, 1]);
});

test("per-image CSVs: grouped output carries the map by subcolumns; one value per replicate needs none", () => {
  const staged = recipeById("images").stage(stackTables(FILES).matrix);
  const grouped = runPipeline(staged.staging, { ...initialConfig(staged), output: "grouped" });
  const g = grouped.result!.table;
  assert.equal(g.type, "grouped");
  assert.deepEqual(g.replicates?.of, [0, 0, 1, 1, 2, 2]);
  assert.deepEqual(g.datasets[0].subTitles?.slice(0, 2), ["Replicate 1 (1)", "Replicate 1 (2)"]);
  assert.equal(g.rowTitles[0], "Area");
  // aggregate on to one value per replicate: n = experiments, no map
  const means = runPipeline(staged.staging, { ...initialConfig(staged),
    steps: [{ level: "File", fn: "mean" }, { level: "Replicate", fn: "mean" }] });
  assert.equal(means.replicates, null);
  assert.equal(means.result!.table.replicates, undefined);
  assert.deepEqual(means.result!.counts, [{ name: "ctrl", n: 3 }, { name: "drug", n: 3 }]);
});

test("names that do not fit the template are split at the separator", () => {
  const p = filePattern(["WT_M1_a.csv", "KO_M2_b.csv"]);
  assert.equal(p.template, undefined);
  assert.equal(p.delimiter, "_");
  assert.deepEqual(p.parts.map((x) => x.role), ["group", "subject", "skip"]);
});

test("replicate helpers", () => {
  assert.equal(experimentLabel("2", "Replicate"), "Replicate 2");
  assert.equal(experimentLabel("E2", "Replicate"), "E2");
  const st = { columns: [{ name: "Well", role: "level" as const, numeric: false }], rows: [] };
  assert.equal(valueUnit(st, [{ level: 0, fn: "mean" }]), "wells");
  assert.equal(valueUnit(st, []), "values");
});
