// End-to-end smoke test: boots the app in headless Chromium, waits for
// Pyodide + SciPy, checks the default fit, then exercises the plate-import
// workflow with the synthetic SRB fixture and checks both cell-line fits,
// the other built-in table types (parts of whole and nested from their
// example tables), Prism imports, grouped tables (two-way, multiple t
// tests, three-way ANOVA, grouped graphs), the multi-sheet
// project workflow (new table, rename, undo/redo, delete, save/open,
// v1 migration, restore from autosave), the multiple-variables analyses
// (regression, PCA, logistic, correlation, extract & rearrange), chains of
// analyses (Transform with X = log(X) and a user formula, Normalize of the
// result, a source edit flowing down the chain), a simulated XY table and
// a Monte Carlo run, and table editing (Import dialog with .xlsx and
// decimal-comma CSV, sort, block exclusion, Data Inspector, CSV export of
// data and results, Mean/SD/N conversion and entry, insert series, dates
// as X), project organisation (save a template and create a table from
// it, analyze and graph like another table, make graph formats consistent,
// sheet groups and floating notes surviving save / reopen / page reload,
// go to sheet), a model from the engine's equation library and a
// user-defined equation, Welch ANOVA with Games-Howell, the chi-square
// test for trend and Deming regression.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const XLSX = join(here, "..", "..", "engine", "tests", "fixtures",
  "synthetic_srb_plate.xlsx");

const url = process.argv[2] ?? "http://localhost:5173/";
// HOST_RESOLVER="MAP example.com 1.2.3.4" points the browser straight at a
// host, so a site can be checked before local DNS has caught up.
const browser = await chromium.launch({
  args: process.env.HOST_RESOLVER
    ? [`--host-resolver-rules=${process.env.HOST_RESOLVER}`]
    : [],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};
// A navigator row by sheet name (the treeitem's own row, not its children).
const navRow = (name) => page
  .getByRole("treeitem", { name, exact: true }).first()
  .locator(":scope > .nav-row");
const tmp = mkdtempSync(join(tmpdir(), "opendose-e2e-"));
// The graph card's Settings panel (graph options, colours, titles, format
// dialogs); opening it twice closes it.
const graphSettings = async () => {
  await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
  return page.getByRole("dialog", { name: "Graph settings" });
};
const closeGraphSettings = () => page.keyboard.press("Escape");
// Panels load on first use (sheets/lazy.ts): wait for a control to appear.
const appears = (locator, timeout = 15000) => locator.first().waitFor({ timeout })
  .then(() => true, () => false);
const plotLayoutOf = () => page.evaluate(() => {
  const l = document.querySelector(".plot-card .plot")?.layout ?? {};
  return {
    title: l.title?.text ?? "",
    brackets: (l.annotations ?? []).filter((a) => a.name === "bracket-label")
      .map((a) => `${a.xref}:${a.text}`),
  };
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".results-table", { timeout: 180000 });
const logRow = await page
  .locator(".results-table tbody tr", { hasText: "LogIC50" })
  .first()
  .innerText();
console.log("default fit LogIC50 row:", logRow.replace(/\s+/g, " "));

// --- plate import flow ---
await page.getByText("Import plate (SRB").click();
await page.setInputFiles('.plate-form input[type="file"]', XLSX);
await page
  .getByPlaceholder("e.g. Control, Resistant")
  .fill("Line S, Line R");
await page.getByRole("button", { name: /Import → data table/ }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".result-card .derived").length >= 2,
  { timeout: 60000 },
);
await page.waitForTimeout(1200);

for (const card of await page.locator(".result-card:has(.derived)").all()) {
  const name = await card.locator("h3").innerText();
  const ic50 = await card.locator(".derived").first().innerText();
  console.log(`${name.trim()}: ${ic50.replace(/\s+/g, " ")}`);
}
const methods = await page.locator(".methods-text p").first().innerText();
console.log("methods text present:", methods.length > 50);

// --- column statistics on the same table: add a second analysis ---
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Column analyses/ }).click();
await page.waitForSelector(".stat-cols", { timeout: 30000 });
const normality = await page.locator(".stat-cols").first().innerText();
console.log("column stats has Shapiro-Wilk:", normality.includes("Shapiro-Wilk"));
expect("analysis tabs show both analyses",
  await page.locator(".mode-switch [role=tab]").count() === 2);

await page.locator(".analysis-select").selectOption("anova");
await page.waitForSelector(".result-card h3:has-text('ANOVA')", { timeout: 30000 });
await page.waitForTimeout(400);
const anovaText = await page.locator(".result-card").first().innerText();
const fLine = anovaText.split("\n").find((l) => l.startsWith("F ("));
const tukeyLine = anovaText.split("\n").find((l) => l.includes(" vs. "));
console.log("ANOVA:", fLine, "| first Tukey row:", tukeyLine?.slice(0, 60));

// --- column graph types: box plot renders without errors ---
await page.locator(".graph-select").selectOption("box");
await page.waitForTimeout(600);
console.log("box plot traces:",
  await page.locator(".plot .trace.boxes, .plot .boxlayer path").count());

// --- contingency table (example sheet in the starting project) ---
await navRow("Contingency example").click();
await page.waitForSelector(".result-card h3:has-text('Contingency')", {
  timeout: 30000,
});
const fisher = await page
  .locator(".results-table tr", { hasText: "Fisher" })
  .first()
  .innerText();
console.log("contingency:", fisher.replace(/\s+/g, " "));

// --- survival table (example sheet in the starting project) ---
await navRow("Survival example").click();
await page.waitForSelector(".result-card h3:has-text('Kaplan-Meier')", {
  timeout: 30000,
});
await page.waitForTimeout(800);
const kmText = await page
  .locator(".result-card:not(.methods-text)", { hasText: "Kaplan-Meier" }).innerText();
const logrankLine = kmText.split("\n").find((l) => l.includes("Log-rank"));
console.log("survival:", logrankLine
  ? logrankLine.replace(/\t/g, " ").slice(0, 70)
  : `NO LOGRANK LINE — card was: ${kmText.replace(/\s+/g, " ").slice(0, 120)}`);

// --- parts of whole: example table from the New data table dialog ---
// Expected numbers come from the native engine on the same counts
// (Control G1/S/G2-M = 412/188/100): 412/700 = 58.86%, Wilson/Brown 95% CI
// 55.17% to 62.44%; chi-square vs. equal expected = 221.8, df 2.
const newExampleTable = async (type) => {
  await page.getByRole("button", { name: "New data table" }).click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator(`input[name="table-type"][value="${type}"]`).check();
  await dlg.getByLabel("Example data").check();
  await dlg.getByRole("button", { name: "Create table" }).click();
};
await newExampleTable("partsofwhole");
await page.waitForSelector(".result-card h3:has-text('Fraction of total')", { timeout: 30000 });
await page.waitForTimeout(600);
const g1Row = await page.locator(".fraction-table tbody tr", { hasText: "G1" }).first().innerText();
expect("fraction of total: Control G1 = 58.86%", g1Row.includes("58.86%"), g1Row.replace(/\s+/g, " "));
await page.getByLabel("Compute a confidence interval for each fraction").check();
await page.waitForFunction(
  () => document.querySelector(".fraction-table")?.textContent?.includes("55.17% to 62.44%"),
  null, { timeout: 30000 },
).then(() => expect("fraction of total: Wilson/Brown CI 55.17% to 62.44%", true),
  () => expect("fraction of total: Wilson/Brown CI 55.17% to 62.44%", false));
expect("pie chart draws three slices",
  await page.locator(".plot .slice").count() === 3);
{
  const pop = await graphSettings();
  expect("pie: graph options live in the Settings panel",
    await appears(pop.getByRole("group", { name: "Graph options" }).getByLabel("Slice labels"))
    && await page.locator(".graph-opts, .graph-options, .mv-graph-options").count() === 0);
  expect("pie: no Format axes (no axes to format)",
    await pop.getByRole("button", { name: "Format axes…" }).count() === 0);
  await pop.getByRole("button", { name: "Format graph…" }).click();
  const fg = page.locator("dialog.fmt-dialog");
  await fg.getByLabel("Data set to format").selectOption({ label: "S" });
  await fg.getByLabel("Show on graph").uncheck();
  await fg.getByRole("tab", { name: "Whole graph" }).click();
  await fg.getByLabel("Graph title", { exact: true }).fill("Cell cycle");
  await fg.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(400);
  expect("pie: Format graph sets the title and hides a part",
    (await plotLayoutOf()).title === "Cell cycle" && await page.locator(".plot .slice").count() === 2,
    (await plotLayoutOf()).title);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(300);
}
await page.locator(".graph-select").selectOption("pow_donut");
await page.waitForTimeout(400);
await page.locator(".plot .slice path").first().click({ force: true });
await page.locator(".graph-select").selectOption("pow_stacked100");
await page.waitForTimeout(400);
expect("stacked bars: one bar per data set and part",
  await page.locator(".plot .bars .point").count() === 6);
