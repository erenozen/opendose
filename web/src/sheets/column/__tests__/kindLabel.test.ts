// The graph-type select names what a column graph draws (P-25 / P-26
// follow-up): the centre the graph's settings and the bound test give,
// never a fixed "mean ± SD". Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../../project/table.ts";
import type { DataTableModel } from "../../../project/types.ts";
import { COLUMN_GRAPH_LABELS } from "../../../types.ts";
import { columnKindLabel } from "../kindLabel.ts";

const raw: DataTableModel = normalizeTable({ type: "column", x: ["", ""],
  datasets: [{ name: "A", rows: [["1"], ["2"]] }, { name: "B", rows: [["3"], ["4"]] }] });
const graph = (column?: object) => ({ settings: { titles: { x: "", y: "" }, scheme: "default" as const,
  ...(column ? { column } : {}) } });
const ttest = { analysis: "ttest", ttestKind: "unpaired" };
const mannWhitney = { analysis: "ttest", ttestKind: "mann_whitney" };

test("a graph saved before (no summary key) says mean ± SD, as it draws", () => {
  assert.equal(columnKindLabel("scatter", graph(), raw, null, ttest), "Scatter (points + mean ± SD)");
  assert.equal(columnKindLabel("bar", graph(), raw, null, ttest), "Bar (mean ± SD + points)");
});

test("Follow the test: mean ± SD under a t test, median with IQR under a rank test", () => {
  const g = graph({ summary: "auto" });
  assert.equal(columnKindLabel("scatter", g, raw, null, ttest), "Scatter (points + mean ± SD)");
  assert.equal(columnKindLabel("scatter", g, raw, null, mannWhitney), "Scatter (points + median with IQR)");
  assert.equal(columnKindLabel("bar", g, raw, null, mannWhitney), "Bar (median with IQR + points)");
});

test("a chosen centre is named; bars without points say so", () => {
  assert.equal(columnKindLabel("scatter", graph({ summary: "geo_sd" }), raw, null, ttest),
    "Scatter (points + geometric mean ×/÷ geometric SD)");
  assert.equal(columnKindLabel("bar", graph({ summary: "mean_ci", points: false }), raw, null, null),
    "Bar (mean with 95% CI)");
  assert.equal(columnKindLabel("scatter", graph({ summary: "none" }), raw, null, null),
    "Scatter (points + mean, no error bars)");
});

test("box, violin and raincloud keep their names; summary data and SuperPlots stay neutral", () => {
  for (const k of ["box", "violin", "raincloud"] as const) {
    assert.equal(columnKindLabel(k, graph({ summary: "geo_sd" }), raw, null, ttest), COLUMN_GRAPH_LABELS[k]);
  }
  const summary = { ...raw, subcolumnFormat: "mean_sd_n" } as DataTableModel;
  assert.equal(columnKindLabel("scatter", graph({ summary: "median_iqr" }), summary, null, null),
    "Scatter (points + summary)");
  assert.equal(columnKindLabel("bar", graph({ superplot: { on: true } }), raw, null, null),
    "Bar (summary + points)");
});
