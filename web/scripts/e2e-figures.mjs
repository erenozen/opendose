// End-to-end check of the figure conventions: SuperPlot mode on a column
// table with three experiments per group (replicate-mean overlay, then
// "Statistics on replicate means" with n = number of experiments and its
// brackets on the SuperPlot), the legend sentence under the graph, the
// classic theme, the colour-vision check, P-value styles, the volcano plot
// of a multiple-variables table, and censor marks on a new survival graph.
//   node scripts/e2e-figures.mjs http://localhost:5194/
import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

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

// --- interpolated unknowns drawn on the curve (P-22). Reference:
// engine/tests/reference/interpolate_unknowns.py (BCA quadratic, statsmodels
// OLS; X of each unknown and its 95% CI from investr's inversion interval).
{
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/interpolate_unknowns.json"), "utf8"));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "interpolation.json"));
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => String(t.name ?? "").endsWith("(unknowns)")), null, { timeout: 120000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const t = (gd?.data ?? []).find((d) => String(d.name ?? "").endsWith("(unknowns)"));
    const fit = (gd?.data ?? []).find((d) => d.meta?.odTag?.role === "fit");
    return t ? { x: [...t.x], y: [...t.y], plus: [...(t.error_x?.array ?? [])],
      minus: [...(t.error_x?.arrayminus ?? [])], symbol: t.marker?.symbol, fill: t.marker?.color,
      edge: t.marker?.line?.color, fitColor: fit?.line?.color,
      curve: fit ? { x: [...fit.x], y: [...fit.y] } : null } : null;
  });
  const R = REF.bca.results.slice(0, 3);
  expect("P-22 three unknown markers at each interpolated X (reference to 1e-6) and its Y",
    m?.x.length === 3 && m.x.every((x, i) => Math.abs(x / R[i].x - 1) < 1e-6) && m.y.every((y, i) => y === R[i].y),
    JSON.stringify(m && { x: m.x, y: m.y }));
  expect("P-22 each marker lies on the drawn curve",
    m?.curve && m.x.every((x, i) => Math.abs(curveAt(m.curve, x) - m.y[i]) < 2e-3),
    m?.curve && m.x.map((x) => curveAt(m.curve, x)).join(","));
  expect("P-22 horizontal bars span each unknown's 95% CI",
    m && m.x.every((x, i) => Math.abs(x - m.minus[i] - R[i].ci[0]) < 1e-3 * R[i].x
      && Math.abs(x + m.plus[i] - R[i].ci[1]) < 1e-3 * R[i].x), JSON.stringify(m && [m.minus, m.plus]));
  expect("P-22 hollow diamonds in the data set's colour",
    m?.symbol === "diamond" && m.edge === m.fitColor && m.fill !== m.fitColor, JSON.stringify(m && [m.symbol, m.fill, m.edge]));
  await shot("fit-unknowns");
}

// --- the drawn curve's X range (P-52). Reference: the model's equation
// written out here (Y = Bottom + (Top - Bottom) / (1 + 10^((LogIC50 - X)
// HillSlope))) at each drawn X, with the fitted values the engine
// returned; engine/tests/test_curve_range.py does the same in Python.
{
  const CRV = join(tmp, "curve-range.json");
  writeFileSync(CRV, JSON.stringify({
    version: 2, title: "Curve range check",
    prefs: { defaultTableType: "xy", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: fitFamily("crv", "Curve range", {}, { format: { datasets: { 0: { lineDash: "dash" } } } }),
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', CRV);
  // The previous section's plot (with its own fit) is still on screen
  // until the opened project replaces it: wait for this project first.
  await page.getByRole("treeitem", { name: "Curve range", exact: true }).first().waitFor({ timeout: 60000 });
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "fit"), null, { timeout: 120000 });
  const fits = () => page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "fit")
    .map((t) => ({ name: t.name, x: [...t.x], y: [...t.y], dash: t.line?.dash })));
  const before = await fits();
  expect("P-52 by default one curve, as before (no part beyond the data)",
    before.length === 1 && Math.abs(before[0].x[0] - -9.5) < 1e-9 && before[0].x.length === 200,
    JSON.stringify(before.map((f) => [f.name, f.x[0], f.x.length])));
  const fold = page.locator(".pane-controls details.curve-range");
  await fold.locator("summary").click();
  await page.getByRole("textbox", { name: "Start at X" }).fill("-11");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.meta?.odTag?.role === "fit" && t.x[0] === -11), null, { timeout: 60000 }).catch(() => {});
  const after = await fits();
  const main = after.find((f) => f.name === "Drug A");
  const ext = after.filter((f) => f.name.endsWith("(beyond the data)"));
  expect("P-52 acceptance: the curve draws from -11",
    ext[0]?.x[0] === -11 && Math.min(...after.flatMap((f) => f.x)) === -11, JSON.stringify(ext.map((f) => f.x.slice(0, 2))));
  expect("P-52 within the data (-9 to -5) the curve keeps its own style; beyond it, dotted",
    main && Math.abs(main.x[0] - -9) < 1e-9 && Math.abs(main.x.at(-1) - -5) < 1e-9 && main.dash === "dash"
    && ext.length === 2 && ext.every((f) => f.dash === "dot"),
    JSON.stringify(after.map((f) => [f.name, f.x[0], f.x.at(-1), f.dash])));
  const fv = await page.evaluate(() => globalThis.__opendose.results.snapshot().get("crvr")?.datasets?.[0]?.fit?.fitted_values);
  const model = (x) => fv.Bottom + (fv.Top - fv.Bottom) / (1 + 10 ** ((fv.LogXmid - x) * fv.HillSlope));
  const worst = fv ? Math.max(...after.flatMap((f) => f.x.map((x, i) => Math.abs(f.y[i] - model(x)) / Math.abs(model(x))))) : NaN;
  expect("P-52 acceptance: each drawn y equals the model at its x (hand evaluation, 1e-9)",
    worst < 1e-9, `worst relative difference ${worst}`);
  expect("P-52 the figure legend says what the dots are",
    (await fitLegendText()).includes("Beyond the X values tested the curve is dotted: there it is the "
      + "model's extrapolation, not a measurement."), await fitLegendText());
  await page.getByRole("textbox", { name: "Points on the curve" }).fill("1000");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "fit").reduce((n, t) => n + t.x.length, 0) > 1000, null,
  { timeout: 60000 }).catch(() => {});
  const fine = await fits();
  expect("P-52 resolution: 1000 points (plus the data's two ends, each shared by two parts)",
    fine.reduce((n, f) => n + f.x.length, 0) === 1002 + 2, String(fine.reduce((n, f) => n + f.x.length, 0)));
  await shot("fit-curve-range");
}

