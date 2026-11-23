// End-to-end check of the figure conventions: SuperPlot mode on a column
// table with three experiments per group (replicate-mean overlay, then
// "Statistics on replicate means" with n = number of experiments and its
// brackets on the SuperPlot), the legend sentence under the graph, the
// classic theme, the colour-vision check, P-value styles, the volcano plot
// of a multiple-variables table, and censor marks on a new survival graph.
//   node scripts/e2e-figures.mjs http://localhost:5194/
import { chromium } from "playwright";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

// The header's File and View menus (DECISIONS 5): open one, pick an item.
const fileMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};
const viewMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "View", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};

const baseUrl = process.argv[2] ?? "http://localhost:5173/";
// ?example=1 opens the example project directly (no start screen, no tour).
const url = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("example", "1");
  return u.toString();
})();
const browser = await chromium.launch({
  args: process.env.HOST_RESOLVER ? [`--host-resolver-rules=${process.env.HOST_RESOLVER}`] : [],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
// The results guidance (chips, notes, the unit question, the links, the
// plan check) sits in the Checks row of the results headline, a <details>
// (DECISIONS 3): open it before using what is inside.
const openChecks = async (p = page) => {
  const d = p.locator(".pane-answer details.checks").first();
  await d.waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
  if (await d.count() && !(await d.evaluate((e) => e.open))) await d.locator("summary").click();
};

page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
const tmp = mkdtempSync(join(tmpdir(), "opendose-fig-"));
const graphSettings = async () => {
  const pop = page.getByRole("dialog", { name: "Graph settings" });
  if (!(await pop.isVisible().catch(() => false))) {
    await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
  }
  return pop;
};
const closeSettings = () => page.keyboard.press("Escape");
// SHOTS=<dir> saves screenshots of the graph card along the way.
const shot = async (name) => {
  if (!process.env.SHOTS) return;
  await closeSettings();
  await page.waitForTimeout(300);
  await page.locator(".plot-card").screenshot({ path: join(process.env.SHOTS, `${name}.png`) });
};
const plot = () => page.evaluate(() => {
  const gd = document.querySelector(".plot-card .plot");
  const l = gd?.layout ?? {};
  return {
    traces: (gd?.data ?? []).map((t) => ({ role: t.meta?.odTag?.role ?? null,
      means: !!t.meta?.superplotMeans, name: t.name ?? "", n: (t.y ?? []).length,
      x: t.x ?? [], y: t.y ?? [], symbol: t.marker?.symbol, color: t.marker?.color })),
    plotBg: l.plot_bgcolor, fontWeight: l.font?.weight, fontFamily: l.font?.family,
    yRange: l.yaxis?.range, yGrid: l.yaxis?.showgrid, legendTitle: l.legend?.title?.text,
    brackets: (l.annotations ?? []).filter((a) => a.name === "bracket-label").map((a) => a.text),
    shapes: (l.shapes ?? []).map((s) => s.name ?? ""),
    annotations: (l.annotations ?? []).map((a) => ({ name: a.name ?? "", text: a.text ?? "" })),
  };
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });

// --- a column table: three groups, three experiments (subcolumns) each,
// six cells per experiment; experiment 3 runs high in every group ---
const groups = [["Control", 10], ["Drug A", 13], ["Drug B", 17]];
const rows = 6;
const datasets = groups.map(([name, base], g) => ({
  name,
  subTitles: ["Exp 1", "Exp 2", "Exp 3"],
  rows: Array.from({ length: rows }, (_, r) => [0, 1, 2].map((e) =>
    String(+(base + e * 1.5 + ((r * 7 + g * 3 + e * 5) % 9) * 0.35 - 1.4).toFixed(2)))),
}));
const SUPER = join(tmp, "superplot.json");
writeFileSync(SUPER, JSON.stringify({
  version: 2, title: "SuperPlot check",
  prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic",
    scheme: "colorblind", digits: 4 },
  sheets: [
    { id: "d1", kind: "data", name: "Cell speed", table: {
      type: "column", x: Array(rows).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
      yTitle: "Speed (µm/min)", rowTitles: Array(rows).fill(""), datasets,
      subcolumnFormat: "replicates", replicateLayout: "side_by_side" } },
    { id: "r1", kind: "results", parentId: "d1", name: "Column stats of Cell speed",
      analysis: "column", options: { analysis: "column_statistics" } },
    { id: "g1", kind: "graph", parentId: "d1", resultsId: "r1", graphType: "scatter",
      name: "Graph of Cell speed",
      settings: { titles: { x: "", y: "" }, scheme: "colorblind",
        column: { spread: "swarm", caption: "below" } } },
  ],
}));
await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', SUPER);
await page.waitForFunction(() => document.querySelector(".plot-card .plot")?.data?.length > 0,
  { timeout: 60000 });
await page.waitForTimeout(600);
{
  const p = await plot();
  expect("column graph draws before SuperPlot mode (no replicate overlay)",
    p.traces.every((t) => !t.means), `${p.traces.length} traces`);
  // One legend card under the graph (report/GraphLegend.tsx), open in the
  // "Under the graph" caption mode, opening with the figure package's
  // legend-sentence clause.
  expect("one figure-legend card under the graph",
    await page.locator(".plot-card .figure-legend").count() === 1
    && await page.locator(".plot-card .graph-caption").count() === 0);
  const cap = await page.locator(".plot-card .figure-legend[open] .figure-legend-text").innerText()
    .catch(() => "");
  expect("legend under the graph states mean ± SD and n",
    cap.startsWith("Mean ± SD, with individual values.") && cap.includes("n = 18 per group"), cap);
  expect("no duplicate Figure legend card under the methods text",
    await page.locator(".pane-methods .figure-legend-text").count() === 0);
}

// SuperPlot mode
{
  const pop = await graphSettings();
  await pop.getByLabel("Colour every point by experiment (SuperPlot)").check();
  await page.waitForTimeout(800);
  const p = await plot();
  const means = p.traces.filter((t) => t.means);
  expect("SuperPlot: one replicate-mean overlay trace per experiment", means.length === 3,
    `${means.length} overlay traces`);
  expect("SuperPlot: every overlay has one mean per group",
    means.every((t) => t.y.filter((v) => v !== null).length === 3));
  const reps = p.traces.filter((t) => t.role === "replicate" && !t.means);
  expect("SuperPlot: points coloured by experiment (3 × 3 traces, 54 values)",
    reps.length === 9 && reps.reduce((n, t) => n + t.n, 0) === 54,
    `${reps.length} traces, ${reps.reduce((n, t) => n + t.n, 0)} values`);
  expect("SuperPlot: experiments differ by colour and symbol",
    new Set(means.map((t) => t.color)).size === 3 && new Set(means.map((t) => t.symbol)).size === 3);
  // beeswarm: no two points of a group overlap (in px)
  const overlap = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const xa = gd._fullLayout.xaxis, ya = gd._fullLayout.yaxis;
    const pts = gd.data.filter((t) => t.meta?.odTag?.role === "replicate" && !t.meta?.superplotMeans)
      .flatMap((t) => t.x.map((x, i) => [xa.l2p(x), ya.l2p(t.y[i])]));
    let worst = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        worst = Math.min(worst, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
      }
    }
    return worst;
  });
  expect("beeswarm: points do not overlap (min distance ≥ 6 px)", overlap >= 6 - 0.6,
    `${overlap.toFixed(2)} px`);
  const cap = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("legend in SuperPlot mode: experiment means, values from 3 independent experiments",
    cap.startsWith("Mean ± SD of the experiment means")
    && cap.includes("n = 18 values per group from 3 independent experiments"), cap);
}

// Statistics on replicate means
{
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Statistics on replicate means" }).click();
  await page.waitForSelector(".replicate-means-head h3", { timeout: 60000 });
  await page.waitForTimeout(500);
  const head = await page.locator(".replicate-means-head h3").innerText();
  expect("replicate-means results: n = number of experiments",
    /on replicate means \(n = 3 experiments\)/.test(head), head);
  const rowsShown = await page.locator(".replicate-means-head tbody tr").count();
  expect("replicate-means table: one row per experiment", rowsShown === 3, String(rowsShown));
  expect("results sheet named for replicate means",
    await page.locator(".nav-item[aria-label='Stats on replicate means of Cell speed']").count() === 1);
  // ordinary one-way ANOVA with Tukey: its brackets land on the SuperPlot
  await page.locator(".controls").getByRole("combobox", { name: "Test on the replicate means" })
    .selectOption("anova");
  await page.waitForFunction(() => document.querySelector(".replicate-means-head h3")?.textContent
    ?.startsWith("Ordinary one-way ANOVA"), { timeout: 60000 });
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .some((a) => a.name === "bracket-label"), { timeout: 15000 }).catch(() => {});
  const p = await plot();
  expect("SuperPlot stays on while bound to replicate-mean statistics",
    p.traces.filter((t) => t.means).length === 3);
  expect("brackets from the replicate-mean ANOVA on the SuperPlot", p.brackets.length === 3,
    p.brackets.join(" ") || JSON.stringify(p.annotations));
  const methods = await page.locator(".methods-text p").first().innerText().catch(() => "");
  expect("methods text says statistics ran on the 3 experiment means",
    methods.includes("3 experiment means"), methods.slice(0, 120));
  const leg = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("legend on replicate means: n counts experiments, the values inside each",
    leg.includes("n = 3 independent experiments (18 values) per group"), leg);
}

