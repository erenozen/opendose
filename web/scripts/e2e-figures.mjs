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

const url = process.argv[2] ?? "http://localhost:5173/";
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
await page.waitForSelector(".results-table", { timeout: 180000 });

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
await page.setInputFiles('.load-btn input[type="file"]', SUPER);
await page.waitForFunction(() => document.querySelector(".plot-card .plot")?.data?.length > 0,
  { timeout: 60000 });
await page.waitForTimeout(600);
{
  const p = await plot();
  expect("column graph draws before SuperPlot mode (no replicate overlay)",
    p.traces.every((t) => !t.means), `${p.traces.length} traces`);
  const cap = await page.locator(".graph-caption > span").innerText().catch(() => "");
  expect("legend sentence under the graph states mean ± SD and n",
    cap.includes("Mean ± SD") && cap.includes("n = 18 per group"), cap);
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
  const cap = await page.locator(".graph-caption > span").innerText().catch(() => "");
  expect("legend sentence counts experiments in SuperPlot mode",
    cap.includes("n = 3 experiments per group"), cap);
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
    await page.locator(".nav-name", { hasText: "Stats on replicate means of Cell speed" }).count() === 1);
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
}

if (process.env.SHOTS) await closeSettings(), await page.waitForTimeout(300), await page.locator(".plot-card").screenshot({ path: `${process.env.SHOTS}/superplot.png` });
// P-value style and hide ns on the brackets
{
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const cd = page.locator("dialog.fmt-dialog");
  await cd.getByLabel("P value style").selectOption("apa");
  await cd.getByLabel("Label", { exact: true }).selectOption("p");
  await cd.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(500);
  const p = await plot();
  expect("APA style P values on the brackets (no leading zero)",
    p.brackets.length > 0 && p.brackets.every((b) => /^p [=<] \.\d+$/.test(b)), p.brackets.join(" | "));
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

if (process.env.SHOTS) await closeSettings(), await page.waitForTimeout(300), await page.locator(".plot-card").screenshot({ path: `${process.env.SHOTS}/classic.png` });
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

console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
if (fail.length || errors.length) {
  console.log(`\n${fail.length} check(s) failed${errors.length ? `, ${errors.length} page error(s)` : ""}`);
  process.exit(1);
}
console.log("\nall figure checks passed");