// --- drop lines on a discontinuous Y axis (P-23 follow-up). Before: no
// lines on a broken axis, while the legend still said they marked the
// IC50. Reference as above (fit_graph.py): LogIC50 -6.98304 at response
// 50.4181. A break from 15 to 35 puts it on the upper segment (yaxis3);
// a break from 40 to 60 swallows it.
{
  const SPLIT = join(tmp, "fit-split.json");
  writeFileSync(SPLIT, JSON.stringify({
    version: 2, title: "Fit graph on a broken axis",
    prefs: { defaultTableType: "xy", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      ...fitFamily("up", "Break below the IC50", {},
        { xy: { dropLines: true, caption: "below" }, format: { y: { gap: { from: 15, to: 35 } } } }),
      ...fitFamily("in", "Break across the IC50", {},
        { xy: { dropLines: true, caption: "below" }, format: { y: { gap: { from: 40, to: 60 } } } }),
    ],
  }));
  const splitShapes = () => page.evaluate(() => {
    const l = document.querySelector(".plot-card .plot")?.layout ?? {};
    return { y3: l.yaxis3?.range ?? null, y: l.yaxis?.range ?? null,
      shapes: (l.shapes ?? []).filter((s) => String(s.name ?? "").startsWith("drop:"))
        .map((s) => ({ name: s.name, xref: s.xref, yref: s.yref, x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 })) };
  });
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', SPLIT);
  await page.getByRole("treeitem", { name: "Break below the IC50", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
    .some((s) => s.name === "drop:0:v2"), null, { timeout: 120000 }).catch(() => {});
  const s = await splitShapes();
  const by = (n) => s.shapes.find((x) => x.name === n);
  const v = by("drop:0:v"), h = by("drop:0:h"), v2 = by("drop:0:v2");
  expect("broken axis: the lines go on the upper segment, which holds the response 50.4181 (LogIC50 -6.98304)",
    !!s.y3 && s.y3[0] <= 50.4181 && 50.4181 <= s.y3[1] && v && Math.abs(v.x0 + 6.98304) < 5e-6
      && Math.abs(v.y0 - 50.4181) < 5e-5 && JSON.stringify(v.yref) === '["y3","y3 domain"]' && v.y1 === 0
      && h && h.yref === "y3" && h.x1 === 0 && Math.abs(h.y0 - 50.4181) < 5e-5, JSON.stringify(s));
  expect("broken axis: the vertical line goes on down the lower segment to the X axis",
    v2 && v2.yref === "y domain" && v2.y0 === 1 && v2.y1 === 0 && v2.x0 === v.x0, JSON.stringify(v2));
  expect("broken axis: the legend says what the lines mark",
    (await fitLegendText()).includes("Dashed lines mark the IC50 (the concentration giving a response "
      + "half-way between the fitted Top and Bottom)."), await fitLegendText());
  await shot("fit-split-axis");
  await page.getByRole("treeitem", { name: "Break across the IC50", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => document.querySelector(".plot-card .figure-legend-text")?.textContent
    ?.includes("break of the Y axis"), null, { timeout: 120000 }).catch(() => {});
  const across = await splitShapes();
  expect("a break across the response: no lines, and the legend says why",
    !!across.y3 && across.shapes.length === 0 && (await fitLegendText()).includes(
      "No IC50 lines for Drug A: the response at the IC50 (50.42) falls in the break of the Y axis."),
    `${JSON.stringify(across.shapes)} / ${await fitLegendText()}`);
}

// --- P-104: the zero dose left of an X axis break, and each curve's Top
// held at its own zero-dose wells. Reference: engine/tests/reference/
// zero_dose_plateau.py (scipy least_squares on the 4PL with Top fixed per
// curve; R drc with a fixed d is not installed): Drug A Top 100.667 (the
// mean of 98, 101, 103), LogIC50 -6.55448; Drug B Top 86.2, LogIC50
// -5.57498. No dose is made up for the vehicle: it sits on its own axis.
{
  const ZX = ["0", "1e-9", "1e-8", "1e-7", "1e-6", "1e-5", "1e-4"];
  const ZA = [[98.0, 101.0, 103.0], [97.5, 99.0, 100.2], [90.1, 92.4, 88.7], [70.2, 66.8, 72.5],
    [31.0, 35.2, 29.4], [10.4, 12.9, 9.8], [6.1, 4.9, 7.3]];
  const ZB = [[84.0, 88.5, 86.1], [85.2, 82.7, 84.9], [83.0, 80.6, 84.4], [76.1, 73.9, 78.0],
    [58.2, 55.0, 60.3], [30.1, 27.7, 33.6], [14.2, 12.8, 16.5]];
  const REF_ZERO = { "Drug A": { top: 100.666667, logic50: -6.554481 },
    "Drug B": { top: 86.2, logic50: -5.574977 } };
  const ZERO = join(tmp, "zero-break.json");
  const str = (rows) => rows.map((r) => r.map(String));
  writeFileSync(ZERO, JSON.stringify({
    version: 2, title: "Zero dose check",
    prefs: { defaultTableType: "xy", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      { id: "zd", kind: "data", name: "Vehicle wells", table: { type: "xy", x: ZX, xTitle: "[Conc.]",
        xFormat: "numbers", xUnit: "M", yTitle: "Response", rowTitles: ZX.map(() => ""),
        subcolumnFormat: "replicates", replicateLayout: "side_by_side",
        datasets: [{ name: "Drug A", subTitles: ["", "", ""], rows: str(ZA) },
          { name: "Drug B", subTitles: ["", "", ""], rows: str(ZB) }] } },
      { id: "zr", kind: "results", parentId: "zd", name: "Nonlin fit of Vehicle wells", analysis: "nonlin",
        options: { model: "log_inhibitor_vs_response_4pl", errorBars: "sd", autoFit: "requested" } },
      { id: "zg", kind: "graph", parentId: "zd", resultsId: "zr", graphType: "xy",
        name: "Graph of Vehicle wells", settings: { titles: { x: "", y: "" }, scheme: "default",
          xy: { caption: "below" } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', ZERO);
  await page.getByRole("treeitem", { name: "Vehicle wells", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "fit").length === 2, null, { timeout: 120000 }).catch(() => {});
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Format axes…" }).click();
  const fa = page.locator("dialog.fmt-dialog");
  await fa.getByRole("tab", { name: "X axis" }).click();
  await fa.getByLabel("Draw the zero dose left of a break").check();
  await fa.getByRole("button", { name: "Apply and close" }).click();
  await page.waitForFunction(() => !!document.querySelector(".plot-card .plot")?.layout?.xaxis3, null,
    { timeout: 60000 }).catch(() => {});
  const zb = () => page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const l = gd?.layout ?? {};
    const tr = (gd?.data ?? []).map((t) => ({ role: t.meta?.odTag?.role, ds: t.meta?.odTag?.ds,
      xaxis: t.xaxis ?? "x", x: [...(t.x ?? [])], y: [...(t.y ?? [])] }));
    return { x3: l.xaxis3 ? { domain: l.xaxis3.domain, range: l.xaxis3.range, ticktext: l.xaxis3.ticktext,
      tickvals: l.xaxis3.tickvals } : null, xDomain: l.xaxis?.domain, yAnchor: l.yaxis?.anchor,
    marks: (l.shapes ?? []).filter((s) => String(s.name ?? "").startsWith("xbreak"))
      .map((s) => ({ name: s.name, xanchor: s.xanchor, yanchor: s.yanchor })),
    traces: tr };
  });
  const z = await zb();
  const mean = (r) => r.reduce((a, b) => a + b, 0) / r.length;
  const inSeg = z.traces.filter((t) => t.xaxis === "x3");
  expect("P-104 acceptance: the X break puts the vehicle point of each curve in its own segment, left of the break",
    !!z.x3 && inSeg.length === 2 && inSeg.every((t) => t.role === "points" && t.x.length === 1 && t.x[0] === 0)
      && z.x3.domain[1] < z.xDomain[0] && JSON.stringify(z.x3.ticktext) === '["0 M"]'
      && z.yAnchor === "x3", JSON.stringify(z.x3) + JSON.stringify(z.xDomain));
  expect("P-104 the vehicle points land at their values (98, 101, 103 -> 100.667; 84, 88.5, 86.1 -> 86.2)",
    inSeg.length === 2 && Math.abs(inSeg[0].y[0] - mean(ZA[0])) < 1e-9
      && Math.abs(inSeg[1].y[0] - mean(ZB[0])) < 1e-9, JSON.stringify(inSeg));
  expect("P-104 break marks drawn where the X axis is cut",
    z.marks.length === 2 && Math.abs(z.marks[0].xanchor - z.x3.domain[1]) < 1e-12
      && Math.abs(z.marks[1].xanchor - z.xDomain[0]) < 1e-12, JSON.stringify(z.marks));
  const main = z.traces.filter((t) => t.role === "points" && t.xaxis === "x");
  const doses = ZX.slice(1).map((v) => Math.log10(Number(v)));
  expect("P-104 every dose point lands at its value, right of the break",
    main.length === 2 && [ZA, ZB].every((rows, i) => main[i].x.length === 6
      && main[i].x.every((v, k) => Math.abs(v - doses[k]) < 1e-9)
      && main[i].y.every((v, k) => Math.abs(v - mean(rows[k + 1])) < 1e-9)), JSON.stringify(main));
  expect("P-104 no curve is drawn across the break",
    z.traces.filter((t) => t.role === "fit").every((t) => t.xaxis === "x"));
  expect("P-104 the legend says what the points left of the break are",
    (await fitLegendText()).includes("Points left of the break in the X axis are at X = 0, which has no "
      + "logarithm: they are not points on the curve, and the curve was fitted without them."),
    await fitLegendText());
  await shot("zero-dose-break");

  // each curve's Top at its own zero-dose wells, with the stated reason
  const bar = page.getByRole("note", { name: "Zero dose left out" });
  await bar.getByLabel("Reason for the constraint").fill("Vehicle wells are each plate's response with no drug");
  await bar.getByRole("button", { name: "Hold each curve's Top at its own zero-dose wells" }).click();
  // the note changes at once; wait for the refit (both Top cells held)
  await page.waitForFunction(() => [...document.querySelectorAll(".pane-results table.results-table tr")]
    .filter((r) => r.cells[0]?.textContent?.trim() === "Top")
    .filter((r) => r.cells[1]?.textContent?.trim().startsWith("=")).length === 2, null,
  { timeout: 120000 }).catch(() => {});
  // the best-fit value of a parameter in each data set's table ("= 100.7" when held)
  const row = (name) => page.evaluate((n) => ["Drug A", "Drug B"].map((ds) => {
    const t = [...document.querySelectorAll(".pane-results table.results-table")]
      .find((x) => x.caption?.textContent?.trim() === `Best-fit values of ${ds}`);
    const tr = t && [...t.rows].find((r) => r.cells[0]?.textContent?.trim() === n);
    return tr ? tr.cells[1].textContent.trim() : null;
  }), name);
  const tops = await row("Top");
  const logs = await row("LogIC50");
  const near = (s, v, tol) => s !== null
    && Math.abs(parseFloat(String(s).replace(/^=\s*/, "").replace("−", "-")) - v) <= tol;
  expect("P-104 each curve's Top is held at the mean of its own vehicle wells (= 100.7, = 86.2)",
    !!tops && tops.every((s) => String(s).startsWith("=")), JSON.stringify(tops));
  expect("P-104 each curve's Top is the mean of its own vehicle wells (100.7, 86.20)",
    !!tops && near(tops[0], REF_ZERO["Drug A"].top, 0.05) && near(tops[1], REF_ZERO["Drug B"].top, 0.005),
    JSON.stringify(tops));
  expect("P-104 LogIC50 with Top held per curve matches the scipy fit (-6.554, -5.575)",
    !!logs && near(logs[0], REF_ZERO["Drug A"].logic50, 6e-4) && near(logs[1], REF_ZERO["Drug B"].logic50, 6e-4),
    JSON.stringify(logs));
  const methods = await page.locator(".methods-text p").first().innerText().catch(() => "");
  expect("P-104 the methods name each curve's held Top and the stated reason",
    methods.includes("Top of each curve held at the mean of that data set's own zero-dose wells "
      + "(Drug A 100.7, n = 3; Drug B 86.2, n = 3; stated reason: Vehicle wells are each plate's "
      + "response with no drug)"), methods);
  expect("P-104 the legend says the Top is held at the wells left of the break",
    (await fitLegendText()).includes("each curve's Top is held at the mean of its own wells there."),
    await fitLegendText());
}

// --- P-105: stars at each time point on a lines graph. A tumour-growth
// grouped table (days as rows, Vehicle and Drug, 5 mice each) under the
// two-way ANOVA with Sidak comparisons within each row. Reference:
// engine/tests/reference/time_stars.py (statsmodels OLS with the
// interaction, Sidak over 4): adjusted P 0.99998, 0.018887, 0.00097654,
// 8.6e-21, so ns, *, ***, **** in the GraphPad style.
{
  const REF_TS = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "reference",
    "time_stars.json"), "utf8"));
  const days = REF_TS.days;
  const TS = join(tmp, "time-stars.json");
  writeFileSync(TS, JSON.stringify({
    version: 2, title: "Tumour growth",
    prefs: { defaultTableType: "grouped", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      { id: "td", kind: "data", name: "Tumour volume", table: {
        type: "grouped", x: days.map(() => ""), xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "Volume (mm³)",
        rowTitles: days, subcolumnFormat: "replicates", replicateLayout: "side_by_side",
        datasets: [{ name: "Vehicle", rows: REF_TS.vehicle.map((r) => r.map(String)) },
          { name: "Drug", rows: REF_TS.drug.map((r) => r.map(String)) }] } },
      { id: "tr", kind: "results", parentId: "td", name: "Two-way ANOVA of Tumour volume",
        analysis: "grouped_two_way", options: { rowFactor: "Day", colFactor: "Treatment",
          comparisons: "sidak", direction: "columns_within_rows" } },
      { id: "tg", kind: "graph", parentId: "td", resultsId: "tr", graphType: "grouped_lines",
        name: "Growth curves", settings: { titles: { x: "", y: "" }, scheme: "default",
          grouped: { caption: "below" } } },
    ],
  }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', TS);
  await page.getByRole("treeitem", { name: "Growth curves", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "points").length === 2, null, { timeout: 120000 }).catch(() => {});
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const cd = page.locator("dialog.fmt-dialog");
  expect("P-105 the dialog lists the Sidak comparison at each day",
    await cd.getByText("Day 14: Vehicle vs. Drug").count() === 1, await cd.innerText().catch(() => ""));
  expect("P-105 the dialog says a star is not a test of the curves and names the curve-level test",
    (await cd.innerText()).includes("It is not a test of the curves: the two-way ANOVA's interaction tests "
      + "whether the curves differ in shape"), await cd.innerText());
  await cd.getByLabel("Show stars at each time point").check();
  await cd.getByRole("button", { name: "Apply and close" }).click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .filter((a) => a.name === "time-star").length === 4, null, { timeout: 30000 }).catch(() => {});
  const ts = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const pts = (gd?.data ?? []).filter((t) => t.meta?.odTag?.role === "points");
    return { stars: (gd?.layout?.annotations ?? []).filter((a) => a.name === "time-star")
      .map((a) => ({ x: a.x, y: a.y, text: a.text })),
    tops: pts.length ? pts[0].x.map((_, i) => Math.max(...pts.map((t) => t.y[i] + (t.error_y?.array?.[i] ?? 0))))
      : [] };
  });
  const want = REF_TS.comparisons.map((c) => c.stars);
  expect(`P-105 acceptance: each day's star matches the adjusted P of its Sidak comparison (${want.join(", ")})`,
    ts.stars.length === 4 && ts.stars.every((s, i) => s.x === i && s.text === want[i]), JSON.stringify(ts.stars));
  expect("P-105 each star sits above the highest mark (mean + error bar) of its day",
    ts.stars.length === 4 && ts.stars.every((s, i) => s.y > ts.tops[i]), JSON.stringify(ts));
  const leg = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("P-105 the legend gives the star scale, where exact P are, and points to the curve-level test",
    leg.includes("Stars above each time point compare the two groups at that time")
      && leg.includes("exact P values are in the results")
      && leg.includes("They are not a test of the curves: the two-way ANOVA's interaction tests whether the "
        + "curves differ in shape") && leg.includes("* P ≤ 0.05"), leg);
  await shot("time-stars");
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

// --- a new contingency table comes with its graph (Wave 1 follow-up to
// P-14). Before: contingency analyses had no default graph, so a new
// table got none and the brackets were reachable only from saved files.
// The example project keeps the sheets it had (no contingency graph).
{
  await fileMenu(page, "New data table…");
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="contingency"]').check();
  await dlg.getByText("Example data").click();
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForFunction(() => {
    const p = globalThis.__opendose.store.project;
    const d = p.sheets.filter((x) => x.kind === "data" && x.table.type === "contingency").at(-1);
    return d && p.sheets.some((x) => x.kind === "graph" && x.parentId === d.id);
  }, null, { timeout: 30000 }).catch(() => {});
  const fam = await page.evaluate(() => {
    const p = globalThis.__opendose.store.project;
    const d = p.sheets.filter((x) => x.kind === "data" && x.table.type === "contingency").at(-1);
    const r = p.sheets.find((x) => x.kind === "results" && x.parentId === d.id);
    const g = p.sheets.filter((x) => x.kind === "graph" && x.parentId === d.id);
    return { analysis: r?.analysis, graphs: g.map((x) => [x.graphType, x.resultsId === r?.id, x.name]) };
  });
  expect("a new contingency table gets the \"% of each row\" stacked graph, bound to its analysis",
    fam.analysis === "contingency" && fam.graphs.length === 1 && fam.graphs[0][0] === "contingency_stacked_percent"
      && fam.graphs[0][1] === true, JSON.stringify(fam));
  await page.getByRole("treeitem", { name: fam.graphs[0]?.[2], exact: true }).first().locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.type === "bar"), null, { timeout: 60000 }).catch(() => {});
  const bars = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.type === "bar").map((t) => [t.name, [...t.y].map((v) => Math.round(v * 10) / 10)]));
  expect("its graph draws each row's outcomes as % of the row (Exposed 15 / 85, Not exposed 5 / 95)",
    JSON.stringify(bars) === '[["Event",[15,5]],["No event",[85,95]]]', JSON.stringify(bars));
  await shot("contingency-new-table");
  const ex = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await ex.goto(url, { waitUntil: "domcontentloaded" });
  await ex.waitForFunction(() => !!globalThis.__opendose?.store?.project, null, { timeout: 120000 });
  const kinds = await ex.evaluate(() => {
    const p = globalThis.__opendose.store.project;
    return p.sheets.filter((x) => x.kind === "data").map((d) => [d.table.type,
      p.sheets.filter((x) => x.parentId === d.id).map((x) => x.kind).join("+")]);
  });
  expect("the example project keeps its sheets (no graph added to its contingency table)",
    JSON.stringify(kinds) === '[["xy","results+graph"],["contingency","results"],["survival","results+graph"]]',
    JSON.stringify(kinds));
  await ex.close();
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
  // The paired family needs scatter in its differences: B = A - 0.2
  // exactly makes every paired difference 0.2, and a paired t test on
  // differences with no scatter is undefined (engine/tests/
  // test_zero_scatter_matched.py), so it would report no equivalence.
  const jitter = [0.03, -0.02, 0.01, -0.04, 0.02, 0, -0.01, 0.05];
  const pairedTable = { ...eqTable, datasets: [eqTable.datasets[0],
    { name: "B", rows: A.map((v, i) => [String(+(Number(v) - 0.2 + jitter[i]).toFixed(2))]) }] };
  const fam = (p, name, ttestKind) => [
    { id: `${p}d`, kind: "data", name, table: ttestKind === "paired" ? pairedTable : eqTable },
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
      && JSON.stringify(m.labels) === '["margin −1","margin +1"]', JSON.stringify(m));
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