const [powPng] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator(".plot-card .export-panel").getByRole("button", { name: /Download/ }).click(),
]);
expect("parts-of-whole graph exports", /\.png$/.test(powPng.suggestedFilename()),
  powPng.suggestedFilename());
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Chi-square goodness of fit/ }).click();
await page.waitForSelector(".result-card h3:has-text('Chi-square goodness of fit')", { timeout: 30000 });
await page.waitForTimeout(600);
const chiLine = await page.locator(".gof-tests tr", { hasText: "Chi-square, df" }).innerText();
expect("goodness of fit: chi-square 221.8, df 2",
  chiLine.includes("221.8") && chiLine.includes("df = 2"), chiLine.replace(/\s+/g, " "));

// --- nested: example (3 treatments x 3 herds x 4 values) ---
// Native engine: nested one-way ANOVA F(2, 6) = 11.24, P = 0.009359;
// nested t test Control vs. Diet A t = 2.771, df 4, P = 0.05026.
await newExampleTable("nested");
await page.waitForSelector(".result-card h3:has-text('Nested one-way ANOVA')", { timeout: 30000 });
await page.waitForTimeout(600);
const nestedText = await page.locator(".nested-results").innerText();
expect("nested ANOVA: F(2, 6) = 11.24, P = 0.009359",
  nestedText.includes("F(2, 6) = 11.24") && nestedText.includes("0.009359"));
expect("nested scatter draws every value",
  await page.locator(".plot .scatterlayer .point").count() >= 36);
{
  const pop = await graphSettings();
  await appears(pop.getByLabel("Plot subcolumn means only"));
  const box = await pop.getByLabel("Plot subcolumn means only").boundingBox();
  expect("graph-option checkboxes keep their size in the Settings panel",
    !!box && box.width < 20, String(box?.width));
  await pop.getByLabel("Plot subcolumn means only").check();
  await page.waitForTimeout(400);
  expect("nested: graph option in the Settings panel plots subcolumn means",
    await page.locator(".plot .scatterlayer .point").count() < 36);
  await pop.getByLabel("Plot subcolumn means only").uncheck();
  await closeGraphSettings();
}
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Nested t test/ }).click();
await page.waitForSelector(".result-card h3:has-text('Nested t test')", { timeout: 30000 });
await page.waitForTimeout(600);
const nestedT = await page.locator(".nested-results").innerText();
expect("nested t test: t = 2.771, df = 4, P = 0.05026",
  nestedT.includes("t = 2.771, df = 4") && nestedT.includes("0.05026"));

// --- .pzfx import via the header Open button ---
const PZFX = join(here, "..", "e2e-fixtures", "sample.pzfx");
await page.setInputFiles('.load-btn input[type="file"]', PZFX);
await page.waitForSelector(".pzfx-chooser", { timeout: 30000 });
await page.locator(".pzfx-chooser button", { hasText: "Dose response" }).click();
await page.waitForSelector(".results-table", { timeout: 60000 });
await page.waitForTimeout(1200);
const pzfxRow = await page
  .locator(".results-table tbody tr", { hasText: /Log(IC|EC)50/ })
  .first()
  .innerText();
console.log("pzfx-imported fit midpoint row:", pzfxRow.replace(/\s+/g, " "));

// --- .prism import (the zipped format Prism 10/11 writes) ---
// The fixture holds one data sheet plus an analysis sheet; only the data
// sheet should arrive, so this loads without showing the table chooser.
const PRISM = join(here, "..", "..", "engine", "tests", "fixtures",
  "synthetic_project.prism");
await page.setInputFiles('.load-btn input[type="file"]', PRISM);
await page.waitForFunction(
  () => document.querySelectorAll(".dataset-card, .result-card").length > 0,
  { timeout: 30000 },
);
await page.waitForTimeout(1500);
const names = await page.locator(".dataset-name, .result-card h3").allInnerTexts();
console.log("prism-imported dataset names:", names.slice(0, 2).join(" | "));
// X ran 0..30 with a zero-dose control; a zero must not be mistaken for
// an already-log10 column, so the fit reports IC50 near 3 and 12.
for (const card of await page.locator(".result-card:has(.derived)").all()) {
  const name = await card.locator("h3").innerText();
  const ic50 = await card.locator(".derived").first().innerText();
  console.log(`  ${name.trim()}: ${ic50.replace(/\s+/g, " ")}`);
}

// --- grouped tables -------------------------------------------------------
// Reference numbers are computed natively (here, or copied from SciPy /
// statsmodels as noted) so the in-browser engine is checked end to end.

// A Prism "TwoWay" table imports as a grouped table and runs two-way
// ANOVA. statsmodels anova_lm(typ=3) on the fixture: datasets factor
// F(1, 8) = 270.75 (SS 270.75, MS residual 8 / 8 = 1).
await page.setInputFiles('.load-btn input[type="file"]',
  join(here, "..", "e2e-fixtures", "grouped.pzfx"));
await page.waitForSelector(".result-card h3:has-text('Two-way ANOVA')", { timeout: 60000 });
await page.waitForTimeout(600);
const importedTag = await page
  .locator(".nav-item.selected[data-key^='data:'] > .nav-row").innerText();
const pzfxDsRow = await page.locator(".result-card .results-table tr:has(th:text-is(\"Column factor\"))")
  .first().innerText();
expect("Prism TwoWay table imports as a grouped table",
  /Grp/.test(importedTag) && /Two factors/.test(importedTag), importedTag.replace(/\s+/g, " "));
expect("two-way ANOVA on the imported table: dataset F = 270.8",
  pzfxDsRow.split(/\t/).includes("270.8"), pzfxDsRow.replace(/\s+/g, " "));

// Example grouped table (tumour volume, 3 days x 2 arms x 3 animals).
await page.getByRole("button", { name: "New data table" }).click();
const gdialog = page.locator(".new-table-dialog");
await gdialog.locator('input[name="table-type"][value="grouped"]').check();
await gdialog.getByText("Example data").click();
await gdialog.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".result-card h3:has-text('Two-way ANOVA')", { timeout: 30000 });
await page.waitForTimeout(600);
// statsmodels anova_lm(typ=3): interaction F(2, 12) = 41.541138
const interRow = await page.locator(".result-card .results-table tr", { hasText: "Interaction" })
  .first().innerText();
expect("grouped example: two-way interaction F = 41.54",
  interRow.split(/\t/).includes("41.54"), interRow.replace(/\s+/g, " "));
expect("interleaved bar graph draws one bar trace per dataset",
  await page.locator(".plot .barlayer .trace").count() === 2);
for (const kind of ["grouped_stacked", "grouped_separated", "grouped_box",
  "grouped_lines", "grouped_three_way", "grouped_heatmap"]) {
  await page.locator(".graph-select").selectOption(kind);
  await page.waitForTimeout(400);
}
expect("heat map renders", await page.locator(".plot .heatmaplayer .hm").count() >= 1);
await page.locator(".graph-select").selectOption("grouped_interleaved");
// Šídák comparisons within each row become one bracket per row (day).
await page.locator(".controls").getByRole("combobox", { name: /^Test/ }).selectOption("sidak");
await page.waitForTimeout(800);
{
  const pop = await graphSettings();
  expect("grouped: error bars are a graph option in the Settings panel",
    await appears(pop.getByRole("group", { name: "Graph options" }).getByLabel("Error bars")));
  const [popTop, headBottom] = await page.evaluate(() => [
    document.querySelector(".settings-pop").getBoundingClientRect().top,
    document.querySelector("header").getBoundingClientRect().bottom]);
  expect("the Settings panel stays below the header (its top is reachable)",
    popTop >= headBottom, `${popTop} vs ${headBottom}`);
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const cd = page.locator("dialog.fmt-dialog");
  await cd.getByLabel("Show comparison brackets on the graph").check();
  await cd.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(500);
  const br = (await plotLayoutOf()).brackets;
  expect("grouped bars: a bracket per row from the two-way comparisons",
    br.length === 3 && br.every((b) => b.startsWith("x:")), br.join(" "));
}

// Multiple t tests, Welch + two-stage step-up (BKY), Q = 5%.
// Welch P values per row (scipy.stats.ttest_ind(equal_var=False)):
const welchP = [0.6640378056425279, 0.004835442527178256, 0.0011650144032969985];
// q value = smallest Q at which the row is a discovery under the
// Benjamini-Krieger-Yekutieli two-stage procedure (as statsmodels'
// fdrcorrection_twostage runs it), found by bisection.
const bh = (ps, q) => {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  let k = 0;
  order.forEach(([p], r) => { if (p <= ((r + 1) / ps.length) * q) k = r + 1; });
  const rej = Array(ps.length).fill(false);
  for (let r = 0; r < k; r++) rej[order[r][1]] = true;
  return rej;
};
const bky = (ps, Q) => {
  const q1 = Q / (1 + Q);
  const s1 = bh(ps, q1);
  const r1 = s1.filter(Boolean).length;
  if (r1 === 0 || r1 === ps.length) return s1;
  return bh(ps, (q1 * ps.length) / (ps.length - r1));
};
const qValue = (ps, i) => {
  let lo = 1e-12;
  let hi = 0.999;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (bky(ps, mid)[i]) hi = mid; else lo = mid;
  }
  return hi;
};
const nativeDiscoveries = bky(welchP, 0.05).filter(Boolean).length;
const nativeQ21 = qValue(welchP, 2);
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Multiple t tests/ }).click();
await page.waitForSelector(".result-card h3:has-text('Multiple t tests')", { timeout: 30000 });
await page.waitForTimeout(800);
const summaryLine = await page.locator(".result-card .summary-line").first().innerText();
const day21 = (await page.locator(".multi-t-table tbody tr", { hasText: "Day 21" })
  .innerText()).split(/\t/);
