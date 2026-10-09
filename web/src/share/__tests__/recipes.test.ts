// Import recipes on the synthetic fixtures in web/e2e-fixtures, plus
// aggregation, pivots and the long <-> wide reshape.
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emptyTable, setCell, setRowTitle } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { applyPattern, guessParts, splitName } from "../recipes/pattern.ts";
import { initialConfig, runPipeline } from "../recipes/pipeline.ts";
import { findPlateGrid, plateNumber } from "../recipes/plate.ts";
import {
  detectRecipe, looksLongTable, parseSource, plateScore, recipeById,
} from "../recipes/presets.ts";
import {
  aggValue, aggregate, hierarchy, makeStaging, pivot, unitsPerGroup,
} from "../recipes/staging.ts";
import { longMatrix, longToMultivariable, tableToLong } from "../tidy.ts";

const fixture = (name: string) => readFileSync(
  new URL(`../../../e2e-fixtures/${name}`, import.meta.url), "utf8");
const staged = (name: string) => {
  const m = parseSource(fixture(name));
  const r = detectRecipe(m);
  return { recipe: r, staged: r.stage(m) };
};
const values = (t: DataTableModel, d: number) =>
  t.datasets[d].rows.flat().filter((v) => v !== "").map(Number);

test("FlowJo: detected, summary rows dropped, names split into group and animal", () => {
  const { recipe, staged: s } = staged("flowjo-table.csv");
  assert.equal(recipe.id, "flowjo");
  assert.equal(s.staging.rows.length, 14);
  assert.ok(!s.staging.rows.some((r) => /^(Mean|SD)$/.test(r[0])));
  assert.equal(s.staging.columns[1].role, "value");
  assert.deepEqual(s.pattern?.parts.map((p) => p.role), ["group", "subject", "skip"]);
  // without aggregation: every sample is a value
  const raw = runPipeline(s.staging, { ...initialConfig(s), aggregate: false });
  assert.deepEqual(raw.result?.counts, [{ name: "WT", n: 8 }, { name: "KO", n: 6 }]);
  // aggregated by animal (mean): n = animals
  const out = runPipeline(s.staging, initialConfig(s));
  assert.equal(out.error, "");
  assert.equal(out.result?.table.type, "column");
  assert.deepEqual(out.result?.counts, [{ name: "WT", n: 4 }, { name: "KO", n: 3 }]);
  assert.deepEqual(values(out.result!.table, 0), [62.1, 59.6, 63.8, 59]);
  assert.deepEqual(values(out.result!.table, 1), [47.9, 51.2, 46.1]);
  // keep the lower level: a nested table animals × samples
  const kept = runPipeline(s.staging, { ...initialConfig(s), keepLower: true });
  assert.equal(kept.lower?.table.type, "nested");
  assert.deepEqual(kept.lower?.table.datasets[0].subTitles, ["M1", "M2", "M3", "M4"]);
  assert.equal(kept.lower?.table.datasets[0].rows.length, 2);
});

test("name pattern: delimiter, positions and extension", () => {
  assert.deepEqual(splitName("KO_M5_D7_2.fcs", "_", true), ["KO", "M5", "D7", "2"]);
  assert.deepEqual(splitName("KO M5  D7", " ", false), ["KO", "M5", "D7"]);
  assert.deepEqual(splitName("a.b.tif", ".", true), ["a", "b"]);
  const parts = guessParts(["KO_M5_D7_2.fcs", "WT_M1_D14_1.fcs"], "_", true);
  assert.deepEqual(parts.map((p) => p.role), ["group", "subject", "time", "skip"]);
  const st = makeStaging(["Sample", "v"], [["KO_M5_D7_2.fcs", "1"], ["WT_M1_D14_1.fcs", "2"]],
    ["meta", "value"]);
  const out = applyPattern(st, { column: 0, delimiter: "_", stripExtension: true, parts });
  assert.deepEqual(out.columns.map((c) => c.name), ["Sample", "v", "Group", "Subject", "Time"]);
  assert.deepEqual(out.rows[1], ["WT_M1_D14_1.fcs", "2", "WT", "M1", "D14"]);
});

