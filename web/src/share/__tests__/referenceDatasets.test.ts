// The validation page's reference datasets (P-127): the index is current
// with the corpus, and every dataset becomes the table its reference was
// computed from (sizes and degrees of freedom match the published ones,
// the univariate means match the certified means) with the analysis
// that computes it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error: plain .mjs build script, no type declarations
import { compileIndex, INDEX_PATH } from "../../../scripts/reference-datasets.mjs";
import { parseCell } from "../../project/table.ts";
import {
  datasetAnalysis, datasetForSource, datasetShortName, datasetTable, parseCorpusCsv, referenceNotes,
  type ReferenceDataset, type ReferenceIndex,
} from "../referenceDatasets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "..", "..", "..", "docs", "validation", "datasets");
const index = JSON.parse(readFileSync(INDEX_PATH as string, "utf8")) as ReferenceIndex;
const csv = (d: ReferenceDataset) => readFileSync(join(DATA, d.file), "utf8");
const ref = (d: ReferenceDataset, q: string) => d.references.find((r) => r.quantity === q)?.value;
const nums = (cells: string[]) => cells.map(parseCell).filter((v): v is number => v !== null);

test("the committed index is what the corpus compiles to now", () => {
  assert.equal(readFileSync(INDEX_PATH as string, "utf8"), (compileIndex as () => string)(),
    "src/share/referenceDatasets.json is out of date: run node scripts/reference-datasets.mjs from web/");
});

test("only public-domain NIST datasets ship, each with its references", () => {
  assert.equal(index.datasets.length, 34);
  for (const d of index.datasets) {
    assert.match(d.licence, /^public domain/, d.id);
    assert.ok(d.references.length > 0, d.id);
  }
  // NIST Filip (tenth-order polynomial) has no results sheet that computes it
  assert.equal(index.datasets.some((d) => d.id === "nist-filip"), false);
});

test("univariate data: n and the mean are the certified ones", () => {
  for (const d of index.datasets.filter((x) => x.plan.kind === "column_stats")) {
    const t = datasetTable(d, csv(d));
    const v = nums(t.datasets[0].rows.map((r) => r[0]));
    assert.equal(v.length, ref(d, "n"), d.id);
    // two-pass mean around the first value (float64)
    const mean = v[0] + v.reduce((s, x) => s + (x - v[0]), 0) / v.length;
    assert.ok(Math.abs(mean - ref(d, "mean")!) <= 1e-12 * Math.abs(ref(d, "mean")!) + 1e-12, `${d.id} mean ${mean}`);
    assert.deepEqual(datasetAnalysis(d), { type: "column", analysis: "column", options: { analysis: "column_statistics" } });
  }
});

test("one-way ANOVA data: groups and values give the certified degrees of freedom", () => {
  for (const d of index.datasets.filter((x) => x.plan.kind === "anova")) {
    const t = datasetTable(d, csv(d));
    const total = t.datasets.reduce((n, g) => n + nums(g.rows.map((r) => r[0])).length, 0);
    assert.equal(t.datasets.length - 1, ref(d, "df_between"), d.id);
    assert.equal(total - t.datasets.length, ref(d, "df_within"), d.id);
    assert.equal(datasetAnalysis(d).options.analysis, "anova");
  }
});

test("XY data: every X has its Y, as many as the residual df says", () => {
  for (const d of index.datasets.filter((x) => ["user_fit", "linreg", "polynomial2"].includes(x.plan.kind))) {
    const t = datasetTable(d, csv(d));
    const n = nums(t.x).length;
    assert.equal(nums(t.datasets[0].rows.map((r) => r[0])).length, n, d.id);
    assert.equal(n, parseCorpusCsv(csv(d)).rows.length, d.id);
    const params = d.plan.kind === "user_fit" ? Object.keys(d.plan.start).length
      : d.plan.kind === "polynomial2" ? 3 : d.plan.kind === "linreg" && d.plan.throughOrigin ? 1 : 2;
    const df = ref(d, "df_residual") ?? ref(d, "df");
    if (df !== undefined) assert.equal(n - params, df, d.id);
  }
});

test("a NIST curve fit starts from Start 1 with NIST's own equation", () => {
  const d = index.datasets.find((x) => x.id === "nist-misra1a")!;
  const a = datasetAnalysis(d);
  assert.equal(a.analysis, "nonlin");
  const eq = a.options.userEquation as { text: string; rules: Record<string, { kind: string; value: string }> };
  assert.equal(eq.text, "Y = b1*(1-exp(-b2*x))");
  assert.deepEqual(eq.rules, {
    b1: { kind: "value", value: "500", op: "*", of: "YMAX" },
    b2: { kind: "value", value: "0.0001", op: "*", of: "YMAX" },
  });
  assert.equal(a.options.autoFit, "requested");
  // the values stay as NIST printed them
  assert.equal(datasetTable(d, csv(d)).x[0], "77.6E0");
});

test("Longley: a multiple-variables table of six predictors and y", () => {
  const d = index.datasets.find((x) => x.id === "nist-longley")!;
  const t = datasetTable(d, csv(d));
  assert.equal(t.type, "multivariable");
  assert.deepEqual(t.datasets.map((c) => c.name), ["x1", "x2", "x3", "x4", "x5", "x6", "y"]);
  assert.equal(t.datasets[6].rows.length, 16);
  assert.deepEqual(datasetAnalysis(d), { type: "multivariable", analysis: "mv_regression", options: {} });
});

test("a check's source names its dataset; the notes carry every reference", () => {
  assert.equal(datasetForSource("NIST StRD Longley (1967) certified values", index.datasets)?.id, "nist-longley");
  assert.equal(datasetForSource("NIST StRD Longley certified values", index.datasets)?.id, "nist-longley");
  assert.equal(datasetForSource("statsmodels OLS", index.datasets), undefined);
  const d = index.datasets.find((x) => x.id === "nist-smls07")!;
  assert.equal(datasetShortName(d), "SmLs07");
  const notes = referenceNotes(d, 10);
  for (const r of d.references) assert.ok(notes.includes(`${r.quantity} = `), r.quantity);
  assert.match(notes, /stress test/);
  assert.match(notes, /outside the tolerance/);
});

test("a CSV with no rows or a missing column says so", () => {
  assert.throws(() => parseCorpusCsv(""), /the file is empty/);
  const d = index.datasets.find((x) => x.id === "nist-norris")!;
  assert.throws(() => datasetTable(d, "a,b\n1,2\n"), /the file has no column “x”/);
});