const shownQ = Number(day21[3]);
expect(`multiple t tests: ${nativeDiscoveries} discoveries (native BKY)`,
  summaryLine.startsWith(`${nativeDiscoveries} of 3 rows`), summaryLine.slice(0, 60));
expect(`Day 21 q value matches native ${nativeQ21.toPrecision(6)}`,
  Math.abs(shownQ - nativeQ21) < 5e-7, day21.join(" | "));
expect("volcano plot draws flagged and other rows",
  await page.locator(".plot .scatterlayer .trace").count() === 2);

// Three-way ANOVA on a constructed 2 x 2 x 2 table (rows = factor A,
// datasets A-D in the guide's layout for factors B and C, n = 3 per cell).
const TW = [
  [[10, 12, 11], [14, 15, 13], [20, 22, 21], [30, 33, 31]],   // row 1: A, B, C, D
  [[9, 11, 10], [12, 14, 13], [18, 19, 20], [22, 24, 23]],    // row 2
];
// Native: the design is balanced, so the three-way interaction contrast
// L = sum(sign_A sign_B sign_C x cell mean) gives SS = n L^2 / 8, and
// MS residual is the pooled within-cell variance (16 df).
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
let L = 0;
let ssRes = 0;
TW.forEach((row, i) => row.forEach((cell, d) => {
  const sign = (i === 0 ? 1 : -1) * (d < 2 ? -1 : 1) * (d % 2 === 0 ? -1 : 1);
  L += sign * mean(cell);
  ssRes += cell.reduce((a, v) => a + (v - mean(cell)) ** 2, 0);
}));
const nativeF3 = ((3 * L * L) / 8) / (ssRes / 16);
await page.getByRole("button", { name: "New data table" }).click();
const tdialog = page.locator(".new-table-dialog");
await tdialog.locator('input[name="table-type"][value="grouped"]').check();
const shapeInputs = tdialog.locator(".field-num input");
await shapeInputs.nth(0).fill("4");
await shapeInputs.nth(1).fill("3");
await shapeInputs.nth(2).fill("2");
await tdialog.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".controls h3:has-text('Design')", { timeout: 10000 });
for (let r = 0; r < 2; r++) {
  for (let d = 0; d < 4; d++) {
    for (let s = 0; s < 3; s++) {
      await page.locator(`.data-table input[aria-label='Dataset ${"ABCD"[d]}, Y${s + 1}, row ${r + 1}']`)
        .fill(String(TW[r][d][s]));
    }
  }
}
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Three-way ANOVA/ }).click();
await page.waitForSelector(".result-card h3:has-text('Three-way ANOVA')", { timeout: 30000 });
await page.waitForTimeout(800);
const threeRow = (await page.locator(".result-card .results-table tbody tr")
  .filter({ hasText: "Row factor × Factor B × Factor C" })
  .first().innerText()).split(/\t/);
expect(`three-way interaction F = ${nativeF3.toPrecision(4)} (native contrast)`,
  threeRow[5] === nativeF3.toPrecision(4), threeRow.join(" | "));
expect("three-way graph draws two panels",
  await page.locator(".plot .subplot.xy").count() >= 1
  && await page.locator(".plot .subplot.x2y").count() >= 1);
await page.locator(".controls").getByRole("combobox", { name: /^Method/ }).selectOption("tukey");
await page.locator(".controls").getByRole("combobox", { name: /^Compare/ }).selectOption("one_factor");
await page.waitForTimeout(800);
{
  const pop = await graphSettings();
  await pop.getByRole("button", { name: "Pairwise comparisons…" }).click();
  const cd = page.locator("dialog.fmt-dialog");
  await cd.getByLabel("Show comparison brackets on the graph").check();
  await cd.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(500);
  const br = (await plotLayoutOf()).brackets;
  expect("three-way graph: brackets on both panels",
    br.some((b) => b.startsWith("x:")) && br.some((b) => b.startsWith("x2:")), br.join(" "));
}

// --- v1 project file (single-table format) migrates into one family ---
const V1 = join(tmp, "v1-project.json");
writeFileSync(V1, JSON.stringify({
  opendose_project: 1, mode: "xy",
  x: ["1e-9", "1e-8", "1e-7", "1e-6", "1e-5"],
  datasets: [{ name: "Legacy drug", rows: [["99", "101"], ["90", "92"],
    ["50", "52"], ["9", "11"], ["1", "2"]] }],
  options: { model: "log_inhibitor_vs_response_4pl" }, xUnit: "M",
  scheme: "default", titles: { xy: { x: "", y: "Viability" } },
}));
await page.setInputFiles('.load-btn input[type="file"]', V1);
await page.waitForSelector(".result-card h3:has-text('Legacy drug')", { timeout: 60000 });
expect("v1 file opens as one data table + results + graph",
  await page.locator(".nav-item.level-2[data-key^='data:']").count() === 1
  && await page.locator(".nav-item.level-2[data-key^='results:']").count() === 1
  && await page.locator(".nav-item.level-2[data-key^='graph:']").count() === 1);

// --- second data table: Grouped, via the New data table dialog ---
await page.getByRole("button", { name: "New data table" }).click();
const dialog = page.locator(".new-table-dialog");
await dialog.locator('input[name="table-type"][value="grouped"]').check();
await dialog.getByRole("button", { name: "Create table" }).click();
// A new grouped table starts with a two-way ANOVA sheet and its graph.
await page.waitForSelector(".controls h3:has-text('Design')", { timeout: 10000 });
const groupedName = (await page
  .locator(".nav-item.selected[data-key^='data:'] > .nav-row .nav-name").innerText()).trim();
expect("grouped table editor has row titles",
  await page.locator(".data-table .row-label").count() >= 2, groupedName);
await page.locator(".data-table input[aria-label='Dataset A, Y1, row 1']").fill("12.5");

// rename it in the navigator (F2 on the focused row)
await page.locator(`.nav-item[data-key^='data:'][aria-label="${groupedName}"]`).focus();
await page.keyboard.press("F2");
await page.locator(".nav-rename").fill("Two-factor data");
await page.keyboard.press("Enter");
expect("rename in navigator",
  await navRow("Two-factor data").count() === 1);

// undo / redo (keyboard and toolbar)
await page.keyboard.press("Control+z");
expect("undo restores the old name",
  await navRow(groupedName).count() === 1 && await navRow("Two-factor data").count() === 0);
await page.getByRole("button", { name: "Redo" }).click();
expect("redo renames again", await navRow("Two-factor data").count() === 1);

// --- save project JSON (v2) ---
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "Save project" }).click(),
]);
const SAVED = join(tmp, download.suggestedFilename());
await download.saveAs(SAVED);
const saved = JSON.parse(readFileSync(SAVED, "utf8"));
const grouped = saved.sheets.find((s) => s.name === "Two-factor data");
expect("saved file is v2 with the grouped table",
  saved.version === 2 && grouped?.kind === "data" && grouped.table.type === "grouped"
  && grouped.table.datasets[0].rows[0][0] === "12.5",
  `${saved.sheets.length} sheets`);

// delete it (with confirmation), then reopen the saved file
await navRow("Two-factor data").click({ button: "right" });
await page.getByRole("menuitem", { name: /Delete/ }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
expect("delete removes the sheet", await navRow("Two-factor data").count() === 0);
await page.setInputFiles('.load-btn input[type="file"]', SAVED);
await page.waitForTimeout(500);
expect("saved project reopens with the grouped table",
  await navRow("Two-factor data").count() === 1
  && await page.locator(".nav-item.level-2[data-key^='data:']").count() === 2);

// --- autosave: reload, then restore the last session ---
await page.waitForTimeout(1500); // autosave debounce
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".restore-banner", { timeout: 30000 });
await page.locator(".restore-banner").getByRole("button", { name: "Restore" }).click();
expect("restore from autosave", await navRow("Two-factor data").count() === 1);
await page.waitForSelector(".results-table", { timeout: 180000 });
await page.waitForTimeout(800);