// --- P-55: Normalize names a new output from its settings ("% of vehicle
// (mean)") on the table, the graph's Y title and the legend; an output
// saved before keeps "Normalized response (%)" (ruling 10: new outputs only).
{
  const NORM = join(tmp, "normalize.json");
  const tbl = () => ({ type: "grouped", x: ["", "", ""], xTitle: "", xFormat: "numbers", xUnit: "",
    yTitle: "Luminescence (RLU)", rowTitles: ["10 nM", "1 µM", "vehicle"],
    datasets: [
      { name: "WT", rows: [["20", "22", "21"], ["55", "60", "58"], ["98", "101", "100"]] },
      { name: "KO", rows: [["30", "33", "31"], ["70", "66", "68"], ["99", "97", "103"]] }],
    subcolumnFormat: "replicates", replicateLayout: "side_by_side" });
  const oldOptions = { zeroMode: "smallest", zeroValue: "0", hundredMode: "last", hundredValue: "100",
    asPercent: true, subcolumns: "mean" };
  writeFileSync(NORM, JSON.stringify({ version: 2, title: "Normalize titles",
    prefs: { defaultTableType: "grouped", errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 },
    sheets: [
      { id: "od", kind: "data", name: "Old assay", table: tbl() },
      { id: "or", kind: "results", parentId: "od", name: "Normalize of Old assay", analysis: "normalize",
        options: oldOptions },
      { id: "on", kind: "data", name: "Normalized Old assay", table: { ...tbl(), yTitle: "Normalized response (%)" },
        derived: { sourceId: "od", resultsId: "or" } },
      { id: "og", kind: "graph", parentId: "on", resultsId: null, graphType: "grouped_interleaved",
        name: "Graph of Normalized Old assay", settings: { titles: { x: "", y: "" }, scheme: "default" } },
      { id: "nd", kind: "data", name: "New assay", table: tbl() },
    ] }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', NORM);
  const yTitle = () => page.evaluate(() => {
    const t = document.querySelector(".plot-card .plot")?.layout?.yaxis?.title;
    return typeof t === "string" ? t : t?.text ?? null;
  });
  // the legend under the graph, or the results sheet's Report card
  const legend = () => page.evaluate(() => [...document.querySelectorAll(".figure-legend-text, .report-legend p")]
    .map((e) => e.textContent ?? "").join(" | "));
  await page.getByRole("treeitem", { name: "Graph of Normalized Old assay", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? []).length > 0, null,
    { timeout: 60000 });
  // the chain re-runs on open: give it time to rewrite the old output
  await page.waitForTimeout(2500);
  const oldTitle = await yTitle();
  const oldLegend = await legend();
  expect("an output saved before P-55 keeps its Y title “Normalized response (%)”, legend unchanged",
    oldTitle === "Normalized response (%)" && !/Values are/.test(oldLegend), `${oldTitle}; ${oldLegend.slice(0, 120)}`);
  // a new Normalize: 0% = smallest mean (the default), 100% = the vehicle row's mean
  await page.getByRole("treeitem", { name: "New assay", exact: true }).first().locator(":scope > .nav-row").click();
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Normalize/ }).click();
  await page.locator(".manip-controls").getByLabel("100% is").selectOption("last");
  await page.locator(".manip-open").first().click();
  await page.waitForFunction(() => document.querySelector(".origin-note") !== null, null, { timeout: 15000 });
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Two-way ANOVA \(or mixed model\)/ }).click();
  await page.waitForFunction(() => {
    const t = document.querySelector(".plot-card .plot")?.layout?.yaxis?.title;
    return (typeof t === "string" ? t : t?.text) === "% of vehicle (mean)";
  }, null, { timeout: 60000 }).catch(() => {});
  const newTitle = await yTitle();
  await page.waitForFunction(() => [...document.querySelectorAll(".figure-legend-text, .report-legend p")]
    .some((e) => /Values are % of vehicle \(mean\)\./.test(e.textContent ?? "")), null, { timeout: 30000 })
    .catch(() => {});
  const newLegend = await legend();
  expect("a new Normalize output with 100% = the vehicle mean: the graph's Y title reads “% of vehicle (mean)”",
    newTitle === "% of vehicle (mean)", String(newTitle));
  expect("the figure legend states the same phrase", /Values are % of vehicle \(mean\)\./.test(newLegend),
    newLegend.slice(0, 200));
}