await shot("superplot");
// P-value style and hide ns on the brackets
{
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const cd = page.locator("dialog.fmt-dialog");
  await cd.getByLabel("P value style").selectOption("apa");
  await cd.getByLabel("Label", { exact: true }).selectOption("p");
  await cd.getByRole("button", { name: "Apply and close" }).click();
  await page.waitForTimeout(500);
  const p = await plot();
  expect("APA style P values on the brackets (no leading zero)",
    p.brackets.length > 0 && p.brackets.every((b) => /^p [=<] \.\d+$/.test(b)), p.brackets.join(" | "));
  const pop2 = await graphSettings();
  await pop2.getByRole("button", { name: "Pairwise comparisons…" }).click();
  await cd.getByLabel("Hide non-significant (ns) pairs").check();
  await cd.getByRole("button", { name: "Apply and close" }).click();
  await page.waitForTimeout(500);
  const q = await plot();
  const ns = p.brackets.filter((b) => Number(b.replace(/^p [=<] /, "")) >= 0.05).length;
  expect("hide ns drops the non-significant brackets", q.brackets.length === p.brackets.length - ns,
    `${p.brackets.length} → ${q.brackets.length}`);
}

// The project's P-value style (Preferences → Reporting) is the single
// source: a graph without its own style follows it.
{
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const cd = page.locator("dialog.fmt-dialog");
  await cd.getByLabel("P value style").selectOption("");
  await cd.getByRole("button", { name: "Apply and close" }).click();
  await page.waitForTimeout(400);
  const before = await plot();
  expect("without its own style the graph draws GraphPad P values (project default)",
    before.brackets.length > 0 && before.brackets.every((b) => /^P [=<] 0\.\d+$/.test(b)),
    before.brackets.join(" | "));
  await closeSettings();
  await viewMenu(page, "Preferences…");
  await page.getByLabel("P-value style (tables, sentences, legends)").selectOption("apa");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .filter((a) => a.name === "bracket-label").every((a) => /^p [=<] \.\d+$/.test(a.text)), null,
  { timeout: 10000 }).catch(() => {});
  const after = await plot();
  expect("project P style APA redraws the brackets without a per-graph setting",
    after.brackets.length > 0 && after.brackets.every((b) => /^p [=<] \.\d+$/.test(b)),
    after.brackets.join(" | "));
  const table = await page.locator(".pane-results .results-table tbody tr", { hasText: /P value/ }).first()
    .innerText().catch(() => "");
  expect("results table follows the same project style", /(< \.001|\s\.\d{3})/.test(table) && !/0\.\d{4}/.test(table), table.replace(/\s+/g, " ").slice(0, 400));
  await viewMenu(page, "Preferences…");
  await page.getByLabel("P-value style (tables, sentences, legends)").selectOption("graphpad");
  await page.keyboard.press("Escape");
}

// Classic theme
{
  const pop = await graphSettings();
  await pop.getByLabel("Graph theme").selectOption("classic");
  await page.waitForTimeout(600);
  const p = await plot();
  expect("classic theme: white plot background", p.plotBg === "#ffffff", p.plotBg);
  expect("classic theme: bold sans-serif text", p.fontWeight === "bold" && /Arial/.test(p.fontFamily),
    `${p.fontWeight} ${p.fontFamily}`);
  expect("classic theme: no grid, legend title hidden", p.yGrid === false && p.legendTitle === "");
  expect("classic theme: Y axis ends on a tick", Array.isArray(p.yRange), JSON.stringify(p.yRange));
}

await shot("classic");
// Colour-vision check
{
  const pop = await graphSettings();
  await pop.locator("details.cvd-check > summary").click();
  await page.waitForSelector(".cvd-table tr[data-mode='deuteranopia']", { timeout: 5000 });
  const modes = await pop.locator(".cvd-table tr").count();
  const swatches = await pop.locator(".cvd-table tr[data-mode='tritanopia'] .cvd-swatch").count();
  expect("CVD preview: normal vision plus five simulations", modes === 6, String(modes));
  expect("CVD preview: the three experiment colours are simulated", swatches === 3, String(swatches));
  if (process.env.SHOTS) await pop.screenshot({ path: `${process.env.SHOTS}/cvd.png` });
  await closeSettings();
}

// Small-n advice on a bar graph without points
{
  await page.locator(".graph-select").selectOption("bar");
  await page.waitForTimeout(400);
  const pop = await graphSettings();
  await pop.getByLabel("Colour every point by experiment (SuperPlot)").uncheck();
  await page.waitForTimeout(300);
  const n = await pop.locator(".gopt-advice").count();
  expect("no small-n advice while the points are shown", n === 0);
  await closeSettings();
}

// --- grouped SuperPlot: 2 rows × 2 data sets, six subcolumns mapped in
// pairs to three experiments (technical duplicates) ---
{
  const sub = 6;
  const gds = ["Vehicle", "Drug"].map((name, d) => ({
    name,
    rows: [0, 1].map((r) => Array.from({ length: sub }, (_, k) =>
      String(+(20 + d * 6 + r * 3 + Math.floor(k / 2) * 1.2 + (k % 2) * 0.4).toFixed(2)))),
  }));
  const GROUPED = join(tmp, "grouped-superplot.json");
  writeFileSync(GROUPED, JSON.stringify({
    version: 2, title: "Grouped SuperPlot",
    prefs: { defaultTableType: "grouped", errorBars: "sd", ciMethod: "asymptotic",
      scheme: "default", digits: 4 },
    sheets: [
      { id: "d2", kind: "data", name: "Two factors", table: {
        type: "grouped", x: ["", ""], xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "Signal",
        rowTitles: ["Day 1", "Day 3"], datasets: gds, subcolumnFormat: "replicates",
        replicateLayout: "side_by_side", replicates: { by: "subcolumns", of: [0, 0, 1, 1, 2, 2] } } },
      { id: "r2", kind: "results", parentId: "d2", name: "Two-way ANOVA of Two factors",
        analysis: "grouped_two_way", options: {} },
      { id: "g2", kind: "graph", parentId: "d2", resultsId: "r2", graphType: "grouped_interleaved",
        name: "Graph of Two factors",
        settings: { titles: { x: "", y: "" }, scheme: "default",
          grouped: { superplot: { on: true }, caption: "below" } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', GROUPED);
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.superplotMeans), { timeout: 60000 });
  await page.waitForTimeout(500);
  const p = await plot();
  const means = p.traces.filter((t) => t.means);
  expect("grouped SuperPlot: one overlay trace per experiment (3, from 6 subcolumns)",
    means.length === 3, String(means.length));
  expect("grouped SuperPlot: a mean per cell in every overlay",
    means.every((t) => t.y.filter((v) => v !== null).length === 4));
  await shot("grouped-superplot");
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Statistics on replicate means" }).click();
  await page.waitForFunction(() => /\(n = 3 experiments\)/.test(
    document.querySelector(".replicate-means-head h3")?.textContent ?? ""), { timeout: 60000 })
    .catch(() => {});
  const head = await page.locator(".replicate-means-head h3").innerText().catch(() => "");
  expect("grouped: two-way ANOVA on replicate means, n = 3 experiments",
    head.includes("Two-way ANOVA on replicate means (n = 3 experiments)"), head);
}

// --- volcano plot on the multiple-variables example ---
{
  await fileMenu(page, "New data table…");
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="multivariable"]').check();
  await dlg.getByText("Example data").click();
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".mv-results h3:has-text('Descriptive statistics')", { timeout: 60000 });
  await page.locator(".graph-select").selectOption("mv_volcano");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
    .some((s) => s.name === "volcano-threshold"), { timeout: 20000 }).catch(() => {});
  const p = await plot();
  const thr = p.shapes.filter((n) => n === "volcano-threshold").length;
  expect("volcano plot renders with fold-change and P threshold lines", thr === 3, String(thr));
  expect("volcano plot: up, down and not-significant traces",
    p.traces.filter((t) => t.role === "points").length === 3);
  const pop = await graphSettings();
  await pop.getByLabel("Fold change", { exact: true }).waitFor({ timeout: 10000 }).catch(() => {});
  expect("volcano options list the fold-change and P columns",
    await pop.getByLabel("Fold change", { exact: true }).count() === 1
    && await pop.getByLabel("P value (or adjusted P)").count() === 1);
  await closeSettings();
}

// --- heat map: z-scores and clustering through the engine ---
{
  await fileMenu(page, "New data table…");
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="grouped"]').check();
  await dlg.getByText("Example data").click();
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".plot-card .graph-select", { timeout: 60000 });
  await page.locator(".graph-select").selectOption("grouped_heatmap");
  await page.waitForTimeout(600);
  const pop = await graphSettings();
  await pop.getByLabel("Standardise (z-score)").selectOption("rows");
  const box = pop.getByLabel(/^Cluster rows/);
  await page.waitForFunction(() => !document.querySelector(
    "[role=dialog][aria-label='Graph settings'] input[type=checkbox]:disabled"), { timeout: 30000 })
    .catch(() => {});
  const enabled = await box.isEnabled();
  expect("heat map: cluster toggles enabled by the engine's cluster_heatmap", enabled);
  if (enabled) await box.check();
  await closeSettings();
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const z = gd.data.find((t) => t.type === "heatmap" && t.showscale !== false)?.z ?? [];
    return { rows: gd.layout.yaxis?.ticktext ?? [], z,
      tree: gd.data.filter((t) => t.xaxis === "x3" && t.yaxis === "y3" && t.mode === "lines").length,
      treeAxis: !!gd.layout.xaxis3 && gd.layout.xaxis3.domain?.[0] > gd.layout.xaxis.domain?.[1] - 1e-9 };
  });
  expect("heat map: rows z-scored (each row averages 0)", info.z.every((r) =>
    Math.abs(r.filter((v) => v !== null).reduce((a, b) => a + b, 0)) < 1e-9), JSON.stringify(info.z));
  expect("heat map: clustered rows are a reordering of the table's rows",
    [...info.rows].sort().join() === ["Day 14", "Day 21", "Day 7"].join(), info.rows.join(", "));
  // Three rows: two links in the row dendrogram, drawn beside the map with
  // the Clustered heat map assay's drawing.
  expect("heat map: clustered rows draw their dendrogram beside the map",
    info.tree === 2 && info.treeAxis, `${info.tree} links, axis beside: ${info.treeAxis}`);
  const pop2 = await graphSettings();
  await pop2.getByLabel("Dendrograms").uncheck();
  await closeSettings();
  await page.waitForTimeout(600);
  const off = await page.evaluate(() => document.querySelector(".plot-card .plot").data
    .filter((t) => t.xaxis === "x3").length);
  expect("heat map: the Dendrograms option hides the tree", off === 0, String(off));
}