// --- multiple-variables table: example data, regression, PCA, logistic,
// correlation, extract & rearrange. Expected numbers come from the engine
// run natively on the same 30 rows (web/src/sheets/multivariable/sample.ts):
// Response ~ Dose + Weight + Sex gives b(Dose) = 2.674371, R2 = 0.915816,
// F(3, 26) = 94.2819; standardized PCA of the four continuous variables
// gives eigenvalue(PC1) = 2.218848 (55.47% of variance), and parallel
// analysis (1000 sets, seed 0, 95th percentile 1.6729 / 1.2588) keeps one
// PC; Responder ~ Dose gives OR = 1.319196 and Dose at 50% = 5.193526;
// Pearson r(Dose, Response) = 0.920204. Shown with 4 significant digits.
await page.getByRole("button", { name: "New data table" }).click();
const mvDialog = page.locator(".new-table-dialog");
await mvDialog.locator('input[name="table-type"][value="multivariable"]').check();
await mvDialog.getByText("Example data").click();
await mvDialog.locator('input[aria-label="Table name"]').fill("Dose study");
await mvDialog.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".mv-results h3:has-text('Descriptive statistics')", { timeout: 60000 });
const mvCard = () => page.locator(".result-card.mv-results").first();
const rowText = async (label) => (await mvCard()
  .locator("tr", { has: page.locator("th", { hasText: label }) }).first().innerText())
  .replace(/\s+/g, " ");
expect("MV example: 30 observations with row titles",
  (await rowText("Number of values")).includes("30")
  && await page.locator(".data-table .row-label input[value='S30']").count() === 1);
{
  const pop = await graphSettings();
  expect("MV graph of the data draws, its options in the Settings panel",
    await appears(pop.getByRole("group", { name: "Graph options" }).getByLabel("Color by"))
    && await page.locator(".plot.js-plotly-plot").count() >= 1);
  await pop.getByRole("button", { name: "Format graph…" }).click();
  const fg = page.locator("dialog.fmt-dialog");
  await fg.getByLabel("Data set to format").selectOption({ index: 0 });
  await fg.getByLabel("Size (px)").fill("14");
  await fg.getByRole("button", { name: "OK" }).click();
  await page.waitForTimeout(400);
  const size = await page.evaluate(() => document.querySelector(".plot-card .plot")
    ?.data?.find((t) => t.meta?.odTag?.role === "points")?.marker?.size);
  expect("MV XY graph: Format graph sets the symbol size", size === 14, String(size));
}

const mvAnalyze = async (label, heading) => {
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: label }).click();
  await page.waitForSelector(`.mv-results h3:has-text('${heading}')`, { timeout: 60000 });
  await page.waitForTimeout(400);
};

await mvAnalyze(/Multiple linear regression/, "Multiple linear regression of Response");
const doseRow = await rowText("β1: Dose");
const r2Row = await rowText("R squared");
const fRow = await rowText(/^F$/);
console.log("MV regression:", doseRow, "|", r2Row, "|", fRow);
expect("multiple regression: Dose coefficient 2.674", doseRow.includes("2.674"));
expect("multiple regression: R squared 0.9158", r2Row.includes("0.9158"));
expect("multiple regression: F (3, 26) = 94.28", fRow.includes("F (3, 26) = 94.28"));
await page.locator(".graph-select").selectOption("mv_reg_forest");
await page.waitForTimeout(500);
expect("forest plot of coefficients renders",
  await page.locator(".plot.js-plotly-plot").count() === 1);

await mvAnalyze(/Principal component/, "Principal component analysis");
await page.waitForFunction(() => document.querySelector(".mv-results")?.textContent
  ?.includes("selected by parallel analysis"), { timeout: 60000 });
const pc1 = (await mvCard().locator("tr", { hasText: /^PC1/ }).first().innerText())
  .replace(/\s+/g, " ");
console.log("MV PCA:", pc1);
expect("PCA: PC1 eigenvalue 2.219 (55.5%)", pc1.includes("2.219") && pc1.includes("55.5%"));
expect("PCA: parallel analysis keeps 1 component",
  (await mvCard().innerText()).includes("1 component selected by parallel analysis"));
await page.locator(".graph-select").selectOption("mv_pca_biplot");
await page.waitForTimeout(500);
expect("PCA biplot renders", await page.locator(".plot.js-plotly-plot").count() === 1);

await mvAnalyze(/Logistic regression/, "Logistic regression of Responder");
const orRow = await rowText("β1: Dose");
const x50 = await rowText("Dose at 50% probability");
console.log("MV logistic:", orRow, "|", x50);
expect("logistic: odds ratio of Dose 1.319", orRow.includes("1.319"));
expect("logistic: Dose at 50% = 5.194", x50.includes("5.194"));

await mvAnalyze(/Correlation matrix/, "Correlation matrix");
const corrRow = (await mvCard().locator("tbody tr", { hasText: /^Dose/ }).first().innerText())
  .replace(/\s+/g, " ");
expect("correlation matrix: r(Dose, Response) = 0.9202", corrRow.includes("0.9202"), corrRow);

await mvAnalyze(/Extract/, "Extract and rearrange");
await page.getByRole("button", { name: "+ Condition" }).click();
await page.getByLabel("Condition 1: variable").selectOption("Sex");
await page.getByLabel("Condition 1: value").selectOption("F");
await page.waitForFunction(() => document.querySelector(".mv-results")?.textContent
  ?.includes("15 of 30 rows"), { timeout: 30000 });
await page.getByRole("button", { name: /Create data table/ }).click();
await page.waitForSelector(".mv-results h3:has-text('Descriptive statistics')", { timeout: 60000 });
expect("extract & rearrange creates a new, linked 15-row table",
  await navRow("Dose study (rearranged) (linked)").count() === 1
  && (await mvCard().innerText()).includes("15 rows")
  && await page.locator(".origin-note").count() === 1);
expect("a linked table says it is read-only instead of the paste hint",
  (await page.locator(".table-actions .hint").innerText()).startsWith("Read-only: computed from"));

// --- chains of analyses: Transform produces a linked, derived table ---
// The XY example data is the reference table (X from 1e-9 M).
await page.getByRole("button", { name: "New data table" }).click();
const newDlg = page.locator(".new-table-dialog");
await newDlg.locator('input[name="table-type"][value="xy"]').check();
await newDlg.getByLabel("Table name").fill("Reference");
await newDlg.getByText("Example data").click();
await newDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".results-table", { timeout: 60000 });
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Transform \(standard/ }).click();
await page.waitForSelector(".manip-controls", { timeout: 10000 });
await page.getByLabel("Transform X values").selectOption("log10");
await page.getByLabel("Transform Y values").selectOption("none");
const cellValue = (label) => page.locator(`.data-table input[aria-label="${label}"]`).inputValue();
const waitCell = (label, want) => page.waitForFunction(([l, w]) =>
  document.querySelector(`.data-table input[aria-label="${l}"]`)?.value === w,
[label, want], { timeout: 15000 }).then(() => true, () => false);
await page.locator(".manip-open").first().click();
await waitCell("X, row 1", "-9");
expect("Transform X = log(X): derived table's first X is -9",
  await cellValue("X, row 1") === "-9", await cellValue("X, row 1"));
expect("derived table is read-only and linked",
  await page.locator(".origin-note").count() === 1
  && await page.locator('.data-table input[aria-label="X, row 1"]').getAttribute("readonly") !== null
  && await page.locator(".nav-item[aria-label='Transformed Reference (linked)']").count() >= 1);

// user-defined formula; the linked table follows the new settings
await page.locator(".origin-note").getByRole("button", { name: "Settings" }).click();
await page.getByLabel("User-defined formulas").check();
await page.getByLabel("Y formula").fill("Y = Y*2 +");
await page.waitForSelector(".formula-error", { timeout: 10000 });
expect("formula validation reports the error position",
  /column 10/.test(await page.locator(".formula-error").first().innerText()));
await page.getByLabel("Y formula").fill("Y = Y*2");
await page.waitForSelector(".formula-ok", { timeout: 10000 });
await page.locator(".manip-open").first().click();
await waitCell("Drug A, Y1, row 1", "196.4");
expect("user formula Y = Y*2 doubles the first value (98.2 -> 196.4)",
  await cellValue("Drug A, Y1, row 1") === "196.4", await cellValue("Drug A, Y1, row 1"));

// chain: normalize the transformed table, then edit the raw table
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Normalize/ }).click();
await page.locator(".manip-open").first().click();
await page.waitForSelector(".chain-crumbs", { timeout: 10000 });
expect("a chain of three tables shows its breadcrumbs",
  (await page.locator(".chain-crumbs").innerText()).includes("Reference"));
await navRow("Reference").click();
await page.locator('.data-table input[aria-label="Drug A, Y1, row 1"]').fill("100");
await navRow("Transformed Reference (linked)").click();
expect("editing the source re-runs the chain (100 -> 200)",
  await waitCell("Drug A, Y1, row 1", "200"));

// --- simulate an XY table ---
await page.getByRole("button", { name: "New data table" }).click();
await page.getByRole("button", { name: "Simulate data…" }).click();
const simDlg = page.locator(".simulate-dialog");
await simDlg.getByLabel("Table name").fill("Simulated curve");
await simDlg.getByLabel("Random seed").fill("7");
await simDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".origin-note", { timeout: 15000 });
// -9 to -5 by 0.5 -> 9 rows
expect("simulated XY table has 9 rows",
  await page.locator(".data-table tbody tr").count() === 9,
  String(await page.locator(".data-table tbody tr").count()));