test("CellProfiler: objects -> images -> animals", () => {
  const { recipe, staged: s } = staged("cellprofiler-nuclei.csv");
  assert.equal(recipe.id, "cellprofiler");
  const role = (n: string) => s.staging.columns.find((c) => c.name === n)?.role;
  assert.equal(role("ImageNumber"), "level");
  assert.equal(role("Metadata_Animal"), "subject");
  assert.equal(role("Metadata_Treatment"), "group");
  assert.equal(role("AreaShape_Area"), "value");
  assert.equal(role("Location_Center_X"), "skip");
  assert.deepEqual(s.aggregate.map((a) => a.level), ["ImageNumber", "Metadata_Animal"]);
  const out = runPipeline(s.staging, initialConfig(s));
  assert.deepEqual(out.result?.counts, [{ name: "Vehicle", n: 2 }, { name: "Drug", n: 2 }]);
  // the mean of image means equals the mean of the animal's objects here
  // (equal object counts per image)
  const area = s.staging.columns.findIndex((c) => c.name === "AreaShape_Area");
  const a1 = s.staging.rows.filter((r) => r[2] === "A1").map((r) => Number(r[area]));
  const want = a1.reduce((x, y) => x + y, 0) / a1.length;
  assert.ok(Math.abs(values(out.result!.table, 0)[0] - want) < 1e-9);
  // finest level first
  const h = hierarchy(out.records).map((c) => out.records.columns[c].name);
  assert.deepEqual(h, ["ImageNumber", "Metadata_Animal"]);
});

test("QuPath: detections -> images -> rats, group and rat from the image name", () => {
  const { recipe, staged: s } = staged("qupath-measurements.tsv");
  assert.equal(recipe.id, "qupath");
  assert.equal(s.staging.columns.find((c) => c.role === "value")?.name, "Nucleus: Area µm^2");
  assert.deepEqual(s.pattern?.parts.map((p) => p.role), ["group", "subject", "skip"]);
  const out = runPipeline(s.staging, initialConfig(s));
  assert.equal(out.error, "");
  assert.deepEqual(out.result?.counts, [{ name: "Sham", n: 2 }, { name: "TBI", n: 2 }]);
  assert.deepEqual(unitsPerGroup(out.aggregated, out.subject),
    [{ name: "Sham", n: 2 }, { name: "TBI", n: 2 }]);
});

test("plate grid: found below a preamble, same rules as the SRB importer", () => {
  const m = parseSource(fixture("plate-reader.csv"));
  const g = findPlateGrid(m)!;
  assert.equal(g.rows, 8);
  assert.equal(g.cols, 12);
  assert.equal(g.top, 4);
  assert.equal(g.values[0][0], 1.623);
  assert.equal(plateNumber("0,5"), 0.5);
  assert.equal(plateNumber("x"), null);
  const { recipe, staged: s } = staged("plate-reader.csv");
  assert.equal(recipe.id, "plate");
  assert.equal(s.staging.rows.length, 96);
  const out = runPipeline(s.staging, initialConfig(s));
  assert.equal(out.result?.table.datasets.length, 12);
  assert.deepEqual(out.result?.counts.map((c) => c.n), Array(12).fill(8));
  // XY with X = column number, replicates = plate rows
  const xy = pivot(out.records.columns[2].numeric
    ? { ...out.records, columns: out.records.columns.map((c, i) => ({ ...c,
      role: i === 2 ? "time" : i === 1 ? "group" : c.role })) } : out.records, "xy");
  assert.equal(xy.table.x.length, 12);
  // an unlabelled block of exactly 8 × 12 numbers is a plate too
  const bare = Array.from({ length: 8 }, (_, r) => Array.from({ length: 12 }, (_, c) => String(r * 12 + c)));
  assert.equal(findPlateGrid(bare)?.left, -1);
});

test("a long table whose label column reads A then B is not a plate", () => {
  // warpbreaks: wool (A, B) x tension (L, M, H), 9 rows each; the last A
  // row sits above the first B row, which the grid rule alone reads as
  // a 2-row (6-well) block at row 28
  const breaks = [26, 30, 54, 25, 70, 52, 51, 26, 67, 18, 21, 29, 17, 12, 18, 35, 30, 36,
    36, 21, 24, 18, 10, 43, 28, 15, 26, 27, 14, 29, 19, 29, 31, 41, 20, 44, 42, 26, 19,
    16, 39, 28, 21, 39, 29, 20, 21, 24, 17, 13, 15, 15, 16, 28];
  const lines = ["wool,tension,breaks", ...breaks.map((b, i) =>
    `${i < 27 ? "A" : "B"},${"LMH"[Math.floor((i % 27) / 9)]},${b}`)];
  const m = parseSource(lines.join("\n"));
  assert.equal(findPlateGrid(m)?.top, 27, "the grid rule (as plate_io.py) still sees the A/B pair");
  assert.ok(looksLongTable(m));
  assert.equal(plateScore(m), 0);
  const r = detectRecipe(m);
  assert.equal(r.id, "tidy");
  const s = r.stage(m);
  assert.equal(s.staging.rows.length, 54);
  // an all-numeric long table is not a plate either
  const xy = parseSource(["dose,signal", ...Array.from({ length: 20 }, (_, i) => `${i},${i * 2}`)].join("\n"));
  assert.equal(plateScore(xy), 0);
  assert.equal(detectRecipe(xy).id, "tidy");
  // nor a column table with a header row and unequal columns (a bare
  // 19 x 2 block, padded): offered by name only, the header wins
  const cols = parseSource(["automatic (am=0),manual (am=1)",
    ...Array.from({ length: 19 }, (_, i) => (i < 13 ? `${20 + i},${25 + i}` : `${20 + i},`))].join("\n"));
  assert.ok(plateScore(cols) < 0.1);
  assert.equal(detectRecipe(cols).id, "tidy");
});