// --- a new survival graph marks censored subjects ---
{
  await fileMenu(page, "New data table…");
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="survival"]').check();
  await dlg.getByText("Example data").click();
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => /censored/.test(t.name ?? "")), { timeout: 60000 }).catch(() => {});
  const p = await plot();
  const ticks = p.traces.filter((t) => /\(censored\)/.test(t.name));
  expect("survival: censor ticks on a new graph (both groups)", ticks.length === 2,
    ticks.map((t) => `${t.name}:${t.n}`).join(" "));
  const pop = await graphSettings();
  await pop.getByLabel("Nudge curves apart").fill("1");
  await page.waitForTimeout(400);
  const q = await plot();
  const starts = q.traces.filter((t) => t.role === "line").map((t) => t.y[0]);
  expect("survival: nudging separates the curves at 100%", new Set(starts).size === starts.length,
    starts.join(", "));
  await closeSettings();
}

// --- "n might be cells": Assign replicates… feeds the legend and details ---
{
  const cellsN = 60;
  const val = (g, i) => String(+(10 + g * 2 + ((i * 7) % 11) * 0.3).toFixed(2));
  const CELLS = join(tmp, "cells.json");
  writeFileSync(CELLS, JSON.stringify({
    version: 2, title: "Cells check",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic",
      scheme: "colorblind", digits: 4 },
    sheets: [
      { id: "c1", kind: "data", name: "Cell area", table: {
        type: "column", x: Array(cellsN).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
        yTitle: "Area", rowTitles: Array(cellsN).fill(""), subcolumnFormat: "replicates",
        replicateLayout: "side_by_side",
        datasets: [
          { name: "Control", rows: Array.from({ length: cellsN }, (_, i) => [val(0, i)]) },
          { name: "Knockdown", rows: Array.from({ length: cellsN }, (_, i) => [val(1, i)]) },
          { name: "Experiment", rows: Array.from({ length: cellsN }, (_, i) => [`E${1 + (i % 3)}`]) },
        ] } },
      { id: "c2", kind: "results", parentId: "c1", name: "Column stats of Cell area",
        analysis: "column", options: { analysis: "column_statistics" } },
      { id: "c3", kind: "graph", parentId: "c1", resultsId: "c2", graphType: "scatter",
        name: "Graph of Cell area",
        settings: { titles: { x: "", y: "" }, scheme: "colorblind", column: { caption: "below" } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', CELLS);
  await openChecks();
  await page.waitForSelector(".guide-chip", { timeout: 60000 });
  const chip = page.locator(".guide-chip", { hasText: "n might be cells" });
  expect("the n-might-be-cells chip fires on 60 values per group", await chip.count() === 1);
  await chip.click();
  await page.locator(".guide-chip-detail").getByRole("button", { name: "Assign replicates…" }).click();
  const dlg = page.getByRole("dialog", { name: /Assign replicates/ });
  await dlg.waitFor({ timeout: 10000 });
  expect("the replicate dialog finds the experiment labels (3 experiments)",
    (await dlg.innerText()).includes("3 experiments: E1, E2, E3"), (await dlg.innerText()).slice(0, 300));
  await dlg.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector(".plot-card .figure-legend-text")?.textContent
    ?.includes("independent experiments"), null, { timeout: 15000 }).catch(() => {});
  const leg = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("legend: n = 60 cells per group from 3 independent experiments",
    leg.includes("n = 60 cells per group from 3 independent experiments"), leg);
  expect("the graph turned into a SuperPlot", (await plot()).traces.some((t) => t.means));
  expect("the chip now reports the experiments",
    await page.locator(".guide-chip", { hasText: "Cells from 3 experiments" }).count() === 1);
  await page.getByRole("button", { name: "Reporting details…" }).click();
  const det = page.getByRole("dialog", { name: /Reporting details/ });
  await det.waitFor({ timeout: 10000 });
  expect("Reporting details show the replicate map's unit and experiments",
    (await det.locator(".details-from-map").innerText()).includes("3 independent")
    && await det.getByLabel("Independent experiments (biological replicates)").getAttribute("placeholder") === "3");
  await det.getByRole("button", { name: "Cancel" }).click();
}

// --- one box-plot definition (P-04): the box takes its quartiles from the
// column statistics' percentile method and its whiskers from a stated rule.
// Reference values: src/graph/__tests__/reference/box_stats.py (numpy;
// definition 6 = R quantile type 6 = the "prism" method, definition 7 =
// type 7 = "linear"). Before this change the column box used Plotly's own
// quartiles (3, 8 on this data) and the grouped box min-max whiskers.
{
  const ACCEPT = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "100"];
  const BOX = join(tmp, "box.json");
  writeFileSync(BOX, JSON.stringify({
    version: 2, title: "Box check",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic",
      scheme: "colorblind", digits: 4 },
    sheets: [
      { id: "b1", kind: "data", name: "Box data", table: {
        type: "column", x: Array(10).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
        yTitle: "Value", rowTitles: Array(10).fill(""), subcolumnFormat: "replicates",
        replicateLayout: "side_by_side",
        datasets: [{ name: "A", rows: ACCEPT.map((v) => [v]) }] } },
      { id: "b2", kind: "results", parentId: "b1", name: "Column stats of Box data",
        analysis: "column", options: { analysis: "column_statistics", percentileMethod: "prism" } },
      { id: "b3", kind: "graph", parentId: "b1", resultsId: "b2", graphType: "box",
        name: "Box graph", settings: { titles: { x: "", y: "" }, scheme: "colorblind",
          column: { caption: "below" } } },
      { id: "b4", kind: "data", name: "Grouped box data", table: {
        type: "grouped", x: [""], xTitle: "", xFormat: "numbers", xUnit: "",
        yTitle: "Value", rowTitles: ["Day 1"], subcolumnFormat: "replicates",
        replicateLayout: "side_by_side",
        datasets: [{ name: "A", subTitles: ACCEPT.map(() => ""), rows: [ACCEPT] }] } },
      { id: "b5", kind: "graph", parentId: "b4", resultsId: null, graphType: "grouped_box",
        name: "Grouped box graph", settings: { titles: { x: "", y: "" }, scheme: "colorblind",
          grouped: { caption: "below" } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', BOX);
  const boxTrace = () => page.evaluate(() => {
    const t = (document.querySelector(".plot-card .plot")?.data ?? []).find((d) => d.type === "box");
    return t ? { q1: t.q1?.[0], median: t.median?.[0], q3: t.q3?.[0], lo: t.lowerfence?.[0],
      hi: t.upperfence?.[0], n: Array.isArray(t.y?.[0]) ? t.y[0].length : -1 } : null;
  });
  const statRow = (label) => page.evaluate((l) => {
    const tr = [...document.querySelectorAll(".pane-results tr")]
      .find((r) => r.cells[0]?.textContent?.trim().startsWith(l));
    return tr ? Number(tr.cells[1]?.textContent?.trim()) : NaN;
  }, label);
  const legendText = () => page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((d) => d.type === "box"), null, { timeout: 60000 });
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
  let b = await boxTrace();
  const q1 = await statRow("25% percentile"), med = await statRow("Median"), q3 = await statRow("75% percentile");
  expect("box (rank (n + 1)p, R type 6): q1 2.75, median 5.5, q3 8.25, Tukey whiskers 1 to 9, all 10 points",
    b && b.q1 === 2.75 && b.median === 5.5 && b.q3 === 8.25 && b.lo === 1 && b.hi === 9 && b.n === 10,
    JSON.stringify(b));
  expect("the drawn quartiles equal the column statistics table (25%, median, 75%)",
    b && q1 === b.q1 && med === b.median && q3 === b.q3, `table ${q1} / ${med} / ${q3}`);
  expect("the legend names the whisker rule (Tukey 1.5 × IQR)",
    (await legendText()).includes("Median with IQR (box) and 1.5 × IQR (Tukey) (whiskers)"), await legendText());

  // Whiskers: Minimum to maximum, then 10th to 90th percentile
  const pop = await graphSettings();
  await pop.getByLabel("Whiskers").selectOption("minmax");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .find((d) => d.type === "box")?.upperfence?.[0] === 100, null, { timeout: 15000 }).catch(() => {});
  b = await boxTrace();
  expect("Whiskers: Minimum to maximum moves the upper whisker to 100", b?.lo === 1 && b?.hi === 100,
    JSON.stringify(b));
  await pop.getByLabel("Whiskers").selectOption("p10_90");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .find((d) => d.type === "box")?.lowerfence?.[0] === 1.1, null, { timeout: 15000 }).catch(() => {});
  b = await boxTrace();
  expect("Whiskers: 10th to 90th percentile (type 6) end at 1.1 and 90.9",
    b?.lo === 1.1 && Math.abs(b?.hi - 90.9) < 1e-9, JSON.stringify(b));
  await closeSettings();
  expect("the legend follows the rule (10th to 90th percentile)",
    (await legendText()).includes("and 10th to 90th percentile (whiskers)"), await legendText());

  // The column statistics back to (n − 1)p interpolation: the box follows
  await page.getByLabel("Percentile method").selectOption("linear");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .find((d) => d.type === "box")?.q1?.[0] === 3.25, null, { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".pane-results tr")]
    .some((r) => r.cells[0]?.textContent?.trim() === "25% percentile"), null, { timeout: 30000 }).catch(() => {});
  b = await boxTrace();
  const lq1 = await statRow("25% percentile"), lq3 = await statRow("75% percentile");
  expect("percentile method (n − 1)p (R type 7): box q1 3.25, q3 7.75, equal to the table",
    b?.q1 === 3.25 && b?.median === 5.5 && b?.q3 === 7.75 && lq1 === 3.25 && lq3 === 7.75,
    `${JSON.stringify(b)}; table ${lq1} / ${lq3}`);

  // The grouped box: same definition (type 7, the grouped column
  // statistics' method), Tukey whiskers by default (it was min-max)
  await page.getByRole("treeitem", { name: "Grouped box data", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((d) => d.type === "box"), null, { timeout: 60000 });
  b = await boxTrace();
  expect("grouped box: q1 3.25, median 5.5, q3 7.75, Tukey whiskers 1 to 9 (min-max before)",
    b?.q1 === 3.25 && b?.median === 5.5 && b?.q3 === 7.75 && b?.lo === 1 && b?.hi === 9, JSON.stringify(b));
  expect("grouped box legend names Tukey whiskers",
    (await legendText()).includes("1.5 × IQR (Tukey) (whiskers)"), await legendText());
}

// --- IC50 / EC50 drop lines on the curve-fit graph (P-23). Reference
// values: engine/tests/reference/fit_graph.py (the engine's fit of the
// example table and the model's own equation at the midpoint): relative
// IC50 at LogIC50 -6.98304, response 50.4181 = (Top + Bottom) / 2;
// absolute IC50 (Baseline 0) at LogAbsoluteIC50 -6.97524, response
// 49.9281 = (Top + Baseline) / 2. Off by default: no shape before.
const FIT_X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
const FIT_Y = [["98.2", "101.5", "99.1"], ["97.0", "95.8", "99.9"], ["93.4", "90.1", "92.7"],
  ["78.9", "82.3", "80.0"], ["51.2", "48.7", "50.9"], ["22.1", "25.6", "24.0"],
  ["8.9", "10.2", "7.5"], ["3.1", "4.4", "2.2"], ["1.0", "0.5", "2.1"]];
const fitTable = (rows) => ({ type: "xy", x: FIT_X, xTitle: "[Conc.]", xFormat: "numbers", xUnit: "M",
  yTitle: "Response", rowTitles: FIT_X.map(() => ""), subcolumnFormat: "replicates",
  replicateLayout: "side_by_side", datasets: [{ name: "Drug A", subTitles: ["", "", ""], rows }] });
const fitFamily = (id, name, options, graph = {}, rows = FIT_Y) => [
  { id: `${id}d`, kind: "data", name, table: fitTable(rows.map((r) => [...r])) },
  { id: `${id}r`, kind: "results", parentId: `${id}d`, name: `Nonlin fit of ${name}`,
    analysis: "nonlin", options: { model: "log_inhibitor_vs_response_4pl", errorBars: "sd",
      autoFit: "requested", ...options } },
  { id: `${id}g`, kind: "graph", parentId: `${id}d`, resultsId: `${id}r`, graphType: "xy",
    name: `Graph of ${name}`, settings: { titles: { x: "", y: "" }, scheme: "default", ...graph } },
];
const dropShapes = () => page.evaluate(() => {
  const gd = document.querySelector(".plot-card .plot");
  const sh = (gd?.layout?.shapes ?? []).filter((s) => String(s.name ?? "").startsWith("drop:"));
  const fit = (gd?.data ?? []).find((t) => t.meta?.odTag?.role === "fit");
  const label = (gd?.layout?.annotations ?? []).find((a) => String(a.name ?? "").startsWith("drop:"));
  return { n: sh.length, v: sh.find((s) => s.name.endsWith(":v")), h: sh.find((s) => s.name.endsWith(":h")),
    curve: fit ? { x: [...fit.x], y: [...fit.y] } : null, label: label?.text ?? null };
});
const curveAt = (c, x) => {
  for (let i = 0; i + 1 < c.x.length; i++) {
    if (c.x[i] <= x && x <= c.x[i + 1]) {
      return c.y[i] + (c.y[i + 1] - c.y[i]) * (x - c.x[i]) / (c.x[i + 1] - c.x[i]);
    }
  }
  return NaN;
};
const paramCell = (name) => page.evaluate((n) => {
  const tr = [...document.querySelectorAll(".pane-results tr")]
    .find((r) => r.cells[0]?.textContent?.trim() === n);
  return tr ? tr.cells[1]?.textContent?.trim() : null;
}, name);
const fitLegendText = () => page.locator(".plot-card .figure-legend-text").textContent().catch(() => "");
{
  const FIT = join(tmp, "fit.json");
  writeFileSync(FIT, JSON.stringify({
    version: 2, title: "Fit graph check",
    prefs: { defaultTableType: "xy", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      ...fitFamily("rel", "Relative IC50", {}),
      ...fitFamily("abs", "Absolute IC50", { model: "absolute_ic50_log", modelConstants: { Baseline: "0" } },
        { xy: { dropLines: true } }),
      // P-24: 4PL, weighting 1/Y², confidence band, ROUT (Q = 1%) removes
      // the 30.0 at 1e-7 M (engine/tests/reference/fit_graph.py legend_4pl)
      ...fitFamily("leg", "ROUT fit", { weighting: "1/Y2", routEnabled: true, routQ: "1",
        bands: "confidence" }, {}, FIT_Y.map((r, i) => (i === 4 ? ["30.0", "48.7", "50.9"] : r))),
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', FIT);
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "fit"), null, { timeout: 120000 });
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
  expect("drop lines are off by default (no shape)", (await dropShapes()).n === 0);
  const pop = await graphSettings();
  await pop.getByRole("checkbox", { name: "Show IC50 drop lines" }).check();
  await pop.getByRole("checkbox", { name: "Write the IC50 next to the point" }).check();
  await closeSettings();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
    .some((s) => s.name === "drop:0:v"), null, { timeout: 30000 }).catch(() => {});
  let d = await dropShapes();
  const shown = await paramCell("LogIC50");
  expect("Show IC50: the vertical line's x is the reported LogIC50 (-6.98304; table -6.983)",
    d.v && Math.abs(d.v.x0 - -6.98304) < 5e-6 && Number(shown) === Number(d.v.x0.toPrecision(4)),
    `${d.v?.x0} / table ${shown}`);
  expect("its y is the curve at that x: 50.4181 = (Top + Bottom) / 2",
    d.v && Math.abs(d.v.y0 - 50.4181) < 5e-5 && Math.abs(curveAt(d.curve, d.v.x0) - d.v.y0) < 0.05,
    `${d.v?.y0} / curve ${d.curve && curveAt(d.curve, d.v?.x0)}`);
  expect("the lines reach both axes (plot edge) and are dashed",
    d.v?.y1 === 0 && JSON.stringify(d.v?.yref) === '["y","y domain"]' && d.h?.x1 === 0
      && d.h?.y0 === d.v?.y0 && d.v?.line?.dash === "dash", JSON.stringify(d.h));
  expect("the value label reads IC50 = 1.040e-7 M", d.label === "IC50 = 1.040e-7 M", d.label);
  expect("the legend says what the lines mark",
    (await fitLegendText()).includes("Dashed lines mark the IC50 (the concentration giving a response "
      + "half-way between the fitted Top and Bottom)."), await fitLegendText());
  // changing a Y value moves the lines with the fit
  await page.locator(".data-table input[aria-label='Drug A, Y1, row 5']").fill("30");
  await page.keyboard.press("Enter");
  await page.waitForFunction((x) => {
    const s = (document.querySelector(".plot-card .plot")?.layout?.shapes ?? []).find((v) => v.name === "drop:0:v");
    return s && Math.abs(s.x0 - x) > 1e-4;
  }, d.v.x0, { timeout: 60000 }).catch(() => {});
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  const before = d.v.x0;
  d = await dropShapes();
  const moved = await paramCell("LogIC50");
  expect("changing a Y value moves the line with the reported LogIC50",
    d.v && Math.abs(d.v.x0 - before) > 1e-4 && Number(moved) === Number(d.v.x0.toPrecision(4))
      && Math.abs(curveAt(d.curve, d.v.x0) - d.v.y0) < 0.05, `${before} -> ${d.v?.x0} / table ${moved}`);
  await shot("fit-drop-lines");

  // the absolute IC50 (Baseline 0): its own level, (Top + Baseline) / 2
  await page.getByRole("treeitem", { name: "Absolute IC50", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
    .some((s) => s.name === "drop:0:v"), null, { timeout: 120000 }).catch(() => {});
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  d = await dropShapes();
  const abs = await paramCell("LogAbsoluteIC50");
  expect("absolute IC50: x is the reported LogAbsoluteIC50 (-6.97524), y 49.9281 = (Top + Baseline) / 2",
    d.v && Math.abs(d.v.x0 - -6.97524) < 5e-6 && Math.abs(d.v.y0 - 49.9281) < 5e-5
      && Number(abs) === Number(d.v.x0.toPrecision(4)) && Math.abs(curveAt(d.curve, d.v.x0) - d.v.y0) < 0.05,
    `${d.v?.x0}, ${d.v?.y0} / table ${abs}`);
  expect("the absolute IC50 legend names its level",
    (await fitLegendText()).includes("Dashed lines mark the absolute IC50 (where the curve crosses "
      + "(Top + Baseline) / 2)."), await fitLegendText());
}


// --- the curve-fit legend names the model, what was fitted and its
// weighting, the band and the ROUT exclusions, in that order (P-24).
// Before: "Points show the mean of the replicates with error bars showing
// the standard deviation (SD); the curve is the fitted model."
{
  const LEGEND = "Points show the mean of the replicates with error bars showing the standard "
    + "deviation (SD). The curve is the log(inhibitor) vs. response, variable slope (four "
    + "parameters) model fitted to every replicate value, weighted by 1/Y²; the shaded band is its "
    + "95% confidence band. ROUT (Q = 1%) removed 1 point from the fit, drawn as × "
    + "(Drug A, X = -7, Y = 30).";
  await page.getByRole("treeitem", { name: "ROUT fit", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "outliers"), null, { timeout: 120000 }).catch(() => {});
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector(".plot-card .figure-legend-text")?.textContent
    ?.includes("ROUT"), null, { timeout: 30000 }).catch(() => {});
  const leg = await fitLegendText();
  expect("fit legend: model, fitted to every replicate weighted by 1/Y², confidence band, ROUT point",
    leg.startsWith(`${LEGEND} n = 3 replicates per X value.`), leg);
  const pop = await graphSettings();
  await pop.getByLabel("Legend sentence").selectOption("figure");
  await closeSettings();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .some((a) => a.name === "caption"), null, { timeout: 30000 }).catch(() => {});
  const cap = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .find((a) => a.name === "caption")?.text ?? "");
  const capText = cap.split("<br>").join(" ").replace(/&amp;/g, "&");
  expect("in-figure caption: the same sentence and n", capText === `${LEGEND} n = 3 replicates per X value.`,
    capText);
  await shot("fit-legend-caption");
}

// --- geometric mean ×/÷ geometric SD on a log axis, and the Checks note
// for bars on a log axis or an axis cut above zero (P-25). Reference:
// src/sheets/column/__tests__/reference/geo_summary.py (numpy, scipy
// gmean / gstd): 0.5, 1, 2, 4 -> g = 1.41421, s* = 2.44697, ends 3.46053
// and 0.577946; 1, 2, 4, 8 -> g = 2.82843, the same s*.
{
  const GEO = join(tmp, "geo.json");
  const folds = (vals) => vals.map((v) => [String(v)]);
  const colTable = { type: "column", x: Array(4).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
    yTitle: "Fold change", rowTitles: Array(4).fill(""), subcolumnFormat: "replicates",
    replicateLayout: "side_by_side",
    datasets: [{ name: "Fold A", rows: folds([0.5, 1, 2, 4]) }, { name: "Fold B", rows: folds([1, 2, 4, 8]) }] };
  writeFileSync(GEO, JSON.stringify({
    version: 2, title: "Geometric check",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      { id: "q1", kind: "data", name: "Folds", table: colTable },
      { id: "q2", kind: "results", parentId: "q1", name: "Column stats of Folds",
        analysis: "column", options: { analysis: "column_statistics" } },
      { id: "q3", kind: "graph", parentId: "q1", resultsId: "q2", graphType: "bar", name: "Graph of Folds",
        settings: { titles: { x: "", y: "" }, scheme: "default", column: { caption: "below" },
          format: { y: { scale: "log10" } } } },
      { id: "q4", kind: "data", name: "Folds cut", table: colTable },
      { id: "q5", kind: "results", parentId: "q4", name: "Column stats of Folds cut",
        analysis: "column", options: { analysis: "column_statistics" } },
      { id: "q6", kind: "graph", parentId: "q4", resultsId: "q5", graphType: "scatter",
        name: "Graph of Folds cut", settings: { titles: { x: "", y: "" }, scheme: "default",
          column: { caption: "below" }, format: { y: { min: 1 } } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', GEO);
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.type === "bar"), null, { timeout: 120000 });
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
  const pop = await graphSettings();
  await pop.getByLabel("Bars and error bars").selectOption("geo_sd");
  await closeSettings();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.type === "bar" && Math.abs(t.y[0] - Math.SQRT2) < 1e-9), null, { timeout: 30000 })
    .catch(() => {});
  const bars = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.type === "bar").map((t) => ({ y: t.y[0], hi: t.error_y?.array?.[0],
      lo: t.error_y?.arrayminus?.[0] })));
  const ends = bars.map((b) => [b.y - b.lo, b.y, b.y + b.hi]);
  const near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.abs(b);
  expect("geometric mean ×/÷ geometric SD: bar ends g / s* and g × s* (numpy: 0.577946, 1.41421, 3.46053)",
    ends.length === 2 && near(ends[0][0], 0.5779455771170363) && near(ends[0][1], 1.414213562373095)
      && near(ends[0][2], 3.4605334467245026) && near(ends[1][1], 2 * 1.414213562373095)
      && near(ends[1][2], 2 * 3.4605334467245026), JSON.stringify(ends));
  const legend = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("the legend names the geometric summary",
    legend.startsWith("Geometric mean ×/÷ geometric SD (bars), with individual values."), legend);
  const barKind = await page.locator(".plot-card").getByLabel("Graph type").locator('option[value="bar"]').textContent();
  expect("the graph type names the geometric summary: 'Bar (geometric mean ×/÷ geometric SD + points)'",
    barKind === "Bar (geometric mean ×/÷ geometric SD + points)", barKind);
  await openChecks();
  const chip = page.getByRole("button", { name: /Bars on a log axis/ });
  expect("Checks: bars on a log axis are flagged", await chip.count() === 1);
  await shot("geo-log-bars");

  // the same groups with Y starting at 1: switch the scatter graph to bars
  await page.getByRole("treeitem", { name: "Folds cut", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
  await page.locator(".plot-card").getByLabel("Graph type").selectOption("bar");
  await openChecks();
  const cut = page.getByRole("button", { name: /Bars without zero/ });
  await cut.waitFor({ timeout: 30000 }).catch(() => {});
  expect("bars with Y starting at 1: the Checks note appears", await cut.count() === 1);
  await cut.click();
  const detail = page.getByRole("region", { name: "Bars without zero" });
  const text = await detail.innerText().catch(() => "");
  expect("the note offers points or an axis break and cites its source",
    await detail.getByRole("button", { name: "Show points instead" }).count() === 1
      && await detail.getByRole("button", { name: "Start at 0 with a break" }).count() === 1
      && text.includes("starts at 1, not at 0") && text.includes("Healy, Data Visualization"), text);
  await detail.getByRole("button", { name: "Start at 0 with a break" }).click();
  await page.waitForFunction(() => !!document.querySelector(".plot-card .plot")?.layout?.yaxis3,
    null, { timeout: 30000 }).catch(() => {});
  const split = await page.evaluate(() => {
    const l = document.querySelector(".plot-card .plot")?.layout ?? {};
    return { lo: l.yaxis?.range, hi: l.yaxis3?.range };
  });
  expect("Start at 0 with a break: the axis shows 0 to 0.2, then from 1; the note goes",
    split.lo?.[0] === 0 && split.lo?.[1] === 0.2 && split.hi?.[0] === 1
      && await page.getByRole("button", { name: /Bars without zero/ }).count() === 0, JSON.stringify(split));
  await shot("geo-axis-break");
}

// --- a rank test: the graph follows the test (P-26). The example column
// table; a new graph's centre is "Follow the test" (summary "auto").
// Reference: src/sheets/column/__tests__/reference/geo_summary.py (numpy
// percentile, method "linear" = the column statistics' default):
// Control median 24.0, IQR 22.725 to 25.275; Treated A 28.9, 28.5 to 29.9.
// A graph saved before (no "auto") keeps mean ± SD.
{
  const RANK = join(tmp, "rank.json");
  const exampleTable = { type: "column", x: Array(6).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
    yTitle: "", rowTitles: Array(6).fill(""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [
      { name: "Control", rows: [["23.1"], ["25.4"], ["21.8"], ["24.9"], ["22.6"], ["26.0"]] },
      { name: "Treated A", rows: [["28.4"], ["30.2"], ["27.1"], ["31.5"], ["29.0"], ["28.8"]] },
      { name: "Treated B", rows: [["35.2"], ["33.9"], ["37.4"], ["34.1"], ["36.6"], ["35.8"]] }] };
  const fam = (id, name, column) => [
    { id: `${id}d`, kind: "data", name, table: exampleTable },
    { id: `${id}r`, kind: "results", parentId: `${id}d`, name: `t test of ${name}`,
      analysis: "column", options: { analysis: "ttest", ttestKind: "unpaired" } },
    { id: `${id}g`, kind: "graph", parentId: `${id}d`, resultsId: `${id}r`, graphType: "scatter",
      name: `Graph of ${name}`, settings: { titles: { x: "", y: "" }, scheme: "default", column } },
  ];
  writeFileSync(RANK, JSON.stringify({
    version: 2, title: "Rank check",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      ...fam("new", "Group comparison", { spread: "symmetric", caption: "below", summary: "auto" }),
      ...fam("old", "Saved before", { spread: "symmetric", caption: "below" }),
    ],
  }));
  const summaries = () => page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "summary")
    .map((t) => { const c = t.y[0], e = t.error_y ?? {};
      return [c - (e.arrayminus?.[0] ?? e.array?.[0] ?? 0), c, c + (e.array?.[0] ?? 0)]; }));
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  const chooseMannWhitney = async () => {
    await page.locator(".pane-controls").getByLabel("Analysis", { exact: true }).selectOption("ttest");
    await page.locator(".pane-controls").getByLabel("Test", { exact: true }).selectOption("mann_whitney");
    await page.waitForFunction(() => document.querySelector(".pane-answer .answer-rank")?.textContent
      ?.includes("Mann-Whitney"), null, { timeout: 60000 }).catch(() => {});
    await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  };
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', RANK);
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "summary"), null, { timeout: 120000 });
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
  // the graph-type select says what the scatter draws (it used to read
  // "Scatter (points + mean ± SD)" whatever the centre)
  const kindText = (v) => page.locator(".plot-card").getByLabel("Graph type")
    .locator(`option[value="${v}"]`).textContent();
  let sm = await summaries();
  expect("t test: the new graph shows mean ± SD (Control mean 23.967)",
    sm.length === 3 && Math.abs(sm[0][1] - 23.966666666666665) < 1e-9, JSON.stringify(sm[0]));
  expect("t test: the graph type reads 'Scatter (points + mean ± SD)'",
    await kindText("scatter") === "Scatter (points + mean ± SD)", await kindText("scatter"));
  expect("no rank line for a t test", await page.locator(".pane-answer .answer-rank").count() === 0);
  await chooseMannWhitney();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "summary" && Math.abs(t.y[0] - 24) < 1e-9), null, { timeout: 30000 })
    .catch(() => {});
  sm = await summaries();
  expect("Mann-Whitney: the graph switches to median with IQR (numpy: 22.725, 24.0, 25.275; 28.5, 28.9, 29.9)",
    sm.length === 3 && close(sm[0][0], 22.725) && close(sm[0][1], 24) && close(sm[0][2], 25.275)
      && close(sm[1][0], 28.5) && close(sm[1][1], 28.9) && close(sm[1][2], 29.9), JSON.stringify(sm));
  const line = await page.locator(".pane-answer .answer-rank").innerText().catch(() => "");
  expect("the results say what the test compares",
    line.includes("compares distributions (ranks), shown as median and IQR"), line);
  expect("the legend says median with IQR",
    (await page.locator(".plot-card .figure-legend-text").innerText().catch(() => ""))
      .startsWith("Median with IQR, with individual values."));
  expect("Mann-Whitney: the graph type reads 'Scatter (points + median with IQR)', and the bar option too",
    await kindText("scatter") === "Scatter (points + median with IQR)"
      && await kindText("bar") === "Bar (median with IQR + points)"
      && await page.locator(".plot-card").getByLabel("Graph type").inputValue() === "scatter",
    `${await kindText("scatter")} | ${await kindText("bar")}`);
  await shot("rank-median-iqr");

  // a graph saved before keeps what it draws
  await page.getByRole("treeitem", { name: "Saved before", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
  await chooseMannWhitney();
  sm = await summaries();
  const oldLine = await page.locator(".pane-answer .answer-rank").innerText().catch(() => "");
  expect("a graph saved before keeps mean ± SD under Mann-Whitney, and the line says so",
    sm.length === 3 && Math.abs(sm[0][1] - 23.966666666666665) < 1e-9
      && oldLine.includes("compares distributions (ranks); the graph shows mean ± SD."),
    `${JSON.stringify(sm[0])} / ${oldLine}`);
  expect("a graph saved before: the graph type still reads mean ± SD under Mann-Whitney",
    await kindText("scatter") === "Scatter (points + mean ± SD)", await kindText("scatter"));
}

// --- raincloud plots and violins with a stated bandwidth (P-53). The
// example column table drawn as a raincloud: the legend states each
// group's bandwidth (Silverman's rule as R bw.nrd0) and the cloud's width
// follows scipy gaussian_kde with that bandwidth. Reference:
// src/graph/__tests__/reference/kde.py (numpy, scipy): h = 1.06637
// (Control), 0.657106 (Treated A), 0.867852 (Treated B). A new violin
// draws the same density with quartile lines at the column statistics'
// quartiles (numpy linear: Control 22.725, 24.0, 25.275).
{
  const KDE = JSON.parse((await import("node:fs")).readFileSync(
    new URL("../src/graph/__tests__/reference/kde.json", import.meta.url), "utf8"));
  const RAIN_FILE = join(tmp, "rain.json");
  const names = ["Control", "Treated A", "Treated B"];
  writeFileSync(RAIN_FILE, JSON.stringify({
    version: 2, title: "Raincloud check",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      { id: "rd", kind: "data", name: "Group comparison", table: {
        type: "column", x: Array(6).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
        yTitle: "", rowTitles: Array(6).fill(""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
        datasets: names.map((n) => ({ name: n, rows: KDE[`example ${n}`].values.map((v) => [String(v)]) })) } },
      { id: "rr", kind: "results", parentId: "rd", name: "Column stats of Group comparison",
        analysis: "column", options: { analysis: "column_statistics" } },
      { id: "rg", kind: "graph", parentId: "rd", resultsId: "rr", graphType: "scatter",
        name: "Graph of Group comparison", settings: { titles: { x: "", y: "" }, scheme: "default",
          column: { spread: "symmetric", caption: "below", summary: "auto", violin: "quartiles" } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', RAIN_FILE);
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "summary"), null, { timeout: 120000 });
  await page.locator(".plot-card").getByLabel("Graph type").selectOption("raincloud");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "violin").length === 3, null, { timeout: 30000 }).catch(() => {});
  const legend = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("raincloud legend states the bandwidths: 1.07 (Control), 0.657 (Treated A), 0.868 (Treated B)",
    legend.includes("Gaussian kernel, bandwidth by Silverman's rule of thumb (R bw.nrd0): "
      + "1.07 (Control), 0.657 (Treated A), 0.868 (Treated B)") && legend.startsWith("Raincloud:"), legend);
  const drawn = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => ["violin", "box", "points"].includes(t.meta?.odTag?.role))
    .map((t) => ({ role: t.meta.odTag.role, ds: t.meta.odTag.ds, x: [...(t.x ?? [])], y: [...(t.y ?? [])],
      q1: t.q1?.[0], median: t.median?.[0], q3: t.q3?.[0] })));
  // the cloud: x = i + base + width, width = density / peak × half-width
  let worst = 0;
  names.forEach((n, i) => {
    const r = KDE[`example ${n}`];
    const cloud = drawn.find((t) => t.role === "violin" && t.ds === i);
    if (!cloud) { worst = Infinity; return; }
    const base = Math.min(...cloud.x);
    const half = Math.max(...cloud.x) - base;
    r.idx.forEach((k, j) => {
      worst = Math.max(worst, Math.abs((cloud.x[1 + k] - base) / half - r.density[j] / r.max));
      worst = Math.max(worst, Math.abs(cloud.y[1 + k] - r.y[j]));
    });
  });
  expect("the cloud's outline is scipy's gaussian_kde with that bandwidth (512-point grid, 10 points × 3 groups)",
    worst < 1e-9, `largest difference ${worst}`);
  const box = drawn.find((t) => t.role === "box" && t.ds === 0);
  expect("the raincloud's box is the column statistics' quartiles (Control 22.725, 24, 25.275)",
    box && Math.abs(box.q1 - 22.725) < 1e-9 && box.median === 24 && Math.abs(box.q3 - 25.275) < 1e-9,
    JSON.stringify(box && [box.q1, box.median, box.q3]));
  expect("every value is drawn as rain (18 points)",
    drawn.filter((t) => t.role === "points").reduce((s, t) => s + t.y.length, 0) === 18);
  await shot("raincloud");

  // a violin from the same new graph: the stated density with quartile lines
  await page.locator(".plot-card").getByLabel("Graph type").selectOption("violin");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "decor" && t.line?.dash === "dash").length === 6, null,
  { timeout: 30000 }).catch(() => {});
  const lines = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "decor" && t.meta.odTag.ds === 0).map((t) => t.y[0]));
  expect("violin quartile lines at 22.725, 24, 25.275 (numpy linear, the column statistics' default)",
    lines.length === 3 && Math.abs(lines[0] - 22.725) < 1e-9 && lines[1] === 24 && Math.abs(lines[2] - 25.275) < 1e-9,
    JSON.stringify(lines));
  const vLegend = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("violin legend: median and quartile lines, bandwidth 1.07 (Control)",
    vLegend.startsWith("Kernel density (violin) with the median (solid line) and quartiles (dashed lines)")
      && vLegend.includes("1.07 (Control)"), vLegend);
  await shot("violin-quartiles");
}