const before = await cellValue("Data Set A, Y1, row 1");
await page.getByRole("button", { name: "Simulate again" }).click();
await page.waitForTimeout(500);
expect("simulate again draws new values", await cellValue("Data Set A, Y1, row 1") !== before);

// --- Monte Carlo on the simulated table: 20 repeats ---
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Monte Carlo/ }).click();
await page.waitForSelector(".mc-tabs li", { timeout: 30000 });
await page.getByLabel(/^Repeats/).fill("20");
await page.getByLabel("Random seed").fill("11");
await page.locator(".mc-run-btn").click();
await page.waitForSelector(".mc-n", { timeout: 180000 });
const mcN = await page.locator(".mc-n").innerText();
const hitsLine = await page.locator(".mc-results").innerText();
console.log("Monte Carlo:", hitsLine.split("\n").find((l) => l.startsWith("A hit")));
expect("Monte Carlo results show 20 repeats", mcN.trim() === "20", mcN);
expect("Monte Carlo histogram is drawn",
  await page.locator(".plot .bars path, .plot .barlayer path").count() > 0);
expect("Monte Carlo graph sheet is named after the histogram",
  await navRow("Monte Carlo histogram of Simulated curve").count() === 1);
// --- table editing, import / export, summary formats, Data Inspector ---
const REF_X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7",
  "1e-6", "3.162e-6", "1e-5"];
const REF_ROWS = [[98.2, 101.5, 99.1], [97.0, 95.8, 99.9], [93.4, 90.1, 92.7],
  [78.9, 82.3, 80.0], [51.2, 48.7, 50.9], [22.1, 25.6, 24.0], [8.9, 10.2, 7.5],
  [3.1, 4.4, 2.2], [1.0, 0.5, 2.1]];
const eu = (v) => String(v).replace(".", ",");
const waitLogIC50 = (v) => page.waitForFunction((want) => [...document
  .querySelectorAll(".results-table tbody tr")]
  .some((tr) => tr.innerText.includes("LogIC50") && tr.innerText.includes(want)),
v, { timeout: 60000 }).then(() => true, () => false);
const teCellValue = (label) => page.locator(`.data-table input[aria-label='${label}']`).inputValue();

await page.getByRole("button", { name: "New data table" }).click();
const teDlg = page.locator(".new-table-dialog");
await teDlg.locator('input[name="table-type"][value="xy"]').check();
await teDlg.getByLabel("Table name").fill("Imported CSV");
await teDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");

// xlsx through the Import dialog's file source (read by the Python runtime)
await page.getByRole("button", { name: "Import…", exact: true }).click();
const imp = page.locator(".import-dialog");
await imp.getByLabel("File to import").setInputFiles(XLSX);
await page.waitForFunction(() =>
  document.querySelectorAll(".import-preview tbody tr").length > 0, null, { timeout: 60000 });
const xlsxSummary = await imp.locator(".import-summary").innerText();
expect("import dialog reads an .xlsx worksheet",
  xlsxSummary.startsWith("9 of 9 rows, 12 Y columns"), xlsxSummary);

// European CSV (semicolons, decimal commas) pasted as text: one line to
// skip, a titles row, X + three replicates
const csv = ["Exported by plate reader v2", "Dose;Drug A;Drug A;Drug A",
  ...REF_X.map((x, r) => [eu(x), ...REF_ROWS[r].map(eu)].join(";"))].join("\n");
await imp.getByLabel("Pasted text").check();
await imp.getByLabel("Text to import").fill(csv);
await imp.getByLabel("Lines to skip at the top").fill("1");
await imp.getByLabel(/holds column titles/).check();
await imp.getByRole("button", { name: "Import", exact: true }).click();
const imported = [await teCellValue("X, row 2"), await teCellValue("Drug A, Y2, row 1"),
  await page.locator(".data-table input[aria-label='Dataset 1 title']").inputValue(),
  await page.locator(".data-table input[aria-label='X column title']").inputValue()];
expect("CSV import: X, names, decimal commas", imported.join("|") === "3.162e-9|101.5|Drug A|Dose",
  imported.join("|"));
expect("fit of the imported table: LogIC50 -6.983", await waitLogIC50("-6.983"));

// sort by X, descending then ascending
await page.getByRole("button", { name: "Sort…" }).click();
await page.getByLabel("Sort by").selectOption({ label: "X values" });
await page.getByLabel(/Descending/).check();
await page.getByRole("button", { name: "Sort", exact: true }).click();
const sortedTop = `${await teCellValue("X, row 1")} ${await teCellValue("Drug A, Y3, row 1")}`;
expect("sort rows by X descending keeps rows together", sortedTop === "1e-5 2.1", sortedTop);
await page.getByRole("button", { name: "Sort…" }).click();
await page.getByRole("button", { name: "Sort", exact: true }).click();
expect("sort ascending restores the order", await teCellValue("X, row 1") === "1e-9");

// Data Inspector and block exclusion
await page.locator(".data-table input[aria-label='Drug A, Y1, row 1']").click();
expect("data inspector summarizes the column",
  (await page.locator(".data-inspector [data-stat='N']").innerText()) === "9");
await page.keyboard.press("Shift+ArrowRight");
await page.keyboard.press("Shift+ArrowRight");
await page.keyboard.press("Control+e");
expect("Ctrl+E excludes a selected block",
  (await page.locator(".data-inspector [data-stat='Excluded']").innerText()) === "3"
  && await page.locator(".data-table td.excluded").count() === 3);
await page.keyboard.press("Control+e");
expect("Ctrl+E again includes it", await page.locator(".data-table td.excluded").count() === 0);

// export the data table as CSV
await page.getByRole("button", { name: "Export…" }).click();
const [csvDl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "Download CSV" }).click(),
]);
const csvPath = join(tmp, csvDl.suggestedFilename());
await csvDl.saveAs(csvPath);
const csvLines = readFileSync(csvPath, "utf8").replace(/^﻿/, "").split(/\r?\n/);
expect("exported CSV has titles and every value",
  csvLines[0] === "Dose,Drug A,Drug A,Drug A" && csvLines[1] === "1e-9,98.2,101.5,99.1"
  && csvLines[9] === "1e-5,1,0.5,2.1", [0, 1, 9].map((i) => csvLines[i]).join(" | "));

// results export: the rendered fit table as CSV
const [resDl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.locator(".results-export").getByRole("button", { name: "CSV" }).click(),
]);
const resPath = join(tmp, resDl.suggestedFilename());
await resDl.saveAs(resPath);
expect("results CSV holds the rendered LogIC50 row",
  readFileSync(resPath, "utf8").split(/\r?\n/).some((l) => l.startsWith("LogIC50,-6.983")));

// replicates -> Mean, SD, N as a new table (engine summary_convert)
await page.getByRole("button", { name: "Convert…" }).click();
await page.getByLabel("New table holds").selectOption("mean_sd_n");
await page.getByRole("button", { name: "Create table" }).click();
await page.waitForFunction(() => document.querySelector(
  ".data-table input[aria-label='Drug A, Mean, row 1']"), null, { timeout: 30000 });
expect("converted table holds the mean", await teCellValue("Drug A, Mean, row 1") === "99.6");
expect("fit of the converted Mean/SD/N table: LogIC50 -6.983", await waitLogIC50("-6.983"));

// switch the imported table itself to Mean, SD, N and type the summaries
await navRow("Imported CSV").click();
await page.getByRole("button", { name: "Format…" }).click();
await page.getByRole("combobox", { name: "Y values entered as" }).selectOption("mean_sd_n");
await page.getByRole("button", { name: "Apply" }).click();
for (let r = 0; r < REF_ROWS.length; r++) {
  const v = REF_ROWS[r];
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  await page.locator(`.data-table input[aria-label='Drug A, Mean, row ${r + 1}']`).fill(m.toPrecision(10));
  await page.locator(`.data-table input[aria-label='Drug A, SD, row ${r + 1}']`).fill(sd.toPrecision(10));
  await page.locator(`.data-table input[aria-label='Drug A, N, row ${r + 1}']`).fill("3");
}
expect("Mean/SD/N entry fits like the replicates: LogIC50 -6.983", await waitLogIC50("-6.983"));

// insert series into a new table's X, then show X as dates
await page.getByRole("button", { name: "New data table" }).click();
await teDlg.locator('input[name="table-type"][value="xy"]').check();
await teDlg.getByLabel("Table name").fill("Series test");
await teDlg.getByRole("button", { name: "Create table" }).click();
await page.locator(".data-table input[aria-label='X, row 1']").click();
await page.getByRole("button", { name: "Insert series…" }).click();
await page.getByLabel("First value").fill("0");
await page.getByRole("textbox", { name: "Increment" }).fill("0.5");
await page.getByLabel("Number of values").fill("12");
await page.getByRole("button", { name: "Insert series", exact: true }).click();
expect("insert series fills X and adds rows",
  await teCellValue("X, row 5") === "2" && await teCellValue("X, row 12") === "5.5");
