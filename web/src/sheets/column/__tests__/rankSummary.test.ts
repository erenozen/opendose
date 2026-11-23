// Column graphs that follow the test (rankSummary.ts): median with IQR
// under a rank test, for new graphs only, and the results line on what
// the test compares. Quartiles against numpy (reference/geo_summary.py).
// Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newGraphSettings } from "../../common/figureDefaults.ts";
import { normalizeTable } from "../../../project/table.ts";
import { legendSentence } from "../../../graph/legend.ts";
import { normalizeColumnGraph, summaryOf } from "../graphSettings.ts";
import { rankLine, rankTestOf, resolveSummary } from "../rankSummary.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(join(here, "reference", "geo_summary.json"), "utf8"));

const MW = { analysis: "ttest", ttestKind: "mann_whitney" };

test("rank tests, and the analyses that are not", () => {
  assert.equal(rankTestOf(MW)?.name, "Mann-Whitney");
  assert.equal(rankTestOf({ analysis: "ttest", ttestKind: "wilcoxon" })?.name, "Wilcoxon matched-pairs");
  assert.equal(rankTestOf({ analysis: "anova", anovaKind: "nonparametric" })?.name, "Kruskal-Wallis");
  assert.equal(rankTestOf({ analysis: "rm_anova", rmKind: "nonparametric" })?.name, "Friedman");
  assert.equal(rankTestOf({ analysis: "median_test" })?.compares, "compares medians");
  assert.equal(rankTestOf({ analysis: "ttest", ttestKind: "unpaired" }), null);
  assert.equal(rankTestOf({ analysis: "anova" }), null);
  assert.equal(rankTestOf(null), null);
});

test("Follow the test: new column graphs only; a chosen centre is kept", () => {
  assert.deepEqual(newGraphSettings("column"),
    { column: { spread: "symmetric", caption: "below", summary: "auto", violin: "quartiles" } });
  assert.equal(normalizeColumnGraph({ summary: "auto" }).summary, "auto");
  // saved before the option existed: no "auto", the figure stays mean ± SD
  assert.equal(resolveSummary(normalizeColumnGraph({}).summary, MW), "mean_sd");
  assert.equal(resolveSummary("auto", MW), "median_iqr");
  assert.equal(resolveSummary("auto", { analysis: "ttest", ttestKind: "welch" }), "mean_sd");
  assert.equal(resolveSummary("mean_sem", MW), "mean_sem");
});

test("median and IQR follow the column statistics' percentile method (numpy)", () => {
  for (const name of ["Control", "Treated A", "Treated B"]) {
    const r = ref[`example ${name}`];
    for (const [method, key] of [["linear", "linear"], ["prism", "weibull"]] as const) {
      const st = summaryOf(r.values, "median_iqr", method)!;
      const [q1, med, q3] = r.quartiles[key];
      assert.ok(Math.abs(st.center - med) < 1e-12, `${name} ${method} median`);
      assert.ok(Math.abs(st.center - st.lo - q1) < 1e-12, `${name} ${method} q1 ${st.center - st.lo} vs ${q1}`);
      assert.ok(Math.abs(st.center + st.hi - q3) < 1e-12, `${name} ${method} q3`);
    }
  }
  // one value, ties
  assert.deepEqual(summaryOf([3], "median_iqr"), { center: 3, lo: 0, hi: 0,
    label: "median 3.000, IQR 3.000 to 3.000" });
  const tie = summaryOf([2, 2, 2, 2], "median_iqr")!;
  assert.equal(tie.lo + tie.hi, 0);
});

test("the legend of a graph that follows the test", () => {
  const table = normalizeTable({ type: "column", datasets: [
    { name: "Control", rows: ref["example Control"].values.map((v: number) => [String(v)]) },
    { name: "Treated A", rows: ref["example Treated A"].values.map((v: number) => [String(v)]) }] });
  const graph = { graphType: "scatter", settings: { titles: { x: "", y: "" }, scheme: "default" as const,
    column: { summary: "auto" } } };
  assert.ok(legendSentence(graph, table, null, MW).startsWith("Median with IQR, with individual values."));
  assert.ok(legendSentence(graph, table, null, { analysis: "ttest" }).startsWith("Mean ± SD"));
});

test("the results line", () => {
  assert.equal(rankLine(MW, "median_iqr"),
    "The Mann-Whitney test compares distributions (ranks), shown as median and IQR.");
  assert.equal(rankLine(MW, "box"),
    "The Mann-Whitney test compares distributions (ranks), shown as median and IQR.");
  assert.equal(rankLine(MW, "mean_sd"),
    "The Mann-Whitney test compares distributions (ranks); the graph shows mean ± SD.");
  assert.equal(rankLine(MW, null), "The Mann-Whitney test compares distributions (ranks).");
  assert.equal(rankLine({ analysis: "anova" }, "mean_sd"), null);
});