// --- a colour pinned to a group name (P-56): "KO" pinned to vermillion
// orange (#d55e00) in Preferences; three graphs with a KO data set (first,
// second and third of their tables) all draw it in that colour, on screen
// and in SVG exports in the light theme and the dark one (print colours
// and dark colours); the other groups keep their scheme colours; Okabe-Ito
// orange (#e69f00) is warned about (2.3:1 on white), not refused.
{
  const PIN = "#d55e00", RGB = "rgb(213, 94, 0)";
  const PINS = join(tmp, "pins.json");
  const tbl = (names) => ({ type: "column", x: Array(4).fill(""), xTitle: "", xFormat: "numbers", xUnit: "",
    yTitle: "", rowTitles: Array(4).fill(""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: names.map((n, k) => ({ name: n, rows: [[`${10 + k}`], [`${12 + k}`], [`${11 + k}`], [`${13 + k}`]] })) });
  const fam = (id, name, names) => [
    { id: `${id}d`, kind: "data", name, table: tbl(names) },
    { id: `${id}g`, kind: "graph", parentId: `${id}d`, resultsId: null, graphType: "scatter",
      name: `Graph of ${name}`, settings: { titles: { x: "", y: "" }, scheme: "default",
        column: { spread: "symmetric", caption: "below", summary: "auto" } } },
  ];
  writeFileSync(PINS, JSON.stringify({ version: 2, title: "Pins",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [...fam("a", "Mice A", ["KO", "WT"]), ...fam("b", "Mice B", ["WT", "KO"]),
      ...fam("c", "Mice C", ["Het", "WT", " ko "])] }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', PINS);
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? []).length > 0, null,
    { timeout: 60000 });
  const colours = () => page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "points").map((t) => t.marker.color));
  const open = async (name) => {
    await page.getByRole("treeitem", { name: `Graph of ${name}`, exact: true }).first()
      .locator(":scope > .nav-row").click();
    await page.waitForFunction((n) => document.querySelector(".plot-card .graph-name")?.textContent === `Graph of ${n}`
      && (document.querySelector(".plot-card .plot")?.data ?? []).length > 0, name, { timeout: 30000 });
    await page.waitForTimeout(300);
  };
  await open("Mice B");
  const before = await colours();
  await viewMenu(page, "Preferences…");
  const prefs = page.getByRole("dialog", { name: "Preferences" });
  const pins = prefs.getByRole("region", { name: "Colours pinned to groups" });
  await pins.getByLabel("Group", { exact: true }).selectOption("KO");
  await pins.getByLabel("Colour", { exact: true }).fill("#e69f00");
  await pins.getByRole("button", { name: "Pin colour" }).click();
  const warn = await pins.locator(".pins-warnings").innerText();
  expect("Okabe-Ito orange is pinned with a contrast warning (2.3:1 on white), not refused",
    warn.includes("“KO” has low contrast on a white background (2.3:1; marks need 3:1).")
    && await pins.getByLabel("Colour of “KO”").inputValue() === "#e69f00", warn);
  await pins.getByLabel("Colour of “KO”").fill(PIN);
  await page.waitForFunction(() => !document.querySelector(".pins-warnings")?.textContent?.trim(), null,
    { timeout: 5000 }).catch(() => {});
  expect("vermillion (#d55e00) passes the palette check", (await pins.locator(".pins-warnings").innerText()) === "");
  await page.keyboard.press("Escape");
  await page.waitForFunction((c) => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.marker?.color === c), PIN, { timeout: 15000 }).catch(() => {});
  const after = await colours();
  expect("Mice B: KO (second) drawn in the pinned colour, WT unchanged",
    after[1] === PIN && after[0] === before[0] && before[1] !== PIN, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  const svgOf = async () => {
    const panel = page.locator(".plot-card .export-panel");
    await panel.getByLabel("Export format").selectOption("svg");
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }),
      panel.getByRole("button", { name: "Download" }).click()]);
    const f = join(tmp, `pin-${Date.now()}.svg`);
    await d.saveAs(f);
    return (await import("node:fs")).readFileSync(f, "utf8");
  };
  for (const [name, i] of [["Mice A", 0], ["Mice B", 1], ["Mice C", 2]]) {
    await open(name);
    const c = await colours();
    const svg = await svgOf();
    expect(`${name}: KO (data set ${i + 1}) is ${PIN} on screen and in the light SVG export, the others are not`,
      c[i] === PIN && c.filter((x) => x === PIN).length === 1 && svg.includes(RGB), JSON.stringify(c));
  }
  // dark theme: print colours (the default) and dark colours
  await page.locator("header").getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark", null, { timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(500);
  const darkScreen = await colours();
  const printSvg = await svgOf();
  const panel = page.locator(".plot-card .export-panel");
  await panel.getByRole("button", { name: "Options" }).click();
  const paper = page.getByRole("dialog", { name: "Export options" }).getByRole("checkbox", { name: /print colours/i });
  const hadPaper = await paper.count() ? await paper.isChecked() : null;
  if (hadPaper) await paper.uncheck();
  await page.keyboard.press("Escape");
  const darkSvg = await svgOf();
  expect(`dark theme: KO stays ${PIN} on screen, in the print-colour export and in the dark export`,
    darkScreen[2] === PIN && printSvg.includes(RGB) && darkSvg.includes(RGB) && hadPaper !== null,
    `${JSON.stringify(darkScreen)}; paper option ${hadPaper}`);
  if (hadPaper) {
    await panel.getByRole("button", { name: "Options" }).click();
    await paper.check();
    await page.keyboard.press("Escape");
  }
  await page.locator("header").getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
}