await page.getByRole("button", { name: "Format…" }).click();
await page.getByRole("combobox", { name: "X values are" }).selectOption("dates");
await page.getByRole("button", { name: "Apply" }).click();
await page.locator(".data-table input[aria-label='X, row 1']").fill("5 Mar 2024");
await page.locator(".data-table input[aria-label='Dataset A, Y1, row 1']").click();
expect("dates in X display in a standard form",
  await teCellValue("X, row 1") === "2024-03-05");

// --- graph formatting: Format Axes, pairwise brackets, undo, save ---
await page.getByRole("button", { name: "New data table" }).click();
const colDialog = page.locator(".new-table-dialog");
await colDialog.locator('input[name="table-type"][value="column"]').check();
await colDialog.getByLabel("Example data").check();
await colDialog.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".stat-cols", { timeout: 30000 });
await page.locator(".analysis-select").selectOption("anova");
await page.waitForSelector(".result-card h3:has-text('ANOVA')", { timeout: 30000 });
await page.waitForTimeout(400);
const fmt = page.locator("dialog.fmt-dialog");
const plotLayout = () => page.evaluate(() => {
  const l = document.querySelector(".plot").layout;
  return {
    yaxis: { type: l.yaxis.type, range: l.yaxis.range, ef: l.yaxis.exponentformat },
    brackets: (l.annotations ?? []).filter((a) => a.name === "bracket-label").map((a) => a.text),
  };
});

// Format Axes: manual Y range on a log10 scale, power-of-ten numbering
await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Format axes…" }).click();
await fmt.getByLabel("Minimum").fill("10");
await fmt.getByLabel("Maximum").fill("100");
await fmt.getByLabel("Scale").selectOption("log10");
await fmt.getByLabel("Format", { exact: true }).selectOption("power10");
await fmt.getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(500);
const axes = (await plotLayout()).yaxis;
expect("Format Axes: manual log10 Y range with power-of-ten numbering",
  axes.type === "log" && Math.abs(axes.range[0] - 1) < 1e-9
  && Math.abs(axes.range[1] - 2) < 1e-9 && axes.ef === "power", JSON.stringify(axes));

// Pairwise comparison brackets from the ANOVA's Tukey table
await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Pairwise comparisons…" }).click();
await fmt.getByLabel("Show comparison brackets on the graph").check();
await fmt.getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(500);
const brackets = (await plotLayout()).brackets;
expect("comparison brackets drawn with asterisks",
  brackets.length === 3 && brackets.some((t) => t.includes("**")), brackets.join(" "));
await page.getByRole("button", { name: "Undo" }).click();
await page.waitForTimeout(300);
expect("undo removes the brackets", (await plotLayout()).brackets.length === 0);
await page.getByRole("button", { name: "Redo" }).click();
await page.waitForTimeout(300);
expect("redo brings them back", (await plotLayout()).brackets.length === 3);

const [fmtDownload] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("button", { name: "Save project" }).click(),
]);
const FMT_SAVED = join(tmp, `formatted-${fmtDownload.suggestedFilename()}`);
await fmtDownload.saveAs(FMT_SAVED);
const fmtGraph = JSON.parse(readFileSync(FMT_SAVED, "utf8")).sheets
  .find((s) => s.kind === "graph" && s.settings?.format?.comparisons?.show);
expect("graph format is saved with the project",
  fmtGraph?.settings.format.y?.scale === "log10", JSON.stringify(fmtGraph?.settings.format ?? null));

// --- project organisation: templates, analyze-like, consistent graph
// formats, sheet groups, floating notes; saved and reloaded ---------------
const orgDlg = page.locator(".new-table-dialog");
const orgNewXY = async (name) => {
  await page.getByRole("button", { name: "New data table" }).click();
  await orgDlg.locator('input[name="table-type"][value="xy"]').check();
  await orgDlg.getByLabel("Table name").fill(name);
  await orgDlg.getByText("Example data").click();
  await orgDlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".results-table", { timeout: 60000 });
};
const orgHasLogIC50 = (want) => page.waitForFunction((w) => [...document
  .querySelectorAll(".results-table tr")].some((tr) => tr.textContent.includes("LogIC50")
  && tr.textContent.includes(w)), want, { timeout: 30000 }).then(() => true, () => false);
const orgSave = async (stem) => {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "Save project" }).click(),
  ]);
  const path = join(tmp, `${stem}-${dl.suggestedFilename()}`);
  await dl.saveAs(path);
  return { path, json: JSON.parse(readFileSync(path, "utf8")) };
};
const orgSheet = (json, name) => json.sheets.find((s) => s.name === name);

await orgNewXY("Org source");
// give its graph a distinctive format: manual Y range
await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Format axes…" }).click();
const orgFmt = page.locator("dialog.fmt-dialog");
await orgFmt.getByLabel("Minimum").fill("-10");
await orgFmt.getByLabel("Maximum").fill("120");
await orgFmt.getByRole("button", { name: "OK" }).click();
await page.waitForTimeout(300);

// save it as a template (with its data), then create a table from it
await navRow("Org source").click({ button: "right" });
await page.getByRole("menuitem", { name: "Save family as template…" }).click();
const tplDlg = page.locator(".save-template-dialog");
await tplDlg.getByLabel("Template name").fill("Org IC50 template");
await tplDlg.getByRole("radio", { name: /With all the data/ }).check();
const [tplDl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  tplDlg.getByRole("button", { name: "Download file" }).click(),
]);
const tplJson = JSON.parse(readFileSync(await tplDl.path(), "utf8"));
expect("template file holds the table, its analysis and its graph format",
  tplDl.suggestedFilename() === "org-ic50-template.odtemplate.json"
  && tplJson.opendose_template === 1 && tplJson.template.results[0]?.analysis === "nonlin"
  && tplJson.template.graphs[0]?.settings?.format?.y?.max === 120,
  tplDl.suggestedFilename());
await navRow("Org source").click({ button: "right" });
await page.getByRole("menuitem", { name: "Save family as template…" }).click();
await tplDlg.getByLabel("Template name").fill("Org IC50 template");
await tplDlg.getByRole("radio", { name: /With all the data/ }).check();
await tplDlg.getByRole("button", { name: "Save template" }).click();
await page.getByRole("button", { name: "New data table" }).click();
await orgDlg.getByRole("radio", { name: "From a template" }).check();
await orgDlg.getByRole("radio", { name: /Org IC50 template/ }).check();
await orgDlg.getByLabel("Table name").fill("Org from template");
await orgDlg.getByRole("button", { name: "Create from template" }).click();
expect("a table made from the template runs its analysis (LogIC50 -6.983)",
  await navRow("Org from template").count() === 1 && await orgHasLogIC50("-6.983"));

// analyze and graph like: a second table copies Org source's analyses and graphs
await orgNewXY("Org target");
await navRow("Org target").click({ button: "right" });
await page.getByRole("menuitem", { name: "Analyze and graph like…" }).click();
await page.locator(".wand-dialog").getByRole("radio", { name: /Org source/ }).check();
await page.locator(".wand-dialog").getByRole("button", { name: "Analyze and graph" }).click();
await page.waitForTimeout(500);
expect("analyze-like adds a second fit to the table",
  await page.locator(".mode-switch [role=tab]").count() === 2);

