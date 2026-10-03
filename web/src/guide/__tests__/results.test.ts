// Results guidance: chips, banners, "why your number may differ", data-
// entry hints and the explainers library. Run: npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";
import { resultBanners } from "../banners.ts";
import { resultChips, type ResultContext } from "../checks.ts";
import { differNotes } from "../differ.ts";
import { entryHints, groupedToXY } from "../entry.ts";
import { EXPLAINERS, explainer, searchExplainers } from "../explainers.ts";
import { groupChecks, missingInRows } from "../stats.ts";

const column = (cols: Record<string, (number | "")[]>): DataTableModel => normalizeTable({
  type: "column",
  datasets: Object.entries(cols).map(([name, v]) => ({ name, rows: v.map((x) => [String(x)]) })),
});
const ctx = (table: DataTableModel, analysisId: string, options: Record<string, unknown>,
  result: Record<string, unknown> | null): ResultContext => ({
  tableType: table.type, analysisId, options, result, table, groups: groupChecks(table),
});

test("chips: n < 3, unequal n and zero variance", () => {
  const t = column({ A: [1, 2], B: [3, 4, 5, 6], C: [7, 7, 7] });
  const chips = resultChips(ctx(t, "column", { analysis: "anova", anovaKind: "parametric" },
    { analysis: "anova", table: { p: 0.01 }, brown_forsythe: { F: 1, p: 0.5 } }));
  const ids = Object.fromEntries(chips.map((c) => [c.id, c]));
  assert.equal(ids.n.state, "bad");
  assert.equal(ids.n.label, "n < 3");
  assert.equal(ids["zero-sd"].state, "bad");
  assert.equal(ids.sd.state, "ok");
});

test("chips: normality per group from the engine, Welch, cells", () => {
  const t = column({ A: Array.from({ length: 120 }, (_, i) => i % 7), B: Array.from({ length: 120 }, (_, i) => i % 5) });
  const c = ctx(t, "column", { analysis: "ttest", ttestKind: "welch", datasetA: 0, datasetB: 1 },
    { analysis: "ttest", p_two_tailed: 0.2 });
  c.groups = c.groups.map((g, i) => ({ ...g, normalityP: i === 0 ? 0.001 : 0.4 }));
  const chips = resultChips(c);
  const byId = Object.fromEntries(chips.map((x) => [x.id, x]));
  assert.equal(byId.normality.state, "warn");
  assert.match(byId.normality.detail, /A P = 0.001/);
  assert.equal(byId.sd.label, "Equal SDs not assumed");
  assert.equal(byId.cells.state, "warn");
  assert.equal(byId.n.label, "n = 120 per group");
});

test("chips: rank tests do not assume normality; RM shows missing values", () => {
  const t = column({ Pre: [1, 2, 3, 4], Post: [2, "", 4, 5] });
  const chips = resultChips(ctx(t, "column", { analysis: "ttest", ttestKind: "wilcoxon" },
    { analysis: "ttest", p_two_tailed: 0.3 }));
  const byId = Object.fromEntries(chips.map((x) => [x.id, x]));
  assert.equal(byId.normality.label, "Normality not assumed");
  assert.equal(byId.missing.label, "1 missing value");
  assert.deepEqual(missingInRows(t, true), { cells: 1, rows: 1 });
});

test("chips: fits", () => {
  const t = normalizeTable({ type: "xy", x: ["1", "2", "3"], datasets: [{ name: "A", rows: [["1"], ["2"], ["3"]] }] });
  const chips = resultChips(ctx(t, "nonlin", {}, { analysis: "dose_response", datasets: [
    { name: "A", fit: { status: "ambiguous", goodness: { df: 2, r_squared: 0.99 },
      params: { LogIC50: { value: -6, se: 3, ci95: [-12, 0], constrained: false } } } },
  ] }));
  const ids = chips.map((c) => c.id);
  assert.ok(ids.includes("ambiguous") && ids.includes("wide-ci") && ids.includes("df") && ids.includes("r2"));
});

test("banners: ambiguous fit, did not converge, extrapolated", () => {
  const t = normalizeTable({ type: "xy", x: ["1"], datasets: [{ name: "A", rows: [["1"]] }] });
  const b = resultBanners(ctx(t, "nonlin", { top: { enabled: false }, bottom: { enabled: false } }, {
    analysis: "dose_response", datasets: [
      { name: "Flat", fit: { status: "ambiguous", params: {}, goodness: { df: 4 } } },
      { name: "Bad", error: "fit did not converge from any starting value" },
      { name: "Far", fit: { status: "converged", extrapolation: { param: "LogIC50" }, params: {},
        goodness: { df: 4 } } },
    ] }));
  const ids = b.map((x) => x.id);
  assert.deepEqual(ids, ["fit-failed", "fit-ambiguous", "fit-extrapolated"]);
  assert.match(b[1].fixes[0], /Constrain the plateau/);
  assert.match(b[0].title, /did not converge/);
});

test("banners: hit constraint on a user-equation range", () => {
  const t = normalizeTable({ type: "xy", x: ["1"], datasets: [{ name: "A", rows: [["1"]] }] });
  const b = resultBanners(ctx(t, "nonlin", { userEquation: { constraints: {
    Bottom: { kind: "between", min: "0", max: "10" } } } }, { analysis: "dose_response", datasets: [
    { name: "A", fit: { status: "converged", params: { Bottom: { value: 0, se: 0.1, ci95: [-0.2, 0.2],
      constrained: false } }, goodness: { df: 5 } } }] }));
  assert.ok(b.some((x) => x.id === "fit-hit-constraint" && x.title.includes("Bottom")));
});