// --- P-92: the forest plot of combined experiments --------------------------
{
  // dat.bcg (Colditz et al. 1994), 13 log risk ratios with SEs, pooled by
  // REML with the Hartung-Knapp CI (engine/tests/reference/
  // meta_reference.json bcg_reml; metafor prints REML -0.7145): the plot
  // draws 13 squares and the pooled diamonds on a log axis, every CI end
  // equal to the results table's
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/meta_reference.json"), "utf8")).bcg_reml;
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "meta-bcg.json"));
  await page.getByRole("treeitem", { name: "Forest plot of BCG trials", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.name === "Random effects"), null, { timeout: 180000 }).catch(() => {});
  const f = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const pts = (gd?.data ?? []).find((t) => t.name === "Experiments");
    const dia = (name) => {
      const t = (gd?.data ?? []).find((x) => x.name === name);
      return t ? [Math.min(...t.x), t.x[1], Math.max(...t.x)] : null;
    };
    return {
      n: pts?.x.length ?? 0, ticks: gd?.layout?.yaxis?.ticktext ?? [], type: gd?.layout?.xaxis?.type,
      ref: (gd?.layout?.shapes ?? [])[0]?.x0,
      ends: pts ? pts.x.map((x, i) => [x - pts.error_x.arrayminus[i], x + pts.error_x.array[i]]) : [],
      random: dia("Random effects"), fixed: dia("Common effect"),
      pi: (() => { const t = (gd?.data ?? []).find((x) => x.name === "Prediction interval"); return t ? t.x : null; })(),
    };
  });
  const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  expect("P-92 acceptance: the forest plot draws 13 rows and the pooled diamond", f.n === 13
    && f.ticks.length === 16 && f.ticks[0] === "Aronson 1948" && f.ticks[13] === "Common effect"
    && f.ticks[14] === "Random effects" && !!f.random, JSON.stringify(f.ticks));
  expect("P-92 ratios on a log axis with the no-effect line at 1", f.type === "log" && f.ref === 1, `${f.type} ${f.ref}`);
  expect("P-92 the random-effects diamond spans exp of the Hartung-Knapp CI around exp(-0.7145)",
    f.random && near(f.random[0], Math.exp(REF.ci_hk[0])) && near(f.random[2], Math.exp(REF.ci_hk[1]))
      && Number(f.random[1].toPrecision(4)) === 0.4894, JSON.stringify(f.random));
  expect("P-92 the prediction interval bar is exp of t(11) limits", f.pi && near(f.pi[0], Math.exp(REF.pi_hk[0]))
    && near(f.pi[1], Math.exp(REF.pi_hk[1])), JSON.stringify(f.pi));
  // every CI end on the plot is the one printed in the results table
  await page.getByRole("treeitem", { name: "Combined experiments of BCG trials", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.locator(".pane-results .meta-results").first().waitFor({ timeout: 120000 });
  const tableCI = await page.locator(".pane-results .meta-results table").first().locator("tbody tr")
    .evaluateAll((rows) => rows.slice(0, 13).map((r) => r.querySelectorAll("td")[3]?.textContent ?? ""));
  const sig = (v) => String(Number(v.toPrecision(4)));
  const plotted = f.ends.map(([a, b]) => `${sig(a)} to ${sig(b)}`);
  expect("P-92 the 13 CI ends on the plot equal the results table's", JSON.stringify(plotted) === JSON.stringify(tableCI),
    `${plotted.slice(0, 2)} vs ${tableCI.slice(0, 2)}`);
  await page.getByRole("treeitem", { name: "Forest plot of BCG trials", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const legend = await page.locator(".plot-card .figure-legend-text").textContent({ timeout: 60000 }).catch(() => "");
  expect("P-92 the legend says what the squares, diamonds and bar are",
    legend.startsWith("Squares show the estimate of each of 13 experiments with its 95% CI;")
      && legend.includes("Ratios are drawn on a log axis") && !/Mean ± SEM/.test(legend), legend);
  await shot("forest-meta");
}

// --- P-93: mini-meta and delta-delta on the estimation plot -----------------
{
  // DABEST 2025.03.27 on its seeded data (engine/tests/reference/
  // estimation_minimeta.json): three repeats of control vs drug, weighted
  // delta -1.7409 (BCa -2.462 to -1.071 in DABEST's streams); a 2 x 2,
  // delta-delta 5.942. The engine's BCa limits differ from DABEST's only
  // by Monte Carlo error: checked within 5% of the CI width.
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/estimation_minimeta.json"), "utf8"));
  const sig4 = (v) => String(Number(v.toPrecision(4)));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "estimation-minimeta.json"));
  await page.getByRole("treeitem", { name: "Estimation of Three repeats", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const combine = page.getByLabel("Combine the comparisons");
  await combine.waitFor({ timeout: 60000 });
  await combine.selectOption("none");
  await page.waitForFunction(() => !/Mini-meta of/.test(document.querySelector(".pane-results .estimation-results")
    ?.textContent ?? "x"), null, { timeout: 120000 }).catch(() => {});
  const plainPlot = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.name === "combined-effect"));
  expect("P-93 without a combined effect the plot has no weighted delta", !plainPlot);
  await combine.selectOption("mini_meta");
  const mm = REF.mini_meta;
  const rowRe = new RegExp(`Mini-meta of 3 repeats 3 comparisons Weighted mean difference ${sig4(mm.difference)} (-?[\\d.]+) to (-?[\\d.]+)`);
  await page.waitForFunction((src) => new RegExp(src).test((document.querySelector(".pane-results .estimation-results")
    ?.textContent ?? "").replace(/\s+/g, " ")), rowRe.source.replace(/ /g, "\\s*"), { timeout: 180000 }).catch(() => {});
  const card = (await page.locator(".pane-results .estimation-results").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  const m = card.match(rowRe);
  const w = mm.bca_high - mm.bca_low;
  expect(`P-93 acceptance: three repeats, the weighted mean difference ${sig4(mm.difference)} (DABEST) with a BCa CI `
    + `within Monte Carlo error of DABEST's ${sig4(mm.bca_low)} to ${sig4(mm.bca_high)}`,
    !!m && Math.abs(Number(m[1]) - mm.bca_low) < 0.05 * w && Math.abs(Number(m[2]) - mm.bca_high) < 0.05 * w,
    m ? m[0] : card.slice(0, 600));
  expect("P-93 the weights are listed", /Weights \(inverse pooled group variance\): Repeat 1: Drug minus Repeat 1: Control/.test(card));
  await page.getByRole("treeitem", { name: "Estimation plot of Three repeats", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.name === "combined-effect"), null, { timeout: 180000 }).catch(() => {});
  const plot = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const t = (gd?.data ?? []).find((x) => x.name === "combined-effect");
    return t ? { y: t.y[0], lo: t.y[0] - t.error_y.arrayminus[0], hi: t.y[0] + t.error_y.array[0],
      tick: (gd.layout.xaxis.ticktext ?? []).at(-1) } : null;
  });
  expect("P-93 acceptance: the estimation plot adds the weighted delta with its bootstrap CI",
    !!plot && Math.abs(plot.y - mm.difference) < 1e-9 && plot.tick === "Weighted delta"
      && m && sig4(plot.lo) === m[1] && sig4(plot.hi) === m[2], JSON.stringify(plot));
  const legend = await page.locator(".plot-card .figure-legend-text").textContent({ timeout: 60000 }).catch(() => "");
  expect("P-93 the legend names the weighted delta column",
    legend.includes("The rightmost column is the weighted mean difference of the independent repeats"), legend);
  await shot("estimation-minimeta");

  // the 2 x 2 delta-delta
  await page.getByRole("treeitem", { name: "Estimation plot of Genotype by drug", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .some((t) => t.name === "combined-effect"), null, { timeout: 180000 }).catch(() => {});
  const dd = await page.evaluate(() => {
    const gd = document.querySelector(".plot-card .plot");
    const t = (gd?.data ?? []).find((x) => x.name === "combined-effect");
    return t ? { y: t.y[0], lo: t.y[0] - t.error_y.arrayminus[0], hi: t.y[0] + t.error_y.array[0],
      tick: (gd.layout.xaxis.ticktext ?? []).at(-1) } : null;
  });
  const d = REF.delta_delta, dw = d.bca_high - d.bca_low;
  expect(`P-93 delta-delta ${sig4(d.difference)} (DABEST), CI within Monte Carlo error of ${sig4(d.bca_low)} to ${sig4(d.bca_high)}`,
    !!dd && Math.abs(dd.y - d.difference) < 1e-9 && dd.tick === "Delta-delta"
      && Math.abs(dd.lo - d.bca_low) < 0.05 * dw && Math.abs(dd.hi - d.bca_high) < 0.05 * dw, JSON.stringify(dd));
}

console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
if (fail.length || errors.length) {
  console.log(`\n${fail.length} check(s) failed${errors.length ? `, ${errors.length} page error(s)` : ""}`);
  process.exit(1);
}
console.log("\nall figure checks passed");