test("plate-shaped blocks are still claimed: labelled 96, bare 8 x 12, labelled 384", () => {
  const nums = (r: number, c: number) => Array.from({ length: c }, (_, j) => (0.1 + r * 0.01 + j * 0.001).toFixed(3));
  const labelled = ["Plate 1,,,", "Read: 450 nm", "",
    ["", ...Array.from({ length: 12 }, (_, j) => String(j + 1))].join(","),
    ..."ABCDEFGH".split("").map((L, r) => [L, ...nums(r, 12)].join(","))].join("\n");
  let m = parseSource(labelled);
  assert.ok(!looksLongTable(m));
  assert.equal(plateScore(m), 0.95);
  assert.equal(detectRecipe(m).id, "plate");
  assert.match(detectRecipe(m).stage(m).notes[0], /^96-well plate found at row 5\./);
  m = parseSource(Array.from({ length: 8 }, (_, r) => nums(r, 12).join("\t")).join("\n"));
  assert.equal(detectRecipe(m).id, "plate");
  m = parseSource([["", ...Array.from({ length: 24 }, (_, j) => String(j + 1))].join(","),
    ..."ABCDEFGHIJKLMNOP".split("").map((L, r) => [L, ...nums(r, 24)].join(","))].join("\n"));
  assert.equal(detectRecipe(m).id, "plate");
  assert.equal(detectRecipe(m).stage(m).staging.rows.length, 384);
  // a 24-well plate with row letters and numbered columns is claimed too
  m = parseSource([",1,2,3,4,5,6", ..."ABCD".split("").map((L, r) => [L, ...nums(r, 6)].join(","))].join("\n"));
  assert.equal(plateScore(m), 0.9);
  assert.equal(detectRecipe(m).id, "plate");
});

test("qPCR: technical wells averaged per sample and target, undetermined is missing", () => {
  const { recipe, staged: s } = staged("qpcr-cq.csv");
  assert.equal(recipe.id, "qpcr");
  assert.match(s.notes.join(" "), /1 undetermined/);
  const out = runPipeline(s.staging, initialConfig(s));
  assert.equal(out.result?.table.type, "grouped");
  assert.deepEqual(out.result?.table.rowTitles, ["GAPDH", "IL6"]);
  assert.deepEqual(out.result?.table.datasets.map((d) => d.name),
    ["Ctrl_1", "Ctrl_2", "Treated_1", "Treated_2", "NTC"]);
  const cq = s.staging.rows.filter((r) => r[4] === "Ctrl_1" && r[2] === "GAPDH").map((r) => Number(r[5]));
  assert.equal(Number(out.result!.table.datasets[0].rows[0][0]),
    Number(((cq[0] + cq[1]) / 2).toPrecision(12)));
  assert.equal(out.result!.table.datasets[4].rows[1][0], "");
  // biological replicates from the sample name: Ctrl / Treated × 1, 2
  const cfg = initialConfig(s);
  const sampleCol = s.staging.columns.findIndex((c) => c.name === "Sample");
  const roles = [...cfg.roles];
  roles[sampleCol] = "meta";
  const bio = runPipeline(s.staging, {
    ...cfg, roles,
    pattern: { column: sampleCol, delimiter: "_", stripExtension: false,
      parts: [{ role: "group", name: "Condition" }, { role: "subject", name: "Replicate" }] },
    steps: [{ level: "Replicate", fn: "mean" }],
  });
  assert.deepEqual(bio.result?.table.datasets.map((d) => d.name), ["Ctrl", "Treated", "NTC"]);
  assert.deepEqual(bio.result?.table.datasets[0].subTitles, ["1", "2"]);
});

test("tidy long: XY with one subcolumn per subject", () => {
  const { recipe, staged: s } = staged("tidy-long.csv");
  assert.equal(recipe.id, "tidy");
  assert.equal(s.output, "xy");
  const out = runPipeline(s.staging, initialConfig(s));
  const t = out.result!.table;
  assert.deepEqual(t.x, ["0", "3", "7", "10"]);
  assert.deepEqual(t.datasets.map((d) => d.name), ["Vehicle", "Treated"]);
  assert.deepEqual(t.datasets[0].subTitles, ["V1", "V2", "V3"]);
  assert.equal(t.datasets[0].rows[0][0], "109.5");
  assert.equal(t.datasets[0].rows[3][0], "291");
  // the same records as grouped, column, nested, multivariable
  assert.equal(pivot(out.records, "grouped").table.rowTitles.length, 4);
  assert.deepEqual(pivot(out.records, "column").counts.map((c) => c.n), [12, 12]);
  assert.equal(pivot(out.records, "nested").table.datasets[0].rows[0].length, 3);
  assert.equal(pivot(out.records, "multivariable").table.datasets.length, 4);
  assert.throws(() => pivot({ ...out.records, columns: out.records.columns.map((c) => ({
    ...c, role: c.role === "time" ? "meta" : c.role })) }, "xy"), /needs/);
});