// --- brackets for the pairs of rows on the contingency graphs (P-14).
// The plan's acceptance data, WT 18/20, Het 15/20, KO 5/20 positive;
// engine/tests/reference/pairwise_proportions.py (scipy per pair,
// statsmodels multipletests "holm"): Holm-adjusted 0.4075 (WT vs. Het),
// 3.719e-4 (WT vs. KO), 0.008853 (Het vs. KO). Before: the contingency
// graphs drew no brackets (no comparisons reached them).
{
  const CT = join(tmp, "contingency.json");
  const ctTable = { type: "contingency", x: ["", "", ""], xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "",
    rowTitles: ["WT", "Het", "KO"], subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [{ name: "Positive", rows: [["18"], ["15"], ["5"]] }, { name: "Negative", rows: [["2"], ["5"], ["15"]] }] };
  const ctGraph = (id, graphType, name, comparisons) => ({ id, kind: "graph", parentId: "c1", resultsId: "c2",
    graphType, name, settings: { titles: { x: "", y: "" }, scheme: "default", format: { comparisons } } });
  writeFileSync(CT, JSON.stringify({
    version: 2, title: "Contingency brackets",
    prefs: { defaultTableType: "contingency", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      { id: "c1", kind: "data", name: "Genotypes", table: ctTable },
      { id: "c2", kind: "results", parentId: "c1", name: "Chi-square of Genotypes", analysis: "contingency",
        options: { pairwise: "holm" } },
      ctGraph("c3", "contingency_stacked_percent", "Percent of each row", { show: true }),
      ctGraph("c4", "contingency_stacked_counts", "Counts of each row", { show: true, display: "p" }),
      ctGraph("c5", "contingency_grouped_counts", "Grouped counts", { show: true }),
    ],
  }));
  const brackets = () => page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const shapes = (gd?.layout?.shapes ?? []).filter((s) => s.name === "bracket" && s.y0 === s.y1);
    return { lines: shapes.map((s) => [s.x0, s.x1, Math.round(s.y0 * 1e9) / 1e9]),
      labels: (gd?.layout?.annotations ?? []).filter((a) => a.name === "bracket-label").map((a) => a.text),
      top: gd?._fullLayout?.yaxis?.range?.[1], ticks: gd?.layout?.yaxis?.tickvals ?? null };
  });
  const openGraph = async (name, labelled) => {
    await page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .nav-row").click();
    await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
    if (labelled) {
      await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
        .some((a) => a.name === "bracket-label"), null, { timeout: 30000 }).catch(() => {});
    } else await page.waitForTimeout(800);
  };
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', CT);
  await openGraph("Percent of each row", true);
  const adj = (await page.locator(".pane-results .pairwise-table tbody tr").allInnerTexts())
    .map((t) => t.split("\t").map((c) => c.trim())[4]);
  expect("P-14: the results' Holm-adjusted P are 0.4075, 3.719e-4, 0.008853 (statsmodels reference)",
    JSON.stringify(adj) === JSON.stringify(["0.4075", "3.719e-4", "0.008853"]), JSON.stringify(adj));
  let b = await brackets();
  expect("percent graph: a bracket per pair of rows, joining the rows' stacks (WT 0, Het 1, KO 2)",
    JSON.stringify(b.lines.map((l) => [l[0], l[1]])) === "[[0,1],[1,2],[0,2]]", JSON.stringify(b.lines));
  expect("percent graph: brackets clear the 100% stack tops (110, 120, 130) and the axis grows to hold them",
    JSON.stringify(b.lines.map((l) => l[2])) === "[110,120,130]" && b.top > 130, `${JSON.stringify(b.lines)} top ${b.top}`);
  expect("percent graph: its ticks still stop at 100%", JSON.stringify(b.ticks) === "[0,20,40,60,80,100]",
    JSON.stringify(b.ticks));
  expect("percent graph: asterisks from the Holm-adjusted P (ns, **, ***)",
    JSON.stringify(b.labels) === '["ns","**","***"]', JSON.stringify(b.labels));
  const legend = await page.locator(".plot-card .figure-legend-text").textContent().catch(() => "");
  expect("the legend names the pairs, the test per pair, the family, where the exact P are, and the star scale",
    legend.startsWith("Brackets compare pairs of rows, each tested by Fisher's exact test when any expected "
      + "count was below 5 and otherwise by the chi-square test, with P values adjusted for 3 comparisons "
      + "(Holm). The exact adjusted P values are in the results (Pairs of rows).")
      && legend.includes("* P ≤ 0.05, ** P ≤ 0.01, *** P ≤ 0.001, **** P ≤ 0.0001; ns, not significant: P > 0.05."),
    legend);
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const dlg = page.getByRole("dialog", { name: "Pairwise comparisons" });
  const pairs = (await dlg.locator(".fmt-pair").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  expect("the dialog lists the pairs of rows with their adjusted P, from the contingency results",
    JSON.stringify(pairs) === JSON.stringify(["WT vs. Het P = 0.4075 ns", "WT vs. KO P = 0.00037 ***",
      "Het vs. KO P = 0.0089 **"])
      && (await dlg.locator(".modal-text").first().innerText()).startsWith("From: pairs of rows, adjusted P (Holm)."),
    JSON.stringify(pairs));
  expect("no compact letters for rows (they are not the graph's data sets)",
    await dlg.getByRole("tab", { name: "Compact letters" }).count() === 0);
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await shot("contingency-brackets");

  await openGraph("Counts of each row", true);
  b = await brackets();
  expect("counts graph: exact adjusted P above the row totals (20): 22, 24, 26",
    JSON.stringify(b.labels) === '["P = 0.4075","P = 0.0089","P = 0.00037"]'
      && JSON.stringify(b.lines.map((l) => l[2])) === "[22,24,26]", JSON.stringify(b));
  expect("counts graph: the legend says the P values shown are exact",
    (await page.locator(".plot-card .figure-legend-text").textContent().catch(() => "")).includes("P values shown are exact."));

  await openGraph("Grouped counts", false);
  b = await brackets();
  const gLegend = await page.locator(".plot-card .figure-legend-text").textContent().catch(() => "");
  expect("grouped bars: no brackets, and the legend says why (no star scale)",
    b.lines.length === 0 && gLegend.startsWith("No brackets between rows: grouped bars show each row as a "
      + "cluster of bars, so a bracket between two rows has no single bar to join; the stacked bar graphs "
      + "draw them.") && !gLegend.includes("* P ≤ 0.05"), gLegend);
  const gPop = await graphSettings();
  expect("grouped bars: the graph options say why, and offer no Pairwise comparisons dialog",
    await gPop.getByText("No brackets for the pairs of rows: grouped bars show each row").count() === 1
      && await gPop.getByRole("button", { name: "Pairwise comparisons…" }).count() === 0);
  await closeSettings();
}

