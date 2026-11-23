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

console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
if (fail.length || errors.length) {
  console.log(`\n${fail.length} check(s) failed${errors.length ? `, ${errors.length} page error(s)` : ""}`);
  process.exit(1);
}
console.log("\nall figure checks passed");