test("banners: omnibus significant, no pairwise; and the reverse", () => {
  const t = column({ A: [1, 2, 3], B: [2, 3, 4], C: [3, 4, 5] });
  const sig = resultBanners(ctx(t, "column", { analysis: "anova" }, { analysis: "anova",
    table: { p: 0.03 }, multiple_comparisons: { comparisons: [{ p_adjusted: 0.07 }, { p_adjusted: 0.2 }] } }));
  assert.equal(sig[0].id, "omnibus-no-pairs");
  const rev = resultBanners(ctx(t, "column", { analysis: "anova" }, { analysis: "anova",
    table: { p: 0.08 }, multiple_comparisons: { comparisons: [{ p_adjusted: 0.04 }] } }));
  assert.equal(rev[0].id, "pairs-no-omnibus");
  const two = resultBanners(ctx(t, "grouped_two_way", { design: "none" }, { analysis: "two_way_anova",
    sources: { Interaction: { p: 0.01 }, "Row factor": { p: 0.4 }, Residual: { p: null } },
    multiple_comparisons: { comparisons: [{ p_adjusted: 0.3 }] } }));
  assert.equal(two[0].id, "omnibus-no-pairs");
  assert.match(two[0].body, /interaction/);
});

test("banners: normalised control, mixed-model switch, Normalize", () => {
  const t = column({ Control: [1, 1, 1], Treated: [1.4, 1.9, 1.6] });
  const b = resultBanners(ctx(t, "column", { analysis: "ttest", ttestKind: "paired" },
    { analysis: "ttest", p_two_tailed: 0.04 }));
  assert.equal(b[0].id, "normalised-control");
  const g = normalizeTable({ type: "grouped", datasets: [{ name: "A", rows: [["1", ""]] }] });
  const m = resultBanners(ctx(g, "grouped_two_way", { design: "rm_rows" },
    { analysis: "mixed_rm_two_way", missing: true, n_missing: 1, n_values: 11 }));
  assert.equal(m[0].id, "mixed-switch");
  assert.match(m[0].body, /1 missing of 12/);
  const n = resultBanners(ctx(t, "normalize", { subcolumns: "separate" }, { datasets: [] }));
  assert.equal(n[0].id, "normalized");
  assert.match(n[0].body, /SD 0/);
});

test("why your number may differ: uses the actual settings", () => {
  const t = column({ A: [1, 2, 3], B: [2, 3, 4] });
  const cs = differNotes(ctx(t, "column", { analysis: "column_statistics", percentileMethod: "prism" },
    { analysis: "column_statistics" }));
  assert.match(cs[0].used, /definition 6/);
  const kw = differNotes(ctx(t, "column", { analysis: "anova", anovaKind: "nonparametric", dunnCorrected: false },
    { analysis: "anova" }));
  assert.ok(kw.some((x) => /not corrected/.test(x.used)));
  const fit = differNotes(ctx(t, "nonlin", { ciMethod: "profile", top: { enabled: true, value: "100" } },
    { analysis: "dose_response" }));
  assert.match(fit[0].used, /Profile/);
  assert.match(fit[2].used, /Top = 100/);
  const mw = differNotes(ctx(t, "column", { analysis: "ttest", ttestKind: "mann_whitney" },
    { analysis: "ttest", p_method: "exact" }));
  assert.match(mw[1].used, /^exact/);
  assert.deepEqual(differNotes(ctx(t, "unknown_analysis", {}, {})), []);
});

test("entry hints", () => {
  const g = normalizeTable({ type: "grouped", rowTitles: ["0.1", "1", "10"],
    datasets: [{ name: "A", rows: [["5"], ["4"], ["2"]] }] });
  assert.equal(entryHints(g)[0].id, "grouped-numeric-rows");
  const xy = groupedToXY(g);
  assert.equal(xy.type, "xy");
  assert.deepEqual(xy.x, ["0.1", "1", "10"]);
  const big = column({ A: Array.from({ length: 150 }, (_, i) => i), B: Array.from({ length: 150 }, (_, i) => i) });
  assert.ok(entryHints(big).some((h) => h.id === "column-many-rows"));
  const norm = column({ Control: [100, 100, 100], Drug: [80, 70, 90] });
  assert.ok(entryHints(norm).some((h) => h.id === "normalised-control" && h.title.includes("all 100")));
  assert.deepEqual(entryHints(column({ A: [1, 2], B: [3, 4] })), []);
});

test("explainers: every entry is sourced, ~150 words, findable", () => {
  for (const e of EXPLAINERS) {
    const words = e.body.join(" ").split(/\s+/).length;
    assert.ok(words >= 90 && words <= 230, `${e.id}: ${words} words`);
    assert.ok(e.sources.length > 0 && e.sources.every((s) => s.url.startsWith("https://")), e.id);
  }
  assert.equal(new Set(EXPLAINERS.map((e) => e.id)).size, EXPLAINERS.length);
  assert.equal(explainer("superplots")?.id, "replicates");
  assert.equal(searchExplainers("hazard")[0].id, "survival");
  assert.equal(searchExplainers("SEM")[0].id, "sd-sem-ci");
  assert.equal(searchExplainers("").length, EXPLAINERS.length);
});