test("aggregation functions and survival pivot", () => {
  assert.equal(aggValue([1, 2, 3, 10], "median", 4), 2.5);
  assert.equal(aggValue([1, 2, 3], "sum", 3), 6);
  assert.equal(aggValue([], "count", 5), 5);
  assert.equal(aggValue([], "mean", 0), null);
  const st = makeStaging(["g", "s", "v"], [["A", "1", "2"], ["A", "1", "4"], ["A", "2", "x"], ["B", "3", "5"]],
    ["group", "subject", "value"]);
  const agg = aggregate(st, [{ level: 1, fn: "mean" }]);
  assert.deepEqual(agg.rows, [["A", "1", "3"], ["A", "2", ""], ["B", "3", "5"]]);
  const cnt = aggregate(st, [{ level: 1, fn: "count" }]);
  assert.deepEqual(cnt.rows.map((r) => r[2]), ["2", "1", "1"]);
  const surv = pivot(makeStaging(["arm", "days", "dead"],
    [["A", "5", "1"], ["A", "9", "0"], ["B", "3", "yes"]], ["group", "time", "event"]), "survival");
  assert.deepEqual(surv.table.datasets[0].rows, [["5", "1"], ["9", "0"]]);
  assert.deepEqual(surv.table.datasets[1].rows[0], ["3", "1"]);
});

test("reshape: wide tables to long and back", () => {
  let col = emptyTable("column", { datasets: 2, rows: 3 });
  col = setCell(setCell(setCell(col, 0, 0, 0, "1"), 0, 1, 0, "2"), 1, 0, 0, "5");
  const long = tableToLong(col);
  assert.deepEqual(long.headers, ["Group", "Replicate", "Value"]);
  assert.deepEqual(long.rows, [["Group A", "1", "1"], ["Group A", "2", "2"], ["Group B", "1", "5"]]);
  const mv = longToMultivariable(long);
  assert.equal(mv.type, "multivariable");
  assert.deepEqual(mv.datasets.map((d) => d.varType), ["categorical", "continuous", "continuous"]);
  // back to wide through the staging pivot
  const st = makeStaging(long.headers, long.rows, ["group", "subject", "value"]);
  const wide = pivot(st, "column", { subject: -1 }).table;
  assert.deepEqual(wide.datasets.map((d) => d.rows.flat().filter(Boolean)), [["1", "2"], ["5"]]);

  let g = emptyTable("grouped", { datasets: 2, subcolumns: 2, rows: 2 });
  g = setRowTitle(setRowTitle(g, 0, "Day 1"), 1, "Day 2");
  g = setCell(setCell(g, 1, 1, 1, "7"), 0, 0, 0, "3");
  assert.deepEqual(tableToLong(g).headers, ["Row", "Dataset", "Replicate", "Value"]);
  assert.deepEqual(tableToLong(g).rows, [["Day 1", "Dataset A", "1", "3"], ["Day 2", "Dataset B", "2", "7"]]);

  const surv = { ...emptyTable("survival", { datasets: 1, rows: 2 }) };
  surv.datasets[0].rows = [["4", "1"], ["", ""]];
  assert.deepEqual(tableToLong(surv).headers, ["Group", "Subject", "Time", "Event"]);
  assert.deepEqual(tableToLong(surv).rows, [["Group A", "1", "4", "1"]]);

  let xy = emptyTable("xy", { datasets: 1, subcolumns: 2, rows: 2 });
  xy = { ...setCell(setCell(xy, 0, 0, 1, "9"), 0, 1, 0, "8"), x: ["0.1", "1"] };
  xy.datasets[0].excluded = ["0:1"];
  const xl = tableToLong(xy);
  assert.deepEqual(xl.headers, ["X", "Dataset", "Replicate", "Value"]);
  assert.deepEqual(longMatrix(xl), [["X", "Dataset", "Replicate", "Value", "Excluded"],
    ["1", "Dataset A", "1", "8", ""], ["0.1", "Dataset A", "2", "9", "TRUE"]]);
  assert.deepEqual(longToMultivariable(xl).datasets[3].excluded, ["1:0"]);
});

test("recipes stay available by id", () => {
  for (const id of ["flowjo", "cellprofiler", "qupath", "plate", "qpcr", "tidy"] as const) {
    assert.equal(recipeById(id).id, id);
  }
});