// make the other XY graphs look like Org source's graph
await navRow("Graph of Org source").click({ button: "right" });
await page.getByRole("menuitem", { name: /Apply this format to graphs of this kind/ }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Apply format" }).click();

// group: Org target into a new group "Org batch"
await navRow("Org target").click({ button: "right" });
await page.getByRole("menuitem", { name: "Move to group…" }).click();
await page.locator(".group-dialog").getByRole("radio", { name: "A new group:" }).check();
await page.getByLabel("Name of the new group").fill("Org batch");
await page.locator(".group-dialog").getByRole("button", { name: "Move", exact: true }).click();
const orgInGroup = () => page.locator(
  ".nav-item[aria-label='Org batch (group)'] .nav-item[aria-label='Org target']").count();
expect("the table is listed inside its group", await orgInGroup() === 1);

// floating note on Org source
await navRow("Org source").click();
await page.getByRole("button", { name: "Add a floating note to the selected sheet" }).click();
await page.locator(".floating-note textarea").first().waitFor({ state: "visible" });
await page.keyboard.type("Check the top plateau");
expect("the note shows as a chip above the sheet",
  (await page.locator(".note-chip").first().innerText()).includes("Check the top plateau"));

const orgSaved = await orgSave("organised");
const orgTarget = orgSheet(orgSaved.json, "Org target");
const orgGroup = (orgSaved.json.groups ?? []).find((g) => g.name === "Org batch");
const targetGraphs = orgSaved.json.sheets.filter((s) => s.kind === "graph"
  && s.parentId === orgTarget?.id);
expect("analyze-like copied the graph with its format; make-consistent restyled the rest",
  targetGraphs.length === 2 && targetGraphs.every((g) => g.settings?.format?.y?.max === 120)
  && new Set(orgSaved.json.sheets.map((s) => s.id)).size === orgSaved.json.sheets.length,
  JSON.stringify(targetGraphs.map((g) => g.settings?.format?.y ?? null)));
expect("the saved project holds the group and the note",
  orgGroup?.section === "data" && orgTarget?.groupId === orgGroup.id
  && orgSheet(orgSaved.json, "Org source")?.floatingNotes?.[0]?.text === "Check the top plateau");

// reopen the saved file, then reload the page and restore the session
await navRow("Org target").click({ button: "right" });
await page.getByRole("menuitem", { name: "Remove from group" }).click();
await page.setInputFiles('.load-btn input[type="file"]', orgSaved.path);
await page.waitForTimeout(500);
await navRow("Org source").click();
expect("reopened file: group and note are back",
  await orgInGroup() === 1
  && (await page.locator(".note-chip").first().innerText()).includes("Check the top plateau"));
await page.waitForTimeout(1500); // autosave debounce
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".restore-banner", { timeout: 30000 });
await page.locator(".restore-banner").getByRole("button", { name: "Restore" }).click();
await page.waitForSelector(".results-table", { timeout: 180000 });
await navRow("Org source").click();
expect("after a page reload the restored session keeps the group and the note",
  await orgInGroup() === 1
  && (await page.locator(".note-chip").first().innerText()).includes("Check the top plateau"));
await page.getByRole("button", { name: "New data table" }).click();
await orgDlg.getByRole("radio", { name: "From a template" }).check();
expect("saved templates outlive the page (kept in this browser)",
  await orgDlg.getByRole("radio", { name: /Org IC50 template/ }).count() === 1);
await orgDlg.getByRole("button", { name: "Cancel" }).click();
// Ctrl/Cmd+K: go to a sheet by typing part of its name
await page.keyboard.press("Control+k");
await page.getByRole("combobox", { name: "Sheet name" }).fill("org targ");
await page.keyboard.press("Enter");
expect("go to sheet opens the match",
  await page.locator(".nav-item.selected[aria-label='Org target']").count() >= 1);

// --- equation library: a built-in model listed by the engine -------------
// Native engine on the reference data (engine/tests/test_api.py REF_Y):
// asymmetric_5pl_log gives S = 0.7551 (LogEC50 -6.979).
await newExampleTable("xy");
expect("example XY table fits the reference 4PL: LogIC50 -6.983", await waitLogIC50("-6.983"));
const paramRow = (name) => page.waitForFunction((n) => [...document
  .querySelectorAll(".results-table tbody tr")]
  .find((tr) => tr.querySelector("th")?.textContent.trim() === n)?.innerText ?? false,
name, { timeout: 60000 }).then((h) => h.jsonValue(), () => "");
await page.getByRole("button", { name: /^Model:/ }).click();
await page.getByRole("combobox", { name: "Search models" }).fill("asymmetrical five log");
await page.getByRole("option", { name: /Asymmetrical \(five parameter\), X is log/ }).click();
const sRow = await paramRow("S");
expect("library model asymmetric_5pl_log fits: S = 0.7551", sRow.includes("0.7551"),
  sRow.replace(/\s+/g, " "));

// --- user-defined equation: the 4PL typed in reproduces the built-in fit --
await page.getByRole("button", { name: /^Model:/ }).click();
await page.getByRole("combobox", { name: "Search models" }).fill("own equation");
await page.getByRole("option", { name: /Enter your own equation/ }).click();
const eqDlg = page.getByRole("dialog", { name: "User-defined equation" });
await eqDlg.getByLabel("Name").fill("My 4PL");
await eqDlg.getByLabel("Equation", { exact: true })
  .fill("Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))");
await eqDlg.getByLabel(/X in this equation is log/).check();
await eqDlg.getByText("Equation is valid").waitFor({ timeout: 30000 });
await eqDlg.getByRole("button", { name: "Use this equation" }).click();
expect("user-defined 4PL: LogIC50 -6.983 (same as the built-in fit)",
  await waitLogIC50("-6.983"));
expect("methods text names the user-defined equation",
  (await page.locator(".methods-text p").first().innerText()).includes("“My 4PL”"));

// --- Welch / Brown-Forsythe ANOVA with Games-Howell (column example) ---
// Native: W(2, 9.931) = 80.71; Games-Howell Control vs. Treated A
// adjusted P = 0.0006337 (q = 7.914, Welch df 9.881).
await newExampleTable("column");
await page.waitForSelector(".stat-cols", { timeout: 30000 });
await page.locator(".analysis-select").selectOption("anova");
await page.getByLabel("Standard deviations").selectOption("unequal");
await page.waitForSelector(".result-card h3:has-text('SDs not assumed equal')", { timeout: 30000 });
const welchText = await page.locator(".pane-results .result-card").first().innerText();
expect("Welch ANOVA: W(2, 9.931) = 80.71", welchText.includes("W(2, 9.931) = 80.71"));
const ghRow = await page.locator(".results-table tr", { hasText: "Control vs. Treated A" }).first().innerText();
expect("Games-Howell Control vs. Treated A: adjusted P 6.337e-4", ghRow.includes("6.337e-4"),
  ghRow.replace(/\s+/g, " "));

// --- chi-square test for trend on a 6 x 2 table ---
// Altman (1991) shoe size vs. Caesarean section, as in
// engine/tests/test_contingency_extras.py: chi-square for trend 8.024.
await page.getByRole("button", { name: "New data table" }).click();
const ctDlg = page.locator(".new-table-dialog");
await ctDlg.locator('input[name="table-type"][value="contingency"]').check();
await ctDlg.getByLabel("Table name").fill("Shoe size");
await ctDlg.getByLabel("Outcomes (columns)").fill("2");
await ctDlg.getByLabel("Groups (rows)").fill("6");
await ctDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");
const shoes = [[5, 17], [7, 28], [6, 36], [7, 41], [8, 46], [10, 140]];
for (let r = 0; r < shoes.length; r++) {
  for (let c = 0; c < 2; c++) {
    await page.locator(`.data-table input[aria-label="Outcome ${c + 1}, row ${r + 1}"]`)
      .fill(String(shoes[r][c]));
  }
}
await page.getByLabel(/Chi-square test for trend/).check();
await page.waitForSelector(".result-card h4:has-text('test for trend')", { timeout: 30000 });
const trendRow = await page.locator(".results-table tr", { hasText: "Chi-square for trend" }).innerText();
expect("chi-square for trend 8.024, df 1", trendRow.includes("8.024, 1"), trendRow.replace(/\s+/g, " "));

// --- Deming regression on a small XY table ---
// Native (and the closed form for lambda = 1): slope 1.991, Y intercept 0.067.
await page.getByRole("button", { name: "New data table" }).click();
const dmDlg = page.locator(".new-table-dialog");
await dmDlg.locator('input[name="table-type"][value="xy"]').check();
await dmDlg.getByLabel("Table name").fill("Method comparison");
await dmDlg.getByLabel("Replicates per X").fill("1");
await dmDlg.getByLabel("Rows (X values)").fill("8");
await dmDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");
const DX = [1, 2, 3, 4, 5, 6, 7, 8], DY = [2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.2, 15.8];
for (let r = 0; r < DX.length; r++) {
  await page.locator(`.data-table input[aria-label="X, row ${r + 1}"]`).fill(String(DX[r]));
  await page.locator(`.data-table input[aria-label="Dataset A, row ${r + 1}"]`).fill(String(DY[r]));
}
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Deming regression/ }).click();
const slopeRow = await paramRow("Slope");
expect("Deming regression: slope 1.991", slopeRow.includes("1.991"), slopeRow.replace(/\s+/g, " "));
expect("Deming graph draws the points and the line",
  await page.locator(".plot .scatterlayer .trace").count() === 2);

// --- .pzfx export and re-import ---
// The "Imported CSV" table was switched to Mean, SD, N above: it must
// come back as a summary table that fits the same (LogIC50 -6.983).
await navRow("Imported CSV").click({ button: "right" });
const [pzOne] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("menuitem", { name: "Export this table as .pzfx" }).click(),
]);
const pzOnePath = join(tmp, pzOne.suggestedFilename());
await pzOne.saveAs(pzOnePath);
const pzOneXml = readFileSync(pzOnePath, "utf8");
expect("table exported as .pzfx with the Mean/SD/N format",
  pzOne.suggestedFilename() === "imported-csv.pzfx" && pzOneXml.includes('YFormat="SDN"')
  && pzOneXml.includes("<Title>Imported CSV</Title>"), pzOne.suggestedFilename());
await page.setInputFiles('.load-btn input[type="file"]', pzOnePath);
await page.waitForFunction(() => document.querySelector(
  ".data-table input[aria-label='Drug A, Mean, row 1']"), null, { timeout: 30000 });