// --- the equivalence margin on the estimation plot (P-12). The P-12 e2e
// data (A = 10.8 ... 9.9, B = A - 0.2); engine/tests/reference/
// equivalence_tost.py (statsmodels ttost_ind), margin ±1: A − B = 0.2,
// 90% CI -0.2403 to 0.6403. The plot's control is A, so it shows B − A:
// the margin ±1 and the CI mirrored to -0.6403 to 0.2403. Before: the
// estimation plot drew no margin; a family without a margin still draws
// none (the e2e-check estimation pins).
{
  const EQ = join(tmp, "equivalence.json");
  const A = ["10.8", "10.75", "10.55", "10.5", "9.6", "9.65", "9.85", "9.9"];
  const eqTable = { type: "column", x: A.map(() => ""), xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "Value",
    rowTitles: A.map(() => ""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [{ name: "A", rows: A.map((v) => [v]) },
      { name: "B", rows: A.map((v) => [String(+(Number(v) - 0.2).toFixed(2))]) }] };
  const fam = (p, name, ttestKind) => [
    { id: `${p}d`, kind: "data", name, table: eqTable },
    { id: `${p}t`, kind: "results", parentId: `${p}d`, name: `t test of ${name}`, analysis: "column",
      options: { analysis: "ttest", ttestKind, equivalence: "equivalence", equivalenceMargin: "1" } },
    { id: `${p}e`, kind: "results", parentId: `${p}d`, name: `Estimation of ${name}`, analysis: "estimation",
      options: {} },
    { id: `${p}g`, kind: "graph", parentId: `${p}d`, resultsId: `${p}e`, graphType: "estimation",
      name: `Estimation plot of ${name}`, settings: { titles: { x: "", y: "" }, scheme: "default" } },
  ];
  writeFileSync(EQ, JSON.stringify({
    version: 2, title: "Equivalence margin",
    prefs: { defaultTableType: "column", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [...fam("u", "Equivalence", "unpaired"), ...fam("p", "Paired equivalence", "paired")],
  }));
  const margins = () => page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const lines = (gd?.layout?.shapes ?? []).filter((s) => String(s.name ?? "").startsWith("equivalence-margin"));
    const ci = (gd?.data ?? []).find((t) => t.name === "equivalence-ci");
    const r = gd?._fullLayout?.yaxis2?.range ?? [];
    return { lines: lines.map((s) => [s.name, s.yref, s.y0]),
      ci: ci ? [ci.y[0] - ci.error_y.arrayminus[0], ci.y[0], ci.y[0] + ci.error_y.array[0]] : null,
      labels: (gd?.layout?.annotations ?? []).filter((a) => a.name === "equivalence-margin-label").map((a) => a.text),
      range: r };
  });
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', EQ);
  await page.getByRole("treeitem", { name: "Estimation plot of Equivalence", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
    .some((s) => s.name === "equivalence-margin:upper"), null, { timeout: 180000 }).catch(() => {});
  const m = await margins();
  expect("estimation plot: dashed margin lines at -1 and +1 on the difference axis",
    JSON.stringify(m.lines) === '[["equivalence-margin:lower","y2",-1],["equivalence-margin:upper","y2",1]]'
      && JSON.stringify(m.labels) === '["margin -1","margin +1"]', JSON.stringify(m));
  const near = (a, b) => Math.abs(a - b) < 5e-5;
  expect("the t test's 90% CI, drawn as B − A: -0.6403 to 0.2403 around -0.2 (statsmodels: -0.2403 to 0.6403 for A − B)",
    m.ci && near(m.ci[0], -0.6403275) && near(m.ci[1], -0.2) && near(m.ci[2], 0.2403275), JSON.stringify(m.ci));
  expect("the difference axis holds both margin lines", m.range[0] < -1 && m.range[1] > 1, JSON.stringify(m.range));
  const legend = await page.locator(".plot-card .figure-legend-text").textContent().catch(() => "");
  expect("the legend says what the lines and the capped bar are",
    legend.includes("Dashed lines mark the equivalence margin of the t test (A − B within ±1, drawn as B minus A); "
      + "the capped bar left of the difference is that test's 90% CI (-0.6403 to 0.2403), which lies inside "
      + "the margin exactly when the two one-sided tests show equivalence (Schuirmann 1987)."), legend);
  await shot("estimation-margins");

  // a paired t test against an unpaired estimation plot: no lines, the reason
  await page.getByRole("treeitem", { name: "Estimation plot of Paired equivalence", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => document.querySelector(".plot-card .figure-legend-text")?.textContent
    ?.includes("No equivalence margin"), null, { timeout: 180000 }).catch(() => {});
  const p = await margins();
  const pLegend = await page.locator(".plot-card .figure-legend-text").textContent().catch(() => "");
  expect("paired t test, unpaired plot: no margin drawn, and the legend says why",
    p.lines.length === 0 && !p.ci
      && pLegend.includes("No equivalence margin on this plot: the t test is paired and the plot is not."), pLegend);
}

console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
if (fail.length || errors.length) {
  console.log(`\n${fail.length} check(s) failed${errors.length ? `, ${errors.length} page error(s)` : ""}`);
  process.exit(1);
}
console.log("\nall figure checks passed");