expect(".pzfx round trip: the re-imported table is a Mean/SD/N table named after the export",
  await navRow("Imported CSV (2)").count() === 1 && await teCellValue("Drug A, Mean, row 1") === "99.6",
  await teCellValue("Drug A, Mean, row 1"));
expect(".pzfx round trip: the re-imported summary table fits the same (LogIC50 -6.983)",
  await waitLogIC50("-6.983"));
// the whole project from Save project ▾
await page.getByRole("button", { name: "More ways to save and share" }).click();
const [pzAll] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  page.getByRole("menuitem", { name: /Export as \.pzfx/ }).click(),
]);
const pzAllPath = join(tmp, pzAll.suggestedFilename());
await pzAll.saveAs(pzAllPath);
await page.setInputFiles('.load-btn input[type="file"]', pzAllPath);
await page.waitForSelector(".pzfx-chooser", { timeout: 30000 });
const chooser = await page.locator(".pzfx-chooser").innerText();
expect(".pzfx project export lists its tables on re-import (contingency stays contingency)",
  chooser.includes("Shoe size (Contingency)") && chooser.includes("Method comparison (XY)")
  && !chooser.includes("Multiple variables"), chooser.replace(/\s+/g, " ").slice(0, 160));
await page.locator(".pzfx-chooser button", { hasText: "Cancel" }).click();

// --- clinical statistics, from the built-in templates ---
const fromTemplate = async (re, name) => {
  await page.getByRole("button", { name: "New data table" }).click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.getByRole("radio", { name: "From a template" }).check();
  await dlg.getByRole("radio", { name: re }).check();
  await dlg.getByLabel("Table name").fill(name);
  await dlg.getByRole("button", { name: "Create from template" }).click();
};
const cardRow = async (heading, rowText) => {
  const card = page.locator(".result-card", { has: page.locator(`h3:has-text("${heading}")`) }).first();
  await card.waitFor({ timeout: 60000 });
  return card.locator("tr", { hasText: rowText }).first().innerText({ timeout: 60000 })
    .then((t) => t.replace(/\s+/g, " "), () => "");
};

// Cox regression on the R survival package's lung data: coxph(Surv(time,
// status) ~ age + sex): HR female vs male 0.5986 (0.4311 to 0.8311).
await fromTemplate(/Cox regression \(lung/, "Lung");
const coxSex = await cardRow("Cox proportional hazards", "Group: Female vs Male");
expect("Cox (lung, age + sex): HR female vs male 0.5986, 95% CI 0.4311 to 0.8311",
  coxSex.includes("0.5986") && coxSex.includes("0.4311 to 0.8311"), coxSex);
const coxGlobal = await cardRow("Cox proportional hazards", "Global");
expect("Cox: proportional-hazards global test chi-square 2.771", coxGlobal.includes("2.771"), coxGlobal);
expect("Cox forest plot draws the hazard ratios",
  await page.locator(".plot .scatterlayer .point").count() === 2);
await page.locator(".graph-select").selectOption("cox_curves");
await page.waitForTimeout(600);
expect("Cox adjusted curves: one per group", (await page.evaluate(() =>
  (document.querySelector(".plot-card .plot")?.data ?? []).filter((t) => t.mode === "lines" && t.name)
    .map((t) => t.name))).join(",") === "Male,Female");
await page.locator(".graph-select").selectOption("cox_schoenfeld");
await page.waitForTimeout(600);
expect("Schoenfeld residuals: 165 events and a smooth",
  await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .map((t) => t.x?.length ?? 0).join(",")) === "165,165");
await fromTemplate(/Cox regression from a variables/, "Lung variables");
const coxMv = await cardRow("Cox proportional hazards", "Sex: Female vs Male");
expect("Cox from a multiple-variables table (status 2 = died): HR 0.5986", coxMv.includes("0.5986"), coxMv);

// ROC: pROC's aSAH data, DeLong paired WFNS vs S100B Z = 2.209,
// P = 0.02718; Youden cut-off of S100B 0.205.
await fromTemplate(/ROC curves: compare/, "aSAH");
const delongP = await cardRow("Comparison of ROC curves", "P value");
const delongZ = await cardRow("Comparison of ROC curves", "Z");
expect("ROC comparison (aSAH, paired DeLong): Z = 2.209, P = 0.02718",
  delongP.includes("0.02718") && delongZ.includes("2.209"), `${delongZ} | ${delongP}`);
const s100Cut = await cardRow("ROC curve: S100B", "Cut-off");
expect("ROC: Youden cut-off of S100B 0.205", s100Cut.includes("0.205"), s100Cut);
expect("ROC graph draws both curves", (await page.evaluate(() =>
  (document.querySelector(".plot-card .plot")?.data ?? []).filter((t) => t.mode === "lines" && t.name)
    .length)) === 2);

// Bland-Altman: Bland & Altman (2007) ejection fractions. Ignoring
// subjects SD 0.9611 (limits -1.281 to 2.486); with subjects (true
// value varies) SD 0.9906, limits -1.339 to 2.544.
await fromTemplate(/Bland–Altman method/, "Ejection fraction");
const baLoa = await cardRow("Bland-Altman", "limits of agreement");
expect("Bland-Altman limits -1.281 to 2.486", baLoa.includes("-1.281 to 2.486"), baLoa);
const baCi = await cardRow("Bland-Altman", "CI of the lower limit");
expect("Bland-Altman exact CI of the lower limit -1.777 to -0.9183", baCi.includes("-1.777 to -0.9183"), baCi);
await page.getByLabel("Several rows per subject").selectOption("varies");
await page.waitForSelector(".result-card h3:has-text('repeated measurements')", { timeout: 60000 });
const baRep = await cardRow("repeated measurements", "limits of agreement");
expect("Bland-Altman with repeated measures: limits -1.339 to 2.544", baRep.includes("-1.339 to 2.544"), baRep);

// Quantal: MASS budworm, parallel logit on log2 dose: female ED25 2.231
// and LD50 3.264 (dose.p).
await fromTemplate(/Quantal dose-response/, "Budworm");
const bwRows = await page.locator(".result-card", { has: page.locator("h3:has-text('Female: effective doses')") })
  .first().innerText({ timeout: 60000 }).catch(() => "");
expect("quantal (budworm): female ED25 2.231 and LD50 3.264",
  /ED25\s+2\.231/.test(bwRows) && /LD50 \/ ED50\s+3\.264/.test(bwRows), bwRows.replace(/\s+/g, " ").slice(0, 120));
expect("quantal graph: proportions and fitted curves", (await page.evaluate(() =>
  (document.querySelector(".plot-card .plot")?.data ?? []).length)) >= 4);

// Power: Faul et al. (2007), the G*Power example: d = 0.5, one-sided
// alpha 0.05, power 0.95 -> 88 per group, 176 in total.
await page.getByRole("button", { name: "Tools" }).click();
await page.getByRole("menuitem", { name: /Power and sample size/ }).click();
const pw = page.locator("dialog.power-dialog");
await pw.getByLabel("Tails").selectOption("1");
await pw.getByLabel("Power (1 − β)").fill("0.95");
await pw.getByLabel("Cohen's d").fill("0.5");
await pw.getByLabel("Unit").fill("mice");
await pw.getByLabel("Expected attrition (%)").fill("10");
const pwOk = await page.waitForFunction(() => {
  const t = document.querySelector("dialog.power-dialog .power-sentence")?.textContent ?? "";
  return t.includes("88 mice per group (176 in total)") && t.includes("98 mice per group");
}, null, { timeout: 60000 }).then(() => true, () => false);
expect("power (G*Power example): 88 per group, 176 in total, 98 allocated with 10% attrition", pwOk,
  await pw.locator(".power-summary").innerText().catch(() => ""));
expect("power curves drawn", await pw.locator(".power-curve .plot").count() === 2);
await pw.getByRole("button", { name: "Save to project" }).click();
await page.waitForTimeout(400);
await pw.getByRole("tab", { name: "Randomisation list" }).click();
await pw.getByLabel("Seed").fill("42");
await pw.getByRole("button", { name: "Generate list" }).click();
const [rndDl] = await Promise.all([
  page.waitForEvent("download", { timeout: 30000 }),
  pw.getByRole("button", { name: "Download CSV" }).click(),
]);
const rndPath = join(tmp, rndDl.suggestedFilename());
await rndDl.saveAs(rndPath);
const rnd = readFileSync(rndPath, "utf8").trim().split("\n");
expect("randomisation list: 24 units in balanced blocks, seed in the file name",
  rnd.length === 25 && rnd[0] === "Sequence,ID,Block,Group" && /seed-42/.test(rndDl.suggestedFilename())
  && rnd.filter((l) => l.endsWith(",Drug")).length === 12, rndDl.suggestedFilename());
await pw.getByRole("button", { name: "Done" }).click();
expect("the sample-size justification is saved as an info sheet",
  await navRow("Sample size justification").count() === 1);

await page.screenshot({
  path: join(here, "app.png"),
  fullPage: true,
});
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("e2e OK");
