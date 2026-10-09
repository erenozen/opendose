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
// test for trend and Deming regression, the assay modules of the second
// half (growth curve doubling time, synergy scores, AUC, clustered heat
// map, volcano from a table, tumour growth; the first half is in
// e2e-assays.mjs), the guidance (the "Which test?"
// wizard, results chips, an ambiguous-fit banner, the start screen with
// paste-and-suggest, the guided tour shown once), the reporting package
// (effect sizes, results sentence and legend, estimation plots, journal
// checklists, history, P-value style), .pzfx export and re-import, Cox
// regression, ROC comparison, Bland-Altman, quantal dose-response, the
// power and sample size tool, and the site-validation follow-ups (both
// log-rank forms and the Kaplan-Meier tables on R's aml, Fisher's exact
// test on an r x c table, expected counts and residuals, "From long
// table…" for CMH and quantal data, the quantal upper asymptote), the
// discoverability links (Help me choose…, Plan next experiment, How this is
// validated, Cox from survival, Compare fits from a fit, Prism files on the
// start screen and in the Save menu), survival data from counts per
// day with the pairwise log-rank table, the test for trend, "median not
// reached", survival at a time and RMST, exclusions with reasons (n
// enrolled / analysed in the results, legend and methods; the results with
// the excluded values included) and the reproduction check when a project
// saved by another version is opened.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { strFromU8, unzipSync } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const XLSX = join(here, "..", "..", "engine", "tests", "fixtures",
  "synthetic_srb_plate.xlsx");

const baseUrl = process.argv[2] ?? "http://localhost:5173/";
// ?example=1 opens the example project directly (no start screen, no tour).
const url = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("example", "1");
  return u.toString();
})();
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
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
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
const viewedBefore = await page.locator('[role=treeitem][aria-selected="true"]').first().getAttribute("aria-label");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".restore-banner", { timeout: 30000 });
await page.locator(".restore-banner").getByRole("button", { name: "Restore" }).click();
expect("restore from autosave", await navRow("Two-factor data").count() === 1);
const viewedAfter = await page.locator('[role=treeitem][aria-selected="true"]').first().getAttribute("aria-label");
expect("restore reopens the sheet last viewed", !!viewedBefore && viewedAfter === viewedBefore,
  `${viewedBefore} → ${viewedAfter}`);
await page.waitForFunction(() => globalThis.__opendoseEngine?.state.phase === "ready", null, { timeout: 180000 });
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
// the workbook is read in the engine worker: wait for its preview (not a
// preview of whatever the dialog showed before)
await page.waitForFunction(() =>
  document.querySelectorAll(".import-preview tbody tr").length > 0
  && /^9 of 9 rows/.test(document.querySelector(".import-dialog .import-summary")?.textContent ?? ""),
null, { timeout: 60000 }).catch(() => {});
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
await page.waitForFunction(() => globalThis.__opendoseEngine?.state.phase === "ready", null, { timeout: 180000 });
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

// --- assay modules: growth, tumour growth, AUC, synergy, volcano, clustering
// Native numbers from the engine (engine/tests): Growthcurver well A1
// logistic K = 1.118657 → doubling time ln 2 / K = 0.6196 h; SynergyFinder
// vignette block 1 Bliss summary 10.86; trapezoid area 7 of (0,0) (1,2)
// (2,4) (3,2); average-linkage leaf order A, C, B, D / Z, X, Y (scipy).
const assayTemplate = async (tpl, name) => {
  await page.getByRole("button", { name: "New data table" }).click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.getByRole("radio", { name: "From a template" }).check();
  await dlg.getByRole("radio", { name: new RegExp(tpl) }).check();
  await dlg.getByLabel("Table name").fill(name);
  await dlg.getByRole("button", { name: "Create from template" }).click();
};
const resultsText = () => page.locator(".pane-results").first().innerText();
await assayTemplate("Bacterial growth curve", "Growth A1");
expect("growth curve (Growthcurver A1): logistic doubling time 0.6196 h",
  await page.waitForFunction(() => [...document.querySelectorAll(".results-table tr")]
    .some((tr) => /^A1\s+0\.6196 h/.test(tr.innerText.trim())), null, { timeout: 90000 })
    .then(() => true, () => false));
expect("growth curve: K = 1.119 from the same fit", (await resultsText()).includes("K\t1.119"));
expect("growth graph draws the points and the fitted curve",
  await page.locator(".plot .scatterlayer .trace").count() === 2);

await assayTemplate("Drug combination matrix", "Combination");
const blissRow = await page.locator(".results-table tr", { hasText: "Bliss (bliss independence)" })
  .first().innerText({ timeout: 90000 }).catch(() => "");
expect("synergy (SynergyFinder vignette block): Bliss summary score 10.86",
  blissRow.includes("10.86"), blissRow.replace(/\s+/g, " "));
// The landscapes draw after the results sheet; wait for them.
await page.waitForFunction(
  () => document.querySelectorAll(".plot .heatmaplayer .hm").length === 4
    && document.querySelectorAll(".plot .colorbar").length === 1,
  { timeout: 30000 }).catch(() => {});
expect("synergy: four landscapes on one diverging scale (one colour bar)",
  await page.locator(".plot .heatmaplayer .hm").count() === 4
  && await page.locator(".plot .colorbar").count() === 1);
expect("synergy: Chou-Talalay table with combination indices",
  (await resultsText()).includes("Combination index per dose pair") || (await page.locator(".results-table", { hasText: "Interpretation" }).count()) === 1);
await page.locator(".graph-select").selectOption("synergy_fa_ci");
// The example's drug-1 median-effect line slopes the wrong way (r < 0),
// so the engine withholds every combination index and the plot says why.
expect("synergy: Fa-CI plot draws the combinations or says why they are withheld",
  await appears(page.locator(".plot .scatterlayer .trace"), 8000)
  || await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .some((a) => /withheld/.test(a.text ?? "")), null, { timeout: 15000 }).then(() => true, () => false));

// AUC by trapezoid on a tiny XY table
await page.getByRole("button", { name: "New data table" }).click();
const aucDlg = page.locator(".new-table-dialog");
await aucDlg.locator('input[name="table-type"][value="xy"]').check();
await aucDlg.getByLabel("Table name").fill("Tiny curve");
await aucDlg.getByLabel("Replicates per X").fill("1");
await aucDlg.getByLabel("Rows (X values)").fill("4");
await aucDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");
const AX = [0, 1, 2, 3], AY = [0, 2, 4, 2];
for (let r = 0; r < 4; r++) {
  await page.locator(`.data-table input[aria-label="X, row ${r + 1}"]`).fill(String(AX[r]));
  await page.locator(`.data-table input[aria-label="Dataset A, row ${r + 1}"]`).fill(String(AY[r]));
}
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Assay: Area under the curve/ }).click();
const areaRow = await page.locator(".results-table tbody tr", { hasText: "to 3" }).first()
  .innerText({ timeout: 60000 }).catch(() => "");
expect("AUC of a tiny table by trapezoid: area 7", areaRow.split("\t")[1] === "7", areaRow.replace(/\s+/g, " "));
expect("AUC graph shades the area and draws the baseline",
  await page.evaluate(() => {
    const d = document.querySelector(".plot-card .plot");
    return !!d?.data?.some((t) => t.fill === "toself") && (d.layout?.shapes ?? []).length >= 1;
  }));

// Clustering leaf order on a 4 × 3 grouped matrix
await page.getByRole("button", { name: "New data table" }).click();
const clDlg = page.locator(".new-table-dialog");
await clDlg.locator('input[name="table-type"][value="grouped"]').check();
await clDlg.getByLabel("Table name").fill("Cluster 4x3");
const clShape = clDlg.locator(".field-num input");
await clShape.nth(0).fill("3");
await clShape.nth(1).fill("1");
await clShape.nth(2).fill("4");
await clDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");
const CM = [[1, 2, 3], [8, 9, 10], [1.5, 2.5, 2.5], [9, 8, 11]];
for (let r = 0; r < 4; r++) {
  await page.locator(`.data-table input[aria-label="Row ${r + 1} title"]`).fill("ABCD"[r]);
  for (let d = 0; d < 3; d++) {
    await page.locator(`.data-table input[aria-label="Dataset ${"ABC"[d]}, row ${r + 1}"]`).fill(String(CM[r][d]));
  }
}
for (let d = 0; d < 3; d++) await page.locator(`input[aria-label="Dataset ${d + 1} title"]`).fill("XYZ"[d]);
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Assay: Clustered heat map/ }).click();
await page.locator(".controls").getByLabel("Standardise", { exact: true }).selectOption("none");
expect("clustered heat map: row leaf order A, C, B, D (average linkage, scipy)",
  await page.waitForFunction(() => document.querySelector(".pane-results")?.textContent
    ?.includes("Row orderA, C, B, D"), null, { timeout: 60000 }).then(() => true, () => false));
expect("clustered heat map: column leaf order Z, X, Y",
  (await resultsText()).includes("Column order\tZ, X, Y"));
expect("clustered heat map draws both dendrograms beside the cells",
  await page.evaluate(() => {
    const d = document.querySelector(".plot-card .plot");
    return !!d?.layout?.xaxis2 && !!d?.layout?.xaxis3 && d.data.filter((t) => t.xaxis === "x2").length === 2
      && d.data.filter((t) => t.xaxis === "x3").length === 3;
  }));

// Volcano from an imported table: Benjamini-Hochberg, 19 up and 12 down
await assayTemplate("Fold-change table", "DE table");
expect("volcano from a table (BH-adjusted P < 0.05, |log2FC| ≥ 1): 19 up, 12 down",
  await page.waitForFunction(() => {
    const t = document.querySelector(".pane-results")?.textContent ?? "";
    return t.includes("Up19") && t.includes("Down12");
  }, null, { timeout: 60000 }).then(() => true, () => false));
expect("volcano labels the top ten hits",
  await page.evaluate(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .filter((a) => a.showarrow).length === 10));
await page.getByRole("button", { name: "Create a table of the hits" }).click();
expect("volcano: linked table of the 31 hits",
  await page.waitForFunction(() => document.querySelectorAll(".data-table tbody tr").length >= 31,
    null, { timeout: 30000 }).then(() => true, () => false));

// Tumour growth: long format in, mixed model, AUC per animal, time to endpoint
await assayTemplate("Tumour growth study", "Tumour study");
expect("tumour growth: mixed model of log volume with the interaction and GG ε",
  await page.waitForFunction(() => [...document.querySelectorAll(".results-table tr")]
    .some((tr) => tr.innerText.startsWith("Day × Group")), null, { timeout: 90000 })
    .then(() => true, () => false));
expect("tumour growth: the per-day t test warning cites its source",
  (await page.locator(".controls").innerText()).includes("Oberg et al. 2021"));
await page.locator(".assay-guide li", { hasText: "Area under each animal" }).getByRole("button").click();
expect("tumour growth: AUC per animal compared by one-way ANOVA, F(2, 21) = 26.56",
  await page.waitForFunction(() => document.querySelector(".pane-results")?.textContent
    ?.includes("F(2, 21) = 26.56"), null, { timeout: 60000 }).then(() => true, () => false));
await page.getByRole("button", { name: "Create the AUC column table" }).click();
expect("tumour growth: linked AUC column table opens with its one-way ANOVA",
  await page.waitForSelector(".result-card h3:has-text('Ordinary one-way ANOVA')", { timeout: 60000 })
    .then(() => true, () => false));
await navRow("Tumour study").click();
await page.locator(".mode-switch [role=tab]", { hasText: "Growth model" }).click();
await page.locator(".assay-guide li", { hasText: "Time to an endpoint" }).getByRole("button").click();
expect("tumour growth: time to 1000 mm³, log-rank χ²(2) = 29.42",
  await page.waitForFunction(() => document.querySelector(".pane-results")?.textContent
    ?.includes("χ²(2) = 29.42"), null, { timeout: 60000 }).then(() => true, () => false));
await page.getByRole("button", { name: "Create the survival table" }).click();
expect("tumour growth: linked survival table runs Kaplan-Meier",
  await appears(page.locator(".plot .scatterlayer .trace"), 60000));

// --- guidance: "Which test?" wizard, results chips, fit banner -----------
// The column example (3 groups of 6) answered "each vs a control" is an
// ordinary one-way ANOVA with Dunnett's comparisons, opened on the table.
await newExampleTable("column");
await page.waitForSelector(".stat-cols", { timeout: 30000 });
expect("results chips render on a results sheet (n per group, normality)",
  await page.waitForFunction(() => {
    const t = document.querySelector(".guide-chips")?.textContent ?? "";
    return t.includes("n = 6 per group") && t.includes("Normality");
  }, null, { timeout: 30000 }).then(() => true, () => false));
await page.locator(".guide-chip", { hasText: "n = 6 per group" }).click();
expect("a chip expands to advice with a Learn more link",
  await page.locator(".guide-chip-detail").getByRole("button", { name: /Learn more/ }).count() === 1);
const tabsBefore = await page.locator(".mode-switch [role=tab]").count();
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Help me choose/ }).click();
const wt = page.locator("dialog.which-test");
await wt.waitFor({ timeout: 10000 });
expect("wizard reads the table: three groups preselected",
  await wt.getByRole("radio", { name: "Three or more" }).isChecked());
await wt.getByText("Each vs a control", { exact: true }).click();
expect("wizard recommends an ordinary one-way ANOVA with Dunnett",
  (await wt.locator(".wt-test").innerText()) === "Ordinary one-way ANOVA"
  && (await wt.locator(".wt-result").innerText()).includes("Dunnett"),
  await wt.locator(".wt-test").innerText());
expect("wizard ran the data checks (n per group 6, 6, 6)",
  (await wt.locator(".wt-checks").innerText()).includes("6, 6, 6"));
await wt.getByRole("button", { name: /^Open on/ }).click();
await page.waitForSelector(".result-card h3:has-text('Ordinary one-way ANOVA')", { timeout: 30000 });
{
  const tabsAfter = await page.locator(".mode-switch [role=tab]").count();
  const mcTitle = await page.locator(".pane-results .result-card h4").first().innerText();
  expect("wizard created the analysis sheet, pre-configured (Dunnett)",
    tabsAfter === tabsBefore + 1 && /dunnett/i.test(mcTitle),
    `${tabsBefore} -> ${tabsAfter} tabs; ${mcTitle}`);
}
expect("why-your-number-may-differ note under the results",
  (await page.locator(".guide-differ summary").innerText()).includes("Why your number may differ"));

// A flat response defines no curve: the fit banner says so in plain words.
await page.getByRole("button", { name: "New data table" }).click();
const flatDlg = page.locator(".new-table-dialog");
await flatDlg.locator('input[name="table-type"][value="xy"]').check();
await flatDlg.getByLabel("Table name").fill("Flat response");
await flatDlg.getByLabel("Replicates per X").fill("1");
await flatDlg.getByLabel("Rows (X values)").fill("6");
await flatDlg.getByRole("button", { name: "Create table" }).click();
await page.waitForSelector(".grid-toolbar");
const FX = ["1e-9", "1e-8", "1e-7", "1e-6", "1e-5", "1e-4"];
const FY = [50.2, 49.8, 50.5, 49.6, 50.1, 50.3];
for (let r = 0; r < FX.length; r++) {
  await page.locator(`.data-table input[aria-label="X, row ${r + 1}"]`).fill(FX[r]);
  await page.locator(`.data-table input[aria-label="Dataset A, row ${r + 1}"]`).fill(String(FY[r]));
}
// No trend: a new table waits for a model; "Fit a curve" asks for the fit.
expect("a flat response waits for a model (Choose a model)",
  await appears(page.locator(".choose-model")));
await page.locator(".choose-model").getByRole("button", { name: "Fit a curve" }).click();
await page.keyboard.press("Escape");
expect("ambiguous fit banner with concrete fixes for a flat dataset",
  await page.waitForSelector("[data-banner='fit-ambiguous']", { timeout: 60000 })
    .then(async (b) => (await b.innerText()).includes("Constrain the plateau"), () => false));

// --- start screen, paste-and-suggest, guided tour (fresh browser state) ---
{
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p2 = await ctx2.newPage();
  p2.on("pageerror", (e) => errors.push(`pageerror (start): ${e.message}`));
  await p2.goto(baseUrl, { waitUntil: "domcontentloaded" });
  expect("first visit opens the start screen with eight table cards",
    await p2.locator(".start-screen").waitFor({ timeout: 60000 }).then(() => true, () => false)
    && await p2.locator(".start-card").count() === 8);
  await p2.getByRole("textbox", { name: "Paste data and get a table type" }).fill(
    "Conc\tRep 1\tRep 2\n0.001\t98\t101\n0.01\t95\t97\n0.1\t70\t66\n1\t30\t35\n10\t5\t8");
  expect("pasted dose series is suggested as an XY table, with a reason",
    (await p2.locator(".start-suggest").innerText()).includes("Suggested: XY table"));
  await p2.getByRole("button", { name: "Create XY table" }).click();
  await p2.locator(".data-table").waitFor({ timeout: 60000 });
  expect("the pasted XY table is created",
    await p2.getByRole("treeitem", { name: "Pasted data", exact: true }).count() === 1
    && await p2.locator('.data-table input[aria-label="X, row 3"]').inputValue() === "0.1");
  // live results first (the engine has booted), then the autosave debounce
  await p2.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  await p2.waitForTimeout(1500);
  // With a session saved, the next visit reopens it directly (default
  // start mode): no start screen, no restore banner.
  await p2.reload({ waitUntil: "domcontentloaded" });
  await p2.locator(".data-table").waitFor({ timeout: 60000 });
  expect("a later visit reopens the last session directly",
    await p2.getByRole("treeitem", { name: "Pasted data", exact: true }).count() === 1
    && await p2.locator(".start-screen").count() === 0
    && await p2.locator(".restore-banner").count() === 0);
  // "Show this screen when OpenDose opens" ticked: the start screen every
  // time, with the restore banner offering the last session.
  await p2.keyboard.press("Control+/");
  await p2.getByRole("complementary", { name: "Help" }).getByRole("button", { name: "Start screen" }).click();
  await p2.locator(".start-screen").waitFor({ timeout: 30000 });
  expect("the start-screen preference is unticked by default",
    !(await p2.getByLabel("Show this screen when OpenDose opens").isChecked()));
  await p2.getByLabel("Show this screen when OpenDose opens").check();
  await p2.reload({ waitUntil: "domcontentloaded" });
  await p2.locator(".start-screen").waitFor({ timeout: 60000 });
  expect("ticked, the start screen shows with the restore banner",
    await p2.locator(".restore-banner").waitFor({ timeout: 30000 }).then(() => true, () => false));
  await p2.getByLabel("Show this screen when OpenDose opens").uncheck();
  await p2.getByRole("button", { name: "Open the example project" }).click();
  expect("the tour starts with the example project",
    await p2.locator(".tour-card").waitFor({ timeout: 10000 }).then(() => true, () => false)
    && (await p2.locator(".tour-count").innerText()) === "Step 1 of 5");
  await p2.locator(".tour-next").click();
  expect("tour Next moves to step 2 (Analyze)",
    (await p2.locator(".tour-count").innerText()) === "Step 2 of 5");
  await p2.getByRole("button", { name: "Skip tour" }).click();
  expect("Skip closes the tour", await p2.locator(".tour-card").count() === 0);
  // The example session is autosaved; a reload reopens it directly, and
  // the tour does not come back.
  await p2.waitForTimeout(1500);
  await p2.reload({ waitUntil: "domcontentloaded" });
  await p2.locator(".data-table").waitFor({ timeout: 60000 });
  expect("the example session reopens directly",
    await p2.locator(".start-screen").count() === 0 && await p2.locator(".tour-card").count() === 0);
  await p2.keyboard.press("Control+/");
  await p2.getByRole("complementary", { name: "Help" }).getByRole("button", { name: "Start screen" }).click();
  await p2.locator(".start-screen").waitFor({ timeout: 30000 });
  await p2.getByRole("button", { name: "Open the example project" }).click();
  await p2.waitForTimeout(1500);
  expect("the tour does not come back after it was dismissed",
    await p2.locator(".tour-card").count() === 0 && await p2.locator(".data-table").count() === 1);
  await p2.keyboard.press("Control+/");
  const help = p2.getByRole("complementary", { name: "Help" });
  await help.getByRole("searchbox", { name: "Search help" }).fill("hazard");
  expect("Help (Ctrl+/) searches the explainers",
    (await help.locator(".help-topics li").first().innerText()).includes("Log-rank"));
  await help.getByRole("searchbox", { name: "Search help" }).fill("");
  await help.getByRole("button", { name: "Take the tour" }).click();
  expect("Help replays the tour",
    await p2.locator(".tour-card").waitFor({ timeout: 10000 }).then(() => true, () => false));
  await p2.keyboard.press("Escape");
  await ctx2.close();
}

// --- phone width (390 px): the fixes of the 2026-10-04 smoke pass ---
{
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await ctx3.newPage();
  p3.on("pageerror", (e) => errors.push(`pageerror (phone): ${e.message}`));
  await p3.goto(url, { waitUntil: "domcontentloaded" });
  await p3.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  const tops = await p3.evaluate(() => ["Undo", "Save project", "More actions"].map((n) =>
    Math.round(document.querySelector(`header [aria-label="${n}"]`)?.getBoundingClientRect().top ?? -99))
    .concat(Math.round(document.querySelector("header .load-btn").getBoundingClientRect().top)));
  expect("phone header: undo, save, open and More on one row",
    tops.every((t) => t >= 0 && Math.abs(t - tops[0]) <= 4), tops.join(", "));
  expect("phone header: secondary actions folded away",
    !(await p3.getByRole("button", { name: "Preferences" }).isVisible()));
  await p3.getByRole("button", { name: "More actions" }).click();
  await p3.getByRole("button", { name: "Preferences" }).click();
  const prefsBox = await p3.getByRole("dialog", { name: "Preferences" }).boundingBox();
  expect("phone: Preferences open from More and stay on screen",
    !!prefsBox && prefsBox.x >= 0 && prefsBox.x + prefsBox.width <= 390, JSON.stringify(prefsBox));
  await p3.keyboard.press("Escape");
  await p3.mouse.click(200, 700);
  // a table created from the navigator drawer closes the drawer
  await p3.getByRole("button", { name: "Show or hide the sheet navigator" }).click();
  await p3.getByRole("button", { name: "New data table" }).first().click();
  const pdlg = p3.locator(".new-table-dialog");
  await pdlg.locator('input[name="table-type"][value="grouped"]').check();
  await pdlg.getByLabel("Example data").check();
  await pdlg.getByRole("button", { name: "Create table" }).click();
  await p3.waitForTimeout(800);
  expect("phone: creating a table closes the navigator drawer", await p3.locator(".nav-scrim").count() === 0);
  // grouped legend: n per cell (3), as the chip says
  await p3.waitForSelector(".report-legend p", { timeout: 60000 });
  const gLegend = await p3.locator(".report-legend p").innerText();
  expect("grouped legend counts n per cell", gLegend.includes("n = 3 per group"), gLegend);
  // the Analyze menu stays on screen
  await p3.getByRole("button", { name: "Analyze", exact: true }).click();
  const menuBox = await p3.locator(".analyze-menu").boundingBox();
  expect("phone: the Analyze menu stays on screen",
    !!menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= 391, JSON.stringify(menuBox));
  await p3.keyboard.press("Escape");
  await ctx3.close();
}
{
  // A long checkbox label wraps beside its box (column statistics extras).
  await newExampleTable("column");
  await page.waitForSelector(".stat-cols", { timeout: 30000 });
  const align = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".check-row")].find((l) => l.textContent.includes("10th/90th"));
    if (!row) return null;
    const box = row.querySelector("input").getBoundingClientRect();
    const text = row.querySelector("span").getBoundingClientRect();
    return Math.abs(box.top - text.top);
  });
  expect("a checkbox stays on the first line of its wrapped label", align !== null && align < 12, String(align));
}

// --- reporting (src/report): effect size, results sentence, legend,
// estimation plot, journal checklists, history, P-value style ---
// Native engine on the column example (engine/opendose, seed 12345):
// unpaired t test Control vs. Treated A: Cohen's d = -3.231, 95% CI
// -4.996 to -1.403 (noncentral t); estimation (shared control, 5000 BCa
// resamples): Treated A - Control 5.2 [3.533, 6.917], Treated B -
// Control 11.53 [9.967, 13.13].
await newExampleTable("column");
await page.waitForSelector(".stat-cols", { timeout: 30000 });
await page.locator(".analysis-select").selectOption("ttest");
await page.waitForSelector(".effect-card", { timeout: 30000 });
const dRow = (await page.locator(".effect-card .es-preferred").first().innerText()).replace(/\s+/g, " ");
expect("effect size: Cohen's d -3.231, 95% CI -4.996 to -1.403 (native)",
  dRow.includes("Cohen's d (pooled SD)") && dRow.includes("-3.231") && dRow.includes("-4.996 to -1.403"), dRow);
const sentence = await page.locator(".report-sentence p").innerText();
expect("results sentence names the test, df and exact P", sentence.includes("unpaired t test, two-tailed")
  && sentence.includes("t = 5.596, df = 10") && sentence.includes("P = 0.0002"), sentence);
const legendText = await page.locator(".report-legend p").innerText();
expect("figure legend states n and the test", legendText.includes("n = 6 per group")
  && legendText.includes("unpaired t test"), legendText);
await page.getByRole("button", { name: "Journal checklists" }).click();
const ck = page.getByRole("dialog", { name: "Journal checklists" });
await ck.waitFor({ timeout: 15000 });
const met = await ck.locator(".checklist li.met").count();
const unmet = await ck.locator(".checklist li.unmet").count();
const unmetReason = await ck.locator(".checklist li.unmet .ck-reason").first().innerText();
expect("checklist shows ticked and unticked items with reasons", met >= 1 && unmet >= 1 && unmetReason.length > 10,
  `${met} met, ${unmet} not met; "${unmetReason}"`);
await ck.getByRole("tab", { name: /ARRIVE/ }).click();
expect("ARRIVE Essential 10 items listed", (await ck.locator(".checklist li").count()) === 5);
await ck.getByRole("button", { name: "Close" }).click();
await page.getByRole("button", { name: "History" }).click();
const hist = page.getByRole("dialog", { name: "History" });
await hist.waitFor({ timeout: 15000 });
const histText = await hist.innerText();
expect("history lists options with defaults and the table fingerprint",
  histText.includes("ttestKind") && histText.includes("default") && /fnv1a64:[0-9a-f]{16}/.test(histText));
await hist.getByRole("button", { name: "Close" }).click();
// estimation plot from the Analyze menu (Cumming: shared control)
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /Estimation plot/ }).click();
await page.waitForSelector(".estimation-results", { timeout: 60000 });
const estRows = (await page.locator(".estimation-results tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
expect("estimation: Treated A - Control 95% BCa CI 3.533 to 6.917 (native, seed 12345)",
  estRows.some((t) => t.includes("Treated A minus Control") && t.includes("3.533 to 6.917")), estRows.join(" | "));
expect("estimation: Treated B - Control 95% BCa CI 9.967 to 13.13 (native)",
  estRows.some((t) => t.includes("Treated B minus Control") && t.includes("9.967 to 13.13")));
await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
  .filter((t) => t.fill === "toself").length === 2, null, { timeout: 30000 });
expect("Cumming plot draws two bootstrap half-violins", true);
await page.getByLabel("Design").selectOption("two_group");
await page.waitForFunction(() => document.querySelector(".plot-card .plot")?.layout?.yaxis2?.overlaying === "y",
  null, { timeout: 30000 });
expect("Gardner-Altman plot: difference axis overlays the data axis", true);
const gaRows = (await page.locator(".estimation-results tbody tr").allInnerTexts()).join(" ");
expect("Gardner-Altman CI matches the native run", gaRows.includes("3.533 to 6.917"), gaRows.replace(/\s+/g, " "));
// P-value style: APA everywhere (tables and sentences), then back
await page.getByRole("button", { name: "Preferences" }).click();
await page.getByLabel("P-value style (tables, sentences, legends)").selectOption("apa");
await page.keyboard.press("Escape");
// The column analysis' tab is named after its test (here a t test).
await page.getByRole("tab", { name: "t test" }).click();
await page.waitForSelector(".report-sentence p", { timeout: 15000 });
const apa = await page.locator(".report-sentence p").innerText();
const pRow = await page.locator(".results-table tr", { hasText: "P value (two-tailed)" }).first().innerText();
expect("APA style: sentence and results table follow the preference",
  apa.includes("t(10) = 5.60, p < .001") && apa.includes("d = 3.23, 95% CI [1.40, 5.00]") && pRow.includes("< .001"),
  `${apa.slice(0, 120)} | ${pRow.replace(/\s+/g, " ")}`);
await page.getByRole("button", { name: "Preferences" }).click();
await page.getByLabel("P-value style (tables, sentences, legends)").selectOption("graphpad");
await page.keyboard.press("Escape");

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
  page.getByRole("menuitem", { name: /Export tables as \.pzfx/ }).click(),
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
// The format layer finishes the Plotly render after the results appear.
await page.waitForFunction(
  () => document.querySelectorAll(".plot-card .plot .scatterlayer .point").length === 2,
  { timeout: 30000 }).catch(() => {});
expect("Cox forest plot draws the hazard ratios",
  await page.locator(".plot-card .plot .scatterlayer .point").count() === 2);
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
// the curves are computed after the answer (many engine requests): wait
expect("power curves drawn", await pw.locator(".power-curve .plot").nth(1).waitFor({ timeout: 60000 })
  .then(async () => await pw.locator(".power-curve .plot").count() === 2, () => false));
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

// --- Site validation follow-ups: input, column results, accessibility ---
// R's sleep data pasted with its titles row into a new three-group column
// table: the Import dialog detects the titles, two groups remain, the
// paired t test prints t with its sign and direction (R: t = -4.0621,
// df = 9 for drug1 - drug2), and the column controls pass axe-core.
{
  await page.getByRole("button", { name: "New data table" }).click();
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForTimeout(500);
  const groupsBefore = await page.locator(".data-table th.group-head").count();
  const sleep = "drug1\tdrug2\n0.7\t1.9\n-1.6\t0.8\n-0.2\t1.1\n-1.2\t0.1\n-0.1\t-0.1\n"
    + "3.4\t4.4\n3.7\t5.5\n0.8\t1.6\n0.0\t4.6\n2.0\t3.4\n";
  await page.evaluate((text) => {
    const el = document.querySelector(".data-table tbody input[data-r='0']:not([aria-label$='title'])");
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, sleep);
  const imp = page.locator(".import-dialog");
  const impOpen = await appears(imp, 10000);
  const titlesBox = imp.getByLabel(/holds column titles/);
  expect("a pasted block with a titles row opens the Import dialog with the titles row detected",
    impOpen && await titlesBox.isChecked() && await imp.locator(".titles-detected").count() === 1);
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  const groupNames = await page.locator(".data-table th.group-head input.ds-name")
    .evaluateAll((els) => els.map((e) => e.value));
  expect("two pasted columns leave two groups named from the titles (the empty third is dropped)",
    groupsBefore === 3 && groupNames.join(",") === "drug1,drug2", `${groupsBefore} → ${groupNames.join(",")}`);
  // paired t test: the column analysis this table started with
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  await page.locator(".pane-controls").getByLabel("Test", { exact: true }).selectOption("paired");
  const tRowOk = await page.waitForFunction(() => [...document.querySelectorAll(".results-table tr")]
    .some((tr) => /^t, df/.test(tr.innerText) && tr.innerText.includes("t=-4.062")
      && tr.innerText.includes("drug1 − drug2")), null, { timeout: 30000 }).then(() => true, () => false);
  expect("paired t test prints t = -4.062 with its sign and the direction drug1 − drug2", tRowOk,
    await page.locator(".results-table tr", { hasText: "t, df" }).first().innerText().catch(() => ""));
  expect("the results tab is named after the test it shows",
    await page.getByRole("tab", { name: "t test" }).count() >= 1);
  // axe-core on the column controls, for each test of the analysis select
  const require = createRequire(import.meta.url);
  const axePath = require.resolve("axe-core/axe.min.js");
  const violations = [];
  for (const kind of ["column_statistics", "ttest", "anova", "correlation", "two_way_anova",
    "rm_anova", "median_test", "outliers"]) {
    await page.locator(".pane-controls select.analysis-select").selectOption(kind);
    await page.waitForTimeout(500);
    await page.addScriptTag({ path: axePath }).catch(() => {});
    const v = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const r = await axe.run(document.querySelector(".pane-controls"),
        { runOnly: { type: "rule", values: ["select-name", "label"] } });
      return r.violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.html.slice(0, 80)}`));
    });
    violations.push(...v.map((s) => `${kind}: ${s}`));
  }
  expect("axe-core: no select-name / label violations on the column controls", violations.length === 0,
    violations.join(" | "));
  // one-way ANOVA table with MS and the residual SD
  await page.locator(".pane-controls select.analysis-select").selectOption("anova");
  const anovaOk = await page.waitForFunction(() => {
    const t = document.querySelector(".anova-table")?.innerText ?? "";
    return t.includes("Residual (within columns)") && t.includes("MS")
      && [...document.querySelectorAll(".results-table tr")].some((tr) => /^Residual SD/.test(tr.innerText));
  }, null, { timeout: 30000 }).then(() => true, () => false);
  expect("one-way ANOVA prints its table (SS, DF, MS, F) and the residual SD", anovaOk);
  expect("switching the test renames the results sheet (One-way ANOVA of …) and its tab",
    await page.locator(".nav-name", { hasText: /^One-way ANOVA of / }).count() >= 1
    && await page.getByRole("tab", { name: "One-way ANOVA" }).count() >= 1);
}

// --- Contingency, survival, quantal (site validation follow-ups) ---
// Kaplan-Meier on R's aml (survival package): log-rank in both forms,
// Peto sum((O-E)^2/E) 3.135 (P 0.0766) and the variance form of R's
// survdiff 3.40 (P 0.0653); median of the maintained group 31 with the log
// CI of survfit from 18 (upper limit not reached).
{
  const AML = {
    Maintained: [[9, 1], [13, 1], [13, 0], [18, 1], [23, 1], [28, 0], [31, 1], [34, 1], [45, 0], [48, 1], [161, 0]],
    Nonmaintained: [[5, 1], [5, 1], [8, 1], [8, 1], [12, 1], [16, 0], [23, 1], [27, 1], [30, 1], [33, 1], [43, 1], [45, 1]],
  };
  await page.getByRole("button", { name: "New data table" }).click();
  const svDlg = page.locator(".new-table-dialog");
  await svDlg.locator('input[name="table-type"][value="survival"]').check();
  await svDlg.getByLabel("Table name").fill("AML");
  await svDlg.getByLabel("Groups", { exact: true }).fill("2");
  await svDlg.getByLabel("Rows (subjects)").fill("12");
  await svDlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  const groups = Object.keys(AML);
  for (let g = 0; g < groups.length; g++) {
    await page.locator(`.data-table input[aria-label="Group ${g + 1} title"]`).fill(groups[g]);
  }
  for (const name of groups) {
    for (let r = 0; r < AML[name].length; r++) {
      await page.locator(`.data-table input[aria-label="${name}, Time, row ${r + 1}"]`).fill(String(AML[name][r][0]));
      await page.locator(`.data-table input[aria-label="${name}, Event, row ${r + 1}"]`).fill(String(AML[name][r][1]));
    }
  }
  const kmCard = page.locator(".result-card", { has: page.locator("h3:has-text('Kaplan-Meier survival analysis')") }).first();
  await page.waitForFunction(() => [...document.querySelectorAll(".result-card")]
    .some((c) => /Nonmaintained[^]*Peto form/.test(c.innerText) && /\b161\b/.test(c.innerText)),
  null, { timeout: 60000 }).catch(() => {});
  const peto = await kmCard.locator("tr", { hasText: "Peto form" }).first().innerText().catch(() => "");
  const varForm = await kmCard.locator("tr", { hasText: "variance (Mantel-Haenszel) form" }).first().innerText().catch(() => "");
  expect("log-rank, Peto form (aml): chi-square 3.135, P 0.0766", /3\.135/.test(peto) && /0\.0766/.test(peto),
    peto.replace(/\s+/g, " "));
  expect("log-rank, variance form as R's survdiff (aml): chi-square 3.40, P 0.0653",
    /3\.39[0-9]|3\.40/.test(varForm) && /0\.065/.test(varForm), varForm.replace(/\s+/g, " "));
  const maint = await kmCard.locator("table").first().locator("tr", { hasText: /^Maintained/ }).first()
    .innerText().catch(() => "");
  expect("aml: median of the maintained group 31, log CI from 18 (upper not reached)",
    /\b31\b/.test(maint) && /18 to not reached/.test(maint), maint.replace(/\s+/g, " "));
  const oe = await kmCard.locator("table", { has: page.locator("th", { hasText: "Observed (O)" }) })
    .locator("tr", { hasText: "Nonmaintained" }).first().innerText().catch(() => "");
  expect("aml: observed and expected events per group (Nonmaintained O 11, E 7.311)",
    /7\.311/.test(oe), oe.replace(/\s+/g, " "));
  const km9 = await kmCard.locator(".km-table", { hasText: "Kaplan-Meier table: Maintained" })
    .locator("tbody tr").first().innerText().catch(() => "");
  expect("aml: Kaplan-Meier table, maintained at t = 9: 11 at risk, S 0.9091, SE 0.08668",
    /^9\s+11\s+1\s+0\s+0\.9091\s+0\.0866[78]/.test(km9), km9.replace(/\s+/g, " "));
  expect("Kaplan-Meier tables have their own Copy / CSV",
    await kmCard.getByRole("button", { name: /Copy Kaplan-Meier table Nonmaintained/ }).count() === 1);
}

// Fisher's exact test on an r x c table: R's fisher.test(Job), Agresti's
// job satisfaction by income (4 x 4), P = 0.7827, computed on request
// (beyond the quick budget); expected counts and residuals on a toggle.
{
  const JOB = [[1, 3, 10, 6], [2, 3, 10, 7], [1, 6, 14, 12], [0, 1, 9, 11]];
  await page.getByRole("button", { name: "New data table" }).click();
  const jbDlg = page.locator(".new-table-dialog");
  await jbDlg.locator('input[name="table-type"][value="contingency"]').check();
  await jbDlg.getByLabel("Table name").fill("Job satisfaction");
  await jbDlg.getByLabel("Outcomes (columns)").fill("4");
  await jbDlg.getByLabel("Groups (rows)").fill("4");
  await jbDlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      await page.locator(`.data-table input[aria-label="Outcome ${c + 1}, row ${r + 1}"]`).fill(String(JOB[r][c]));
    }
  }
  const askExact = page.getByRole("button", { name: /Compute the exact P/ });
  expect("r x c table beyond the quick budget offers the exact P", await appears(askExact, 60000));
  await askExact.click();
  const fisherRxc = await page.waitForFunction(() => [...document.querySelectorAll(".results-table tr")]
    .find((tr) => /Freeman-Halton/.test(tr.innerText))?.innerText ?? false, null, { timeout: 120000 })
    .then((h) => h.jsonValue(), () => "");
  expect("Fisher's exact test, 4 x 4 (R fisher.test(Job)): P = 0.7827", /0\.7827/.test(fisherRxc),
    String(fisherRxc).replace(/\s+/g, " "));
  await page.getByLabel("Show expected counts and residuals").check();
  const expCard = page.locator(".expected-residuals");
  expect("expected counts table appears", await appears(expCard.locator("h4", { hasText: "Expected counts" })));
  const e11 = await expCard.locator("table").first().locator("tbody tr").first().innerText().catch(() => "");
  expect("expected count of row 1, column 1: 20 x 4 / 96 = 0.8333", /0\.8333/.test(e11), e11.replace(/\s+/g, " "));
  expect("adjusted standardized residuals listed",
    await expCard.locator("h4", { hasText: "Adjusted standardized residuals" }).count() === 1);
}

// "From long table…": CMH strata from long records (stratum, row, column,
// count) become blocks of rows titled "Stratum: level".
{
  await page.getByRole("button", { name: "New data table" }).click();
  const lgDlg = page.locator(".new-table-dialog");
  await lgDlg.locator('input[name="table-type"][value="contingency"]').check();
  await lgDlg.getByLabel("Table name").fill("Long CMH");
  await lgDlg.getByLabel("Outcomes (columns)").fill("2");
  await lgDlg.getByLabel("Groups (rows)").fill("2");
  await lgDlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /Cochran-Mantel-Haenszel/ }).click();
  await page.getByRole("button", { name: "From long table…" }).click();
  const lt = page.getByRole("dialog", { name: "Stratified tables from a long table" });
  await lt.getByLabel("Long table text").fill([
    "centre,treatment,outcome,count",
    "A,drug,cured,10", "A,drug,not cured,5", "A,placebo,cured,4", "A,placebo,not cured,11",
    "B,drug,cured,8", "B,drug,not cured,2", "B,placebo,cured,3", "B,placebo,not cured,7",
  ].join("\n"));
  const ltSummary = await lt.locator(".import-summary").innerText().catch(() => "");
  expect("long table dialog: roles guessed, 2 strata of 2 x 2", ltSummary === "2 strata of 2 × 2 tables", ltSummary);
  await lt.getByRole("button", { name: "Fill the table" }).click();
  const cmhStrata = await page.locator(".controls .hint-block", { hasText: "strata of" }).first().innerText()
    .catch(() => "");
  expect("CMH controls read the filled strata: A, B", /2 strata of 2 × 2 tables: A, B/.test(cmhStrata), cmhStrata);
  const cmhRow = await page.waitForFunction(() => [...document.querySelectorAll(".results-table tr")]
    .find((tr) => /^Cochran-Mantel-Haenszel chi-square/.test(tr.innerText))?.innerText ?? false,
  null, { timeout: 60000 }).then((h) => h.jsonValue(), () => "");
  expect("CMH runs on the filled table", /df/.test(String(cmhRow)) || /, 1/.test(String(cmhRow)),
    String(cmhRow).replace(/\s+/g, " "));
  await navRow("Long CMH").click();
  await page.waitForSelector(".grid-toolbar");
  const titles = [];
  for (let r = 1; r <= 4; r++) titles.push(await page.locator(`.data-table input[aria-label="Row ${r} title"]`).inputValue());
  const cured = await page.locator('.data-table input[aria-label="Dataset 1 title"], .data-table input[aria-label="Outcome 1 title"]')
    .first().inputValue().catch(() => "");
  expect("filled contingency layout: rows 'A: drug' … 'B: placebo', columns cured / not cured",
    titles.join("|") === "A: drug|A: placebo|B: drug|B: placebo" && cured === "cured", `${titles.join("|")} / ${cured}`);
}

// "From long table…" on a quantal fit: drc's earthworms (dose, number,
// total; five containers per dose, dose 0 included) with an estimated
// upper asymptote, as drc's LL.3 binomial model (Ritz et al. 2015): d =
// 0.6049 (SE 0.0858, observed information), ED50 0.2924.
{
  await page.getByRole("button", { name: "New data table" }).click();
  const qDlg = page.locator(".new-table-dialog");
  await qDlg.locator('input[name="table-type"][value="xy"]').check();
  await qDlg.getByLabel("Table name").fill("Earthworms");
  await qDlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Quantal dose-response/ }).click();
  await page.getByRole("button", { name: "From long table…" }).click();
  const qlt = page.getByRole("dialog", { name: "Quantal dose-response data from a long table" });
  await qlt.getByLabel("Long table text").fill(readFileSync(join(here, "..", "..", "docs", "validation",
    "datasets", "drc-earthworms.csv"), "utf8"));
  const qSummary = await qlt.locator(".import-summary").innerText().catch(() => "");
  expect("quantal long table: one group, 35 dose rows", qSummary === "1 group, 35 rows (dose groups)", qSummary);
  await qlt.getByRole("button", { name: "Fill the table" }).click();
  const zeroNote = page.locator(".result-note", { hasText: "Dose 0 rows are used as the control: natural response estimated" });
  expect("dose 0 rows used as the control (natural response estimated), not refused", await appears(zeroNote, 60000));
  await page.getByLabel("Link", { exact: true }).selectOption("logit");
  await page.getByLabel("Dose transform", { exact: true }).selectOption("ln");
  await page.getByLabel("Upper asymptote", { exact: true }).selectOption("estimate");
  await page.getByLabel("Standard errors from", { exact: true }).selectOption("observed");
  const upRow = await page.waitForFunction(() => [...document.querySelectorAll("tr")]
    .find((tr) => /^Upper asymptote/.test(tr.innerText) && /0\.60/.test(tr.innerText))?.innerText ?? false,
  null, { timeout: 60000 }).then((h) => h.jsonValue(), () => "");
  expect("quantal upper asymptote (earthworms, drc LL.3): d = 0.6049, SE 0.0858", /0\.6049/.test(upRow)
    && /0\.0858/.test(upRow), String(upRow).replace(/\s+/g, " "));
  const ed50 = await page.locator("tr", { hasText: "LD50 / ED50" }).first().innerText().catch(() => "");
  expect("quantal ED50 with the plateau: 0.2924", /0\.2924/.test(ed50), ed50.replace(/\s+/g, " "));
}

// --- Power, qPCR, synergy (site validation follow-ups) ---
// R: power.anova.test(groups = 4, between.var = 1, within.var = 3,
// power = .80) -> n = 11.92613 per group (f = 0.5), 47.70 in total; the
// detectable d for two groups of 20 (power 0.8, two-sided) is 0.9091,
// and with SDs 1.2 and 1.4 the pooled SD is √1.7 = 1.304, so the
// detectable difference is 1.185.
await page.getByRole("button", { name: "Tools" }).click();
await page.getByRole("menuitem", { name: /Power and sample size/ }).click();
const pwv = page.locator("dialog.power-dialog");
await pwv.getByLabel("Test", { exact: true }).selectOption("anova_oneway");
await pwv.getByLabel("Groups (k)").fill("4");
await pwv.getByLabel("Cohen's f").fill("0.5");
const powerText = (re) => page.waitForFunction((src) => new RegExp(src)
  .test(document.querySelector("dialog.power-dialog .power-summary")?.innerText ?? ""), re.source, { timeout: 30000 })
  .then(() => true, () => false);
expect("power (R power.anova.test): unrounded n per group 11.93 and total N 47.7, apart",
  await powerText(/Unrounded n per group\s+11\.93\n.*Unrounded total N\s+47\.7/s)
  && await powerText(/n per group\s+12 × 4/),
  await pwv.locator(".power-summary").innerText().catch(() => ""));
await pwv.getByLabel("Test", { exact: true }).selectOption("t_two_sample");
await pwv.getByLabel("Solve for").selectOption("effect");
await pwv.getByLabel("SD from").selectOption("groups");
await pwv.getByLabel("SD, group 1").fill("1.2");
await pwv.getByLabel("SD, group 2").fill("1.4");
await pwv.getByLabel("Measurement unit").fill("mmol/L");
expect("power: detectable difference in raw units, 1.19 mmol/L (d = 0.909 × pooled SD 1.3)",
  await powerText(/Detectable difference\s+1\.19 mmol\/L \(d = 0\.909 × pooled SD 1\.3\)/),
  await pwv.locator(".power-summary").innerText().catch(() => ""));
await pwv.getByRole("button", { name: "Done" }).click();

// qPCR: Livak & Schmittgen (2001) Table 1 as a QuantStudio-style export
// (Sample Name, Target Name, CT) with one undetermined well added:
// kidney vs brain ΔCq 4.365 (the undetermined c-myc well is left out).
const livakCt = { Brain: { "c-myc": [30.72, 30.34, 30.58, 30.34, 30.50, 30.43], GAPDH: [23.70, 23.56, 23.47, 23.65, 23.69, 23.68] },
  Kidney: { "c-myc": [27.06, 27.03, 27.03, 27.10, 26.99, 26.94], GAPDH: [22.76, 22.61, 22.62, 22.60, 22.61, 22.76] } };
const qcsv = ["Sample Name,Target Name,CT"];
for (const [tissue, genes] of Object.entries(livakCt)) {
  for (const [gene, cts] of Object.entries(genes)) for (const c of cts) qcsv.push(`${tissue},${gene},${c}`);
}
qcsv.push("Kidney,c-myc,Undetermined");
await page.getByRole("button", { name: "New data table" }).click();
const qdlg = page.locator(".new-table-dialog");
await qdlg.getByRole("radio", { name: "Start from an assay" }).check();
await qdlg.getByRole("radio", { name: /^qPCR/ }).check();
await qdlg.getByText("An empty layout").click();
await qdlg.getByRole("button", { name: "Start assay" }).click();
const qwz = page.locator("dialog.assay-wizard");
await qwz.waitFor({ timeout: 30000 });
await qwz.getByLabel("Paste Cq export").fill(qcsv.join("\n"));
await qwz.getByRole("button", { name: "Read pasted export" }).click();
expect("qPCR: Sample Name / Target Name / CT export read, the undetermined well kept as missing",
  (await qwz.innerText()).includes("Read 25 wells. 1 well without a Cq (undetermined) is kept as missing."),
  await qwz.locator(".assay-setup [role=status]").first().innerText().catch(() => ""));
await qwz.locator("label", { hasText: /^GAPDH$/ }).locator("input").check().catch(() => {});
for (let i = 0; i < 6; i++) {
  const next = qwz.getByRole("button", { name: "Next", exact: true });
  if (!(await next.count()) || await next.isDisabled()) break;
  await next.click();
  await page.waitForTimeout(250);
}
await qwz.locator(".modal-actions .btn-primary").click();
await qwz.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
await page.waitForSelector(".qpcr-results .qpcr-target", { timeout: 60000 }).catch(() => {});
const qkid = (await page.locator(".qpcr-target tr", { hasText: /^Kidney/ }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
expect("qPCR from the variant headers: kidney ΔCq 4.365", qkid.includes("4.365"), qkid);

// Synergy: the landscape and the matrix table show an expected matrix;
// the monotherapy median-effect fit of Ispinesib slopes the wrong way
// (r = −0.551), so the combination indices are flagged next to their table.
await assayTemplate("Drug combination matrix", "Combination views");
await page.locator(".results-table tr", { hasText: "Bliss (bliss independence)" }).first()
  .waitFor({ timeout: 90000 }).catch(() => {});
await page.waitForFunction(() => document.querySelectorAll(".plot .heatmaplayer .hm").length === 4,
  null, { timeout: 30000 }).catch(() => {});
const synGs = await graphSettings();
await synGs.getByLabel("Show", { exact: true }).selectOption("bliss_expected");
await closeGraphSettings();
expect("synergy landscape: the Show select switches to the Bliss expected response (one map, % inhibition scale)",
  await page.waitForFunction(() => {
    const l = document.querySelector(".plot-card .plot")?.layout;
    return document.querySelectorAll(".plot .heatmaplayer .hm").length === 1
      && (l?.annotations ?? []).some((a) => /Bliss expected response/.test(a.text ?? ""));
  }, null, { timeout: 15000 }).then(() => true, () => false));
await page.getByLabel("Show matrices").selectOption("loewe_expected");
const synRes = await resultsText();
const synMats = await page.locator(".result-card", { hasText: "Synergy at each dose pair" }).first()
  .locator("h4").allTextContents();
expect("synergy results: the Show select prints the Loewe expected matrix alone",
  synMats.length === 1 && synMats[0] === "Loewe expected response", JSON.stringify(synMats));
expect("synergy results: a warning chip flags the poor monotherapy fit next to the CI table",
  await page.locator(".result-card", { hasText: "Chou-Talalay combination index" }).locator(".qc-chip.qc-warn")
    .filter({ hasText: "Monotherapy fit poor" }).count() === 1
  && synRes.includes("slopes the wrong way (r = -0.551"));

// --- XY analyses (site validation follow-ups) ---
// R cars (speed -> dist, 50 rows): lm gives slope 3.932409, intercept
// -17.579095, F = 89.57 on 1 and 48 df, R² 0.6511, Sy.x 15.38. A new XY
// table of non-dose data waits for "Choose a model" instead of fitting a
// 4PL; compare fits reports the F test and AICc.
const xyNew = async (name) => {
  await page.getByRole("button", { name: "New data table" }).click();
  const d = page.locator(".new-table-dialog");
  await d.locator('input[name="table-type"][value="xy"]').check();
  await d.getByLabel("Table name").fill(name);
  await d.getByLabel("Replicates per X").fill("1");
  await d.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
};
const xyPaste = async (text) => {
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const dlg = page.locator(".import-dialog");
  await dlg.getByLabel("Pasted text").check();
  await dlg.getByLabel("Text to import").fill(text);
  await dlg.getByLabel(/holds column titles/).check();
  await dlg.getByRole("button", { name: "Import", exact: true }).click();
};
const resultsHas = (re, timeout = 60000) => page.waitForFunction((src) =>
  new RegExp(src).test(document.querySelector(".pane-results")?.innerText ?? ""),
re.source, { timeout }).then(() => true, () => false);
const CARS = readFileSync(join(here, "..", "..", "docs", "validation", "datasets", "r-cars.csv"), "utf8");
await xyNew("Cars");
await xyPaste(CARS);
expect("a new XY table of non-dose data asks to choose a model instead of fitting",
  await appears(page.locator(".choose-model")) && (await page.locator(".choose-model").innerText())
    .includes("Choose a model") && await page.locator(".pane-results .results-table").count() === 0);
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Linear regression/ }).click();
expect("linear regression (R cars): regression ANOVA F = 89.57 on 1 and 48 df",
  await resultsHas(/F \(1, 48\) = 89\.5[67]/)
  && /Regression\s+21(19|18)\d/.test(await page.locator(".anova-table").innerText()),
  (await page.locator(".anova-table").innerText().catch(() => "")).replace(/\s+/g, " "));
const carsText = await page.locator(".pane-results").innerText();
expect("linear regression (R cars): slope 3.932, intercept -17.58, R² 0.6511, Sy.x 15.38",
  /Slope\s+3\.932/.test(carsText) && /Y intercept\s+-17\.58/.test(carsText)
  && /R squared\s+0\.6511/.test(carsText) && /Sy\.x\s+15\.38/.test(carsText),
  carsText.split("\n").slice(0, 12).join(" | "));
expect("linear regression graph draws the points and the line",
  await page.locator(".plot .scatterlayer .trace").count() === 2);
await page.getByLabel(/Force the line through the origin/).check();
expect("through the origin: uncentred R² and the ANOVA about Y = 0",
  await resultsHas(/R squared \(about Y = 0\)/) && await resultsHas(/Total \(uncorrected\)/));

// straight-line data: "Choose a model" → Linear regression switches the sheet
await xyNew("Straight line");
await xyPaste("X,Y\n1,2.1\n2,3.9\n3,6.2\n4,7.8\n5,10.3\n6,11.9");
expect("straight-line data shows Choose a model, not a curve fit",
  await appears(page.locator(".choose-model")));
await page.locator(".choose-model").getByRole("button", { name: "Linear regression" }).click();
expect("Choose a model → Linear regression: the results sheet becomes a linear regression (slope 1.994)",
  await resultsHas(/Slope\s+1\.994/) && await navRow("Linear regression of Straight line").count() === 1
  && (await page.locator(".mode-switch [role=tab]").allInnerTexts()).join("|") === "Linear regression");

// compare fits: one curve for both data sets vs a separate curve for each
const cfX = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
const cfA = [99.6, 97.6, 92.1, 80.4, 50.3, 23.9, 8.9, 3.2, 1.2];
const cfB = [100.8, 99.1, 97.3, 91.0, 79.2, 52.4, 24.8, 9.6, 2.9];
await xyNew("Two curves");
await xyPaste(["Dose,Control,Treated", ...cfX.map((x, i) => `${x},${cfA[i]},${cfB[i]}`)].join("\n"));
await page.getByRole("button", { name: "Analyze", exact: true }).click();
await page.getByRole("menuitem", { name: /^Compare fits/ }).click();
expect("compare fits (3PL vs 4PL on each data set): an F test and a P value per data set",
  await resultsHas(/F \(1, 5\) = [\d.]+[\s\S]*P value[\s\S]*F \(1, 5\) = /)
  && await page.locator(".compare-table").count() === 2);
await page.getByLabel(/One curve for all data sets vs/).check();
expect("compare fits (one curve vs separate curves): F (3, 12), P, AICc and the preferred model",
  await resultsHas(/F \(3, 12\) = [\d.]+/) && await resultsHas(/P value\s+(< ?)?[\d.e-]+/)
  && await resultsHas(/separate curve for each data set\) is preferred/)
  && await resultsHas(/Probability correct/));
expect("compare fits graph draws the separate curves and the shared curve",
  await page.locator(".plot .scatterlayer .trace").count() === 5);

// --- responsiveness: the engine runs in a worker. A one-way ANOVA on 9
// groups × 2,001 values (the size of NIST SmLs09) leaves the grid
// editable while it computes, the results show "Computing… s" with
// Cancel, Cancel stops it (the worker is replaced) and the engine goes
// on working afterwards.
{
  await page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="column"]').check();
  await dlg.getByLabel("Table name").fill("Nine groups");
  await dlg.getByLabel("Groups (columns)", { exact: true }).fill("9");
  await dlg.getByLabel("Rows (values per group)", { exact: true }).fill("2001");
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const csv = [Array.from({ length: 9 }, (_, g) => `G${g + 1}`).join(","),
    ...Array.from({ length: 2001 }, () => Array.from({ length: 9 },
      (_, g) => (1000000.4 + g * 0.01 + 0.1 * rnd()).toFixed(4)).join(","))].join("\n");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp9 = page.locator(".import-dialog");
  await imp9.getByLabel("Pasted text").check();
  await imp9.getByLabel("Text to import").fill(csv);
  const titles = imp9.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp9.getByRole("tab", { name: "Placement" }).click();
  await imp9.getByLabel(/In place of the table/).check();
  await imp9.getByRole("button", { name: "Import", exact: true }).click();
  await imp9.waitFor({ state: "detached", timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll(".data-table tbody tr").length >= 2001,
    null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // Typing 9 characters costs what it costs the grid to re-render (a
  // 18,000-cell grid is not free, least of all in a dev build); the
  // engine must add nothing to it. Baseline first (column statistics,
  // quick), then the same typing while the ANOVA computes.
  const typeInto = async (label, text) => {
    const cell = page.locator(`.data-table input[aria-label="${label}"]`);
    await cell.click({ timeout: 120000 });
    const t0 = Date.now();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(text);
    const ms = Date.now() - t0;
    return { ms, ok: (await cell.inputValue()) === text };
  };
  const base = await typeInto("G2, row 1", "1000000.6");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3000);
  await page.locator(".analysis-select").first().selectOption("anova");
  await page.waitForTimeout(300);
  const during = await typeInto("G1, row 1", "1000000.5");
  expect("the grid takes typing while the ANOVA computes, as fast as without it",
    during.ok && during.ms <= 1.5 * base.ms + 1000,
    `9 keys: ${during.ms} ms during the ANOVA, ${base.ms} ms without`);
  await page.keyboard.press("Enter");
  expect("the ANOVA result arrives (live)", await page.waitForFunction(() =>
    /Source of variation|F \(/.test(document.querySelector(".pane-results")?.textContent ?? "")
    && !!document.querySelector('.pane-results[data-live="true"]'), null, { timeout: 180000 })
    .then(() => true, () => false));
}

// --- a long job: busy line, typing meanwhile, Cancel. Twelve straight
// lines over a wide range fitted with the automatic sigmoid: every
// multi-start runs to its time budget, several seconds in all.
{
  await page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="xy"]').check();
  await dlg.getByLabel("Table name").fill("Twelve lines");
  await dlg.getByLabel("Y datasets", { exact: true }).fill("12");
  await dlg.getByLabel("Replicates per X", { exact: true }).fill("1");
  await dlg.getByLabel("Rows (X values)", { exact: true }).fill("10");
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  const xs = Array.from({ length: 10 }, (_, i) => 2 ** i);
  const csv = [["X", ...Array.from({ length: 12 }, (_, k) => `L${k + 1}`)].join(","),
    ...xs.map((x, i) => [x, ...Array.from({ length: 12 }, (_, k) => (3 + k + 0.5 * x + (i % 3) * 0.01).toFixed(3))].join(","))]
    .join("\n");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const impL = page.locator(".import-dialog");
  await impL.getByLabel("Pasted text").check();
  await impL.getByLabel("Text to import").fill(csv);
  const titlesL = impL.getByLabel(/holds column titles/);
  if (!(await titlesL.isChecked())) await titlesL.check();
  await impL.getByRole("tab", { name: "Placement" }).click();
  await impL.getByLabel(/In place of the table/).check();
  await impL.getByRole("button", { name: "Import", exact: true }).click();
  await impL.waitFor({ state: "detached", timeout: 60000 });
  const busy = page.locator(".pane-results .analysis-busy");
  const shown = await busy.waitFor({ timeout: 20000 }).then(() => true, () => false);
  const line = shown ? await busy.innerText() : "";
  expect("a long fit shows the busy line: Computing… with seconds and Cancel",
    shown && /Computing…/.test(line) && /\d+\.\d s/.test(line)
    && await busy.getByRole("button", { name: "Cancel" }).count() === 1, line.replace(/\s+/g, " "));
  // the grid takes typing meanwhile (a newer input replaces the job)
  const cell = page.locator('.data-table input[aria-label="L1, row 1"]');
  await cell.click();
  const k0 = Date.now();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("3.25");
  const typedMs = Date.now() - k0;
  await page.keyboard.press("Enter");
  expect("typing during the fit is immediate (4 keys in < 1.5 s)",
    typedMs < 1500 && await cell.inputValue() === "3.25", `${typedMs} ms`);
  if (shown) {
    // the newer input's job, once it runs (typing retired the old worker)
    await page.waitForFunction(() => /Computing…/.test(
      document.querySelector(".pane-results .analysis-busy")?.textContent ?? ""), null, { timeout: 60000 });
    const restarts = await page.evaluate(() => globalThis.__opendoseEngine.stats.restarts);
    await busy.getByRole("button", { name: "Cancel" }).click({ timeout: 20000 });
    const cancelled = await page.locator(".pane-results .analysis-busy.cancelled")
      .waitFor({ timeout: 5000 }).then(() => true, () => false);
    expect("Cancel stops the computation and says the results are out of date", cancelled
      && /cancelled/i.test(await page.locator(".pane-results .analysis-busy").innerText()));
    // Python cannot be interrupted: the cancelled fit's worker is retired
    // as soon as a warm spare is up (or the fit ends by itself first)
    const freed = await page.waitForFunction(() => !globalThis.__opendoseEngine.draining, null,
      { timeout: 120000 }).then(() => true, () => false);
    const after = await page.evaluate(() => globalThis.__opendoseEngine.stats.restarts);
    expect("after Cancel the engine is free again (the cancelled job's worker retired)",
      freed && after >= restarts, `restarts ${restarts} → ${after}`);
  }
  // the engine computes again after the cancel: a straight-line fit
  await navRow("Nine groups").click();
  await page.locator(".analysis-select").first().selectOption("column_statistics");
  const back = await page.waitForSelector('.pane-results[data-live="true"] .stat-cols', { timeout: 120000 })
    .then(() => true, () => false);
  expect("after a cancel the engine computes again (column statistics)", back);
}

// axe-core (WCAG 2 A / AA) on parts of a page, for the blocks below.
const axeOn = async (pg, sel) => {
  await pg.addScriptTag({ path: createRequire(join(here, "e2e-check.mjs")).resolve("axe-core/axe.min.js") })
    .catch(() => {});
  return pg.evaluate(async (s) => {
    const el = document.querySelector(s);
    if (!el) return [`${s}: missing`];
    // eslint-disable-next-line no-undef
    const r = await axe.run(el, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return r.violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.html.slice(0, 70)}`));
  }, sel);
};
// --- exclusions with reasons (exclusion-log): one mouse of eight excluded
// for tumour ulceration; the results' Exclusions block, the legend and the
// methods state n enrolled / analysed with the reason; the results with
// the excluded value included come as a second block with another P.
{
  await page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="column"]').check();
  await dlg.getByLabel("Table name").fill("Tumour volume");
  await dlg.getByLabel("Groups (columns)", { exact: true }).fill("2");
  await dlg.getByLabel("Rows (values per group)", { exact: true }).fill("8");
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  const control = ["12", "14", "11", "13", "15", "12", "14", "13"];
  const treated = ["20", "22", "41", "21", "23", "19", "22", "24"];
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp = page.locator(".import-dialog");
  await imp.getByLabel("Pasted text").check();
  await imp.getByLabel("Text to import").fill(["Control,Treated",
    ...control.map((c, i) => `${c},${treated[i]}`)].join("\n"));
  const titles = imp.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp.getByRole("tab", { name: "Placement" }).click();
  await imp.getByLabel(/In place of the table/).check();
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 60000 });
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  await page.waitForFunction(() => /t test/i.test(document.querySelector(".pane-results")?.textContent ?? "")
    && !!document.querySelector('.pane-results[data-live="true"]'), null, { timeout: 120000 });
  const pOf = (s) => (s.match(/P\s*[=<]\s*([\d.e-]+)/) ?? [])[1] ?? "";
  const sentenceBefore = await page.locator(".report-sentence p").innerText();
  // Ctrl+E on Treated, row 3 (the 41): the reason prompt, never blocking
  const cell = page.locator('.data-table input[aria-label="Treated, row 3"]');
  await cell.click();
  await page.keyboard.press("Control+e");
  const prompt = page.getByRole("region", { name: "Exclusion reason" });
  expect("Ctrl+E asks for a reason (usual reasons offered, skippable)",
    await appears(prompt) && await prompt.getByRole("button", { name: "animal welfare endpoint" }).count() === 1
    && await prompt.getByRole("button", { name: "Skip" }).count() === 1
    && /Excluded 1 value \(Treated, row 3\)/.test(await prompt.innerText()));
  const axPrompt = await axeOn(page, ".exclusion-reason");
  expect("axe-core: the reason prompt passes", axPrompt.length === 0, axPrompt.join(" | "));
  await prompt.getByLabel("Other reason for excluding").fill("tumour ulceration");
  await prompt.getByRole("button", { name: "Save reason" }).click();
  expect("the reason is kept with the value (cell tooltip) and the prompt closes",
    /Excluded from analyses and graphs: tumour ulceration/.test(await cell.getAttribute("title") ?? "")
    && await prompt.count() === 0);
  await page.waitForFunction((before) => {
    const s = document.querySelector(".report-sentence p")?.textContent ?? "";
    return s && s !== before && !!document.querySelector('.pane-results[data-live="true"]');
  }, sentenceBefore, { timeout: 60000 });
  const card = page.getByRole("region", { name: "Exclusions" });
  const row = await card.locator(".exc-groups tbody tr", { hasText: "Treated" }).innerText();
  expect("Exclusions block: Treated 8 entered, 1 excluded, 7 analysed, tumour ulceration",
    /Treated\s+8\s+1\s+7\s+tumour ulceration/.test(row), row.replace(/\s+/g, " "));
  const sentence = "Treated, n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration); no exclusions in Control";
  expect("Exclusions block states the methods / legend sentence",
    (await card.locator(".exc-sentence").innerText()).trim() === `${sentence}.`);
  const legend = await page.locator(".report-legend p").innerText();
  expect("the figure legend states n enrolled, analysed and the reason",
    legend.includes("n = 8 enrolled, 7 analysed (1 excluded: tumour ulceration)"), legend);
  const methods = await page.locator(".stats-methods p").innerText();
  expect("the methods paragraph states the exclusions with n enrolled and analysed",
    methods.includes(`Exclusions: ${sentence}.`), methods);
  // one click: the results with the excluded value included, as a second block
  const pStored = pOf(await page.locator(".report-sentence p").innerText());
  await card.getByRole("button", { name: "Show results with excluded values included" }).click();
  const both = card.getByRole("group", { name: "Results with excluded values included" });
  await both.waitFor({ timeout: 60000 });
  const asIs = pOf(await both.locator(".exc-as-is").innerText());
  const all = pOf(await both.locator(".exc-all").innerText());
  expect("the results with the excluded value included give another P; the stored P is unchanged",
    !!asIs && !!all && asIs !== all && asIs === pStored
    && pOf(await page.locator(".report-sentence p").innerText()) === pStored,
    `as analysed P = ${asIs}, included P = ${all}, stored P = ${pStored}`);
  const axCard = await axeOn(page, ".exclusions-card");
  expect("axe-core: the Exclusions block with the comparison passes", axCard.length === 0, axCard.join(" | "));
  expect("the second block lists the numbers that change (n 7 → 8)",
    /n \(Treated\): 7 → 8/.test(await both.locator(".exc-changes").innerText()), await both.locator(".exc-changes").innerText());
  // reasons can be edited from the results; the tidy CSV of the bundle
  // carries them (share/tidy.ts, unit-tested)
  await card.getByLabel("Reason for excluding Treated, row 3").fill("tumour ulceration (day 12)");
  await card.getByLabel("Reason for excluding Treated, row 3").press("Enter");
  expect("a reason edited in the Exclusions block reaches the methods",
    await page.waitForFunction(() => (document.querySelector(".stats-methods p")?.textContent ?? "")
      .includes("(1 excluded: tumour ulceration (day 12))"), null, { timeout: 10000 }).then(() => true, () => false));
}

// --- reopening a project saved by another version (stable-results-
// versions): every saved result is recomputed and compared at display
// precision; the strip says all reproduced, or lists what changed with
// both values and the engine change log as the why. A fresh page with the
// example project (deterministic results).
{
  const p4 = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  p4.on("pageerror", (e) => errors.push(`pageerror (reproduce): ${e.message}`));
  await p4.goto(url, { waitUntil: "domcontentloaded" });
  await p4.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  // save once every result is live (each carries its input fingerprint)
  let saved = null;
  for (let i = 0; i < 20 && !saved; i++) {
    const [dl] = await Promise.all([p4.waitForEvent("download", { timeout: 30000 }),
      p4.getByRole("button", { name: "Save project" }).click()]);
    const f = join(tmp, `reproduce-${i}.json`);
    await dl.saveAs(f);
    const j = JSON.parse(readFileSync(f, "utf8"));
    if (j.sheets.filter((s) => s.kind === "results").every((s) => s.cachedKey)) saved = j;
    else await p4.waitForTimeout(1500);
  }
  expect("a saved project records the software that saved it",
    !!saved && typeof saved.savedWith?.app === "string" && !!saved.savedWith.engine,
    JSON.stringify(saved?.savedWith ?? null));
  const nResults = saved.sheets.filter((s) => s.kind === "results").length;
  const older = { ...saved, savedWith: { ...saved.savedWith, app: "0.2.0" } };
  const OLD = join(tmp, "saved-with-0.2.0.json");
  writeFileSync(OLD, JSON.stringify(older));
  await p4.setInputFiles('.load-btn input[type="file"]', OLD);
  const strip = p4.getByRole("region", { name: "Reproducing saved results" });
  await strip.waitFor({ timeout: 30000 });
  const done = await p4.waitForFunction(() => /reproduced with|changed with/.test(
    document.querySelector(".reproduce-strip .rs-headline")?.textContent ?? ""), null, { timeout: 180000 })
    .then(() => true, () => false);
  const head = done ? await strip.locator(".rs-headline").innerText() : await strip.innerText();
  const m = head.match(/^All (\d+) results reproduced with OpenDose ([\w.-]+) \(saved with 0\.2\.0\)\.$/);
  const N = m ? Number(m[1]) : 0;
  expect(`reopening a file saved with 0.2.0 recomputes the ${nResults} analyses and says all reproduced`,
    !!m && N > 20, head);
  await strip.getByRole("button", { name: "History" }).click();
  const hist = p4.getByRole("dialog", { name: "History" });
  expect("the History panel records the comparison",
    await appears(hist.locator(".history-reproduction"))
    && (await hist.locator(".history-reproduction").first().innerText()).includes(`All ${N} results reproduced`));
  await hist.getByRole("button", { name: "Close" }).click();
  // one stored number off: the strip lists it with both values
  const ct = older.sheets.find((s) => s.kind === "results" && s.cached?.analysis === "contingency");
  const truth = ct.cached.chi_square.p;
  ct.cached.chi_square.p = 0.0234;
  const OLD2 = join(tmp, "saved-with-0.2.0-patched.json");
  writeFileSync(OLD2, JSON.stringify(older));
  await p4.setInputFiles('.load-btn input[type="file"]', OLD2);
  const changed = await p4.waitForFunction(() => /changed with/.test(
    document.querySelector(".reproduce-strip .rs-headline")?.textContent ?? ""), null, { timeout: 180000 })
    .then(() => true, () => false);
  const head2 = changed ? await strip.locator(".rs-headline").innerText() : "";
  const list = changed ? await strip.getByRole("list", { name: "Changed results" }).innerText() : "";
  expect("a changed stored number: '1 of N results changed' with that number listed, both values",
    head2 === `1 of ${N} results changed with OpenDose ${m?.[2]} (saved with 0.2.0).`
    && list.includes(`chi-square test P (${ct.name}) 0.0234 → ${truth.toPrecision(4)}`)
    && /Why:/.test(await strip.innerText()), `${head2} | ${list}`);
  const axStrip = await axeOn(p4, ".reproduce-strip");
  expect("axe-core: the reproduction strip passes", axStrip.length === 0, axStrip.join(" | "));
  await strip.getByRole("button", { name: "Dismiss" }).click();
  expect("the strip is dismissable", await strip.count() === 0);
  await p4.close();
}

// --- Survival entry and extras (needs survival-data-entry,
// median-survival-explained, pairwise-logrank). Alive mice per day for
// two groups become one row per mouse with a "read as" preview; the drug
// group never falls below 50% ("not reached: 80% survived to day 30");
// RMST up to day 30: Drug minus Vehicle 12.4 (95% CI 3.927 to 20.87).
// Four dose groups: six pairwise log-rank tests adjusted by Holm-Šídák
// (Vehicle vs High P 0.001724 -> 1 - (1 - P)^6 = 0.0103) and the
// log-rank test for trend chi-square 13.80 (P 0.0002035), as the
// engine's survival_pairwise computes on the same subjects.
{
  const newSurvival = async (name, groups) => {
    await page.getByRole("button", { name: "New data table" }).first().click();
    const dlg = page.locator(".new-table-dialog");
    await dlg.locator('input[name="table-type"][value="survival"]').check();
    await dlg.getByLabel("Table name").fill(name);
    await dlg.getByLabel("Groups", { exact: true }).fill(String(groups));
    await dlg.getByLabel("Rows (subjects)").fill("3");
    await dlg.getByRole("button", { name: "Create table" }).click();
    await page.waitForSelector(".grid-toolbar");
  };
  const fillFromCounts = async (text) => {
    await page.getByRole("button", { name: "Survival data from…" }).click();
    const dlg = page.getByRole("dialog", { name: "Survival data from counts or dates" });
    await dlg.getByLabel("Pasted table").fill(text);
    return dlg;
  };
  const resultsText = () => page.locator(".pane-results").innerText().catch(() => "");
  const waitResults = (re, timeout = 90000) => page.waitForFunction((src) =>
    new RegExp(src).test(document.querySelector('.pane-results[data-live="true"]')?.innerText ?? ""),
  re.source, { timeout }).then(() => true, () => false);

  await newSurvival("Mouse survival", 2);
  const dlg = await fillFromCounts("Day\tVehicle\tDrug\n0\t5\t5\n4\t4\t5\n12\t2\t5\n20\t1\t4\n30\t1\t4");
  const preview = dlg.getByLabel("Preview: how each subject is read");
  const row12 = await preview.locator("tbody tr", { hasText: "Vehicle" }).nth(1).innerText().catch(() => "");
  expect("survival from alive per day: the preview reads a fall from 4 to 2 as deaths on day 12",
    /Vehicle\s+12\s+1\s+death on day 12/.test(row12), row12.replace(/\s+/g, " "));
  const lastDrug = await preview.locator("tbody tr", { hasText: "Drug" }).last().innerText().catch(() => "");
  expect("survival from alive per day: mice alive at the last day are censored there",
    /censored on day 30/.test(lastDrug), lastDrug.replace(/\s+/g, " "));
  expect("survival from alive per day: summary 2 groups, 10 subjects: 5 deaths, 5 censored",
    /2 groups, 10 subjects: 5 deaths, 5 censored/.test(await dlg.innerText()));
  await dlg.getByRole("button", { name: "Fill the table" }).click();
  await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  const groupsLine = await page.getByRole("list", { name: "How each group is read" }).innerText().catch(() => "");
  expect("the table holds one row per mouse: Vehicle 4 events, 1 censored; Drug 1 event, 4 censored",
    /Vehicle: 4 events, 1 censored/.test(groupsLine) && /Drug: 1 event, 4 censored/.test(groupsLine)
    && await page.locator('.data-table input[aria-label="Vehicle, Time, row 5"]').inputValue() === "30"
    && await page.locator('.data-table input[aria-label="Drug, Event, row 1"]').inputValue() === "1",
    groupsLine.replace(/\s+/g, " "));
  await page.getByLabel("Show how each row is read").check();
  const readList = await page.getByLabel("Read as: every row").innerText().catch(() => "");
  expect("Read as list: row 2 of Vehicle is an event on day 12", /row 2\s+event on day 12/.test(readList),
    readList.replace(/\s+/g, " ").slice(0, 80));

  expect("median not reached is explained: 80% survived to day 30",
    await waitResults(/not reached: 80% survived to day 30 \(last follow-up\)/));
  const txt = await resultsText();
  expect("few-events warning from the engine (5 events in total)", /Only 5 events in total/.test(txt));
  const rmstDiff = await page.locator(".surv-rmst-diff tr", { hasText: "Drug minus Vehicle" }).innerText().catch(() => "");
  expect("RMST up to day 30: Drug minus Vehicle 12.4 (95% CI 3.927 to 20.87)",
    /12\.4\s+3\.927 to 20\.87/.test(rmstDiff), rmstDiff.replace(/\s+/g, " "));
  await page.getByLabel("Survival at time").fill("12");
  await page.getByLabel("Survival at time").press("Enter");
  expect("survival at a chosen time: day 12, Vehicle 40%",
    await waitResults(/Survival at day 12[^]*Vehicle\s+5\s+40%/));

  await newSurvival("Dose groups", 4);
  const dlg4 = await fillFromCounts("Day\tVehicle\tLow\tMid\tHigh\n0\t8\t8\t8\t8\n5\t6\t8\t8\t8\n10\t4\t6\t7\t8\n"
    + "15\t2\t5\t6\t7\n20\t1\t3\t5\t7\n30\t0\t2\t4\t6");
  await dlg4.getByRole("button", { name: "Fill the table" }).click();
  expect("four groups: pairwise log-rank header adjusted for 6 comparisons (Holm-Šídák)",
    await waitResults(/adjusted for 6 comparisons \(Holm-Šídák\)/));
  const pwTable = page.locator(".surv-block", { hasText: "Pairwise comparisons (log-rank)" }).locator("table.clin-grid");
  expect("pairwise table: 6 rows (all pairs)", await pwTable.locator("tbody tr").count() === 6);
  const vh = (await pwTable.locator("tr", { hasText: "Vehicle vs. High" }).innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  const nums = vh.match(/High ([\d.]+) 1 ([\d.]+) ([\d.]+)/);
  const pu = Number(nums?.[2]);
  const pa = Number(nums?.[3]);
  expect("Vehicle vs High: unadjusted P 0.001724, Holm-Šídák adjusted 1 - (1 - P)^6 = 0.0103 (>= unadjusted)",
    !!nums && Math.abs(pu - 0.001724) < 5e-6 && Math.abs(pa - (1 - (1 - pu) ** 6)) < 2e-4
    && Math.abs(pa - 0.0103) < 1e-4 && pa >= pu, vh);
  await page.getByLabel("Groups are ordered (e.g. doses): log-rank test for trend").check();
  expect("log-rank test for trend: chi-square 13.8, P = 0.0002035",
    await waitResults(/Log-rank test for trend\s+χ² = 13\.8\d*, df 1, P = (0\.000203|2\.035e-4)/));
  const legend = await page.locator(".methods-text").first().innerText().catch(() => "");
  expect("methods text names the pairwise tests, the correction and the trend test",
    /adjusted for 6 comparisons with the Holm-Šídák method/.test(legend) && /log-rank test for trend was used/.test(legend));
  await page.getByLabel("Compare groups").selectOption("control");
  expect("each group vs. control: 3 comparisons, adjusted for 3 (Holm-Šídák)",
    await waitResults(/adjusted for 3 comparisons \(Holm-Šídák\)/)
    && await pwTable.locator("tbody tr").count() === 3);
  // axe-core on the survival aside and the extras blocks (labels, names, contrast)
  const axeFile = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  await page.addScriptTag({ path: axeFile }).catch(() => {});
  const survViolations = await page.evaluate(async () => {
    const out = [];
    for (const sel of [".surv-aside", ".surv-extras", ".surv-notes"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // eslint-disable-next-line no-undef
      const r = await axe.run(el, { runOnly: { type: "rule", values: ["select-name", "label",
        "aria-input-field-name", "button-name", "input-button-name", "aria-required-children",
        "aria-required-parent", "color-contrast"] } });
      out.push(...r.violations.flatMap((x) => x.nodes.map((n) => `${sel} ${x.id}: ${n.html.slice(0, 80)}`)));
    }
    return out;
  });
  expect("axe-core: survival aside and extras have no label / name / contrast violations",
    survViolations.length === 0, survViolations.join(" | "));
}

// --- n-awareness (needs small-n-honesty, declare-experimental-unit,
// experiment-as-block, multiplicity-by-default) ---
// Native engine: power t_two_sample, solve effect, n1 = n2 = 3 → d = 3.071,
// critical t(4) = 2.776 → CI half-width 2.776 × √(2/3) = 2.27 SD; solve n
// for d = 1 / 1.5 / 2 → 17 / 9 / 6 per group. RM one-way ANOVA of Control
// 10 14 8 12, A 12 17 9 15, B 15 19 12 18 (rows = days): SS subjects
// 84.92 of 136.92 (62%). Holm-Šídák of the three t tests vs Control:
// C 0.002632 → 0.007874.
{
  const newColumnPaste = async (text) => {
    await page.getByRole("button", { name: "New data table" }).click();
    const nd = page.locator(".new-table-dialog");
    await nd.locator('input[name="table-type"][value="column"]').check();
    await nd.getByRole("button", { name: "Create table" }).click();
    await page.waitForTimeout(500);
    await page.evaluate((t) => {
      const el = document.querySelector(".data-table tbody input[data-r='0']:not([aria-label$='title'])");
      const dt = new DataTransfer();
      dt.setData("text/plain", t);
      el.focus();
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
    const imp = page.locator(".import-dialog");
    await imp.waitFor({ timeout: 10000 });
    await imp.getByRole("button", { name: "Import", exact: true }).click();
    await imp.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
  };
  const resultsText = (re, timeout = 60000) => page.waitForFunction((src) =>
    new RegExp(src).test(document.querySelector(".pane-results")?.innerText ?? ""),
  re.source, { timeout }).then(() => true, () => false);

  // (a) one pooled value per group: no P, description only
  await newColumnPaste("Control\tTreated\n10\t14\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  expect("n = 1 per group: P withheld, the results are descriptive",
    await resultsText(/P value\s+withheld: one value per group gives no estimate of the variability/));
  // the n needed comes from the power engine a moment later
  await page.waitForFunction(() => document.querySelector('[data-banner="p-withheld"]')?.textContent
    ?.includes("to detect d = 2"), null, { timeout: 60000 }).catch(() => {});
  const whBanner = await page.locator('[data-banner="p-withheld"]').innerText().catch(() => "");
  expect("n = 1 per group: 'one value per group allows description only' with the replication needed",
    whBanner.includes("No P value: one value per group allows description only")
    && whBanner.includes("17 to detect d = 1, 9 to detect d = 1.5, 6 to detect d = 2")
    && whBanner.includes("The need for independent samples"), whBanner.slice(0, 300));
  const whSentence = await page.locator(".report-sentence p").innerText().catch(() => "");
  const whLegend = await page.locator(".report-legend p").innerText().catch(() => "");
  expect("results sentence and legend say exploratory (one value per group), no P",
    whSentence.startsWith("Descriptive results only, exploratory (one value per group)")
    && whLegend.includes("exploratory (one value per group)") && !/P = /.test(whSentence + whLegend),
    `${whSentence} | ${whLegend}`);

  // (b) n = 3 per group: the detectable effect from the power engine
  await newColumnPaste("Control\tTreated\n10\t14\n11\t15\n12\t17\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  expect("n = 3 per group: chip 'can detect only d ≥ 3.07 at 80% power (CI ≈ ±2.27 SD)'",
    await page.waitForFunction(() => document.querySelector(".guide-chips")?.textContent
      ?.includes("n = 3 per group: can detect only d ≥ 3.07 at 80% power (CI ≈ ±2.27 SD); plan replication"),
    null, { timeout: 60000 }).then(() => true, () => false),
    await page.locator(".guide-chips").innerText().catch(() => ""));
  await page.locator(".guide-chip", { hasText: "can detect only" }).click();
  expect("the detectable-effect chip offers the power tool and cites FAQ 1710",
    await page.locator(".guide-chip-detail").getByRole("button", { name: /power tool/ }).count() === 1
    && (await page.locator(".guide-chip-detail").innerText()).includes("FAQ 1710"));

  // (c) triplicate wells from three experiments: asked before any P
  await newColumnPaste("Control\tTreated\n10\t12\n11\t13\n12\t14\n20\t23\n21\t24\n22\t25\n30\t33\n31\t34\n32\t35\n");
  const uq = page.getByRole("region", { name: "What does each value represent?" });
  expect("a pasted table of 9 values per group is asked what each value represents",
    await appears(uq, 30000));
  await page.getByRole("button", { name: /Each value is: Technical repeat/ }).click();
  expect("technical repeats: blocks of 3 rows, 3 experiments with 9 wells per group",
    (await uq.innerText()).includes("3 independent experiments, 9 wells per group"),
    await uq.innerText());
  await uq.getByRole("button", { name: "Use these experiments" }).click();
  expect("the legend reads n = 3 independent experiments (9 wells)",
    await page.waitForFunction(() => document.querySelector(".report-legend p")?.textContent
      ?.includes("n = 3 independent experiments (9 wells) per group, paired"), null, { timeout: 60000 })
      .then(() => true, () => false),
    await page.locator(".report-legend p").innerText().catch(() => ""));
  expect("the question is answered once per table",
    await page.getByRole("region", { name: "What does each value represent?" }).count() === 0);

  // (d) control, A and B once on each of four days: matched by day
  await newColumnPaste("Control\tA\tB\n10\t12\t15\n14\t17\t19\n8\t9\t12\n12\t15\t18\n");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /Which test/ }).click();
  const wtb = page.locator("dialog.which-test");
  await wtb.waitFor({ timeout: 10000 });
  await wtb.getByRole("group", { name: /run once per experiment, on different days/ })
    .getByRole("radio", { name: "Yes" }).check();
  expect("wizard: run once per experiment on different days → repeated-measures ANOVA",
    (await wtb.locator(".wt-test").innerText()) === "Repeated-measures one-way ANOVA"
    && (await wtb.locator(".wt-result").innerText()).includes("experiment is a block"));
  await wtb.getByRole("button", { name: /^Open on/ }).click();
  const blockNote = await page.locator('[data-banner="block-removed"]').waitFor({ timeout: 60000 })
    .then(() => page.locator('[data-banner="block-removed"]').innerText(), () => "");
  expect("RM ANOVA by day: 'Day-to-day (between-experiment) differences removed: SS = 84.92, 62%'",
    blockNote.includes("Day-to-day (between-experiment) differences removed: SS = 84.92, 62% of the total")
    && blockNote.includes("Festing 2014"), blockNote.slice(0, 200));

  // (e) three t tests against one control on one table
  await newColumnPaste("Control\tA\tB\tC\n10\t12\t11\t13\n11\t13\t12\t15\n12\t14\t13\t14\n"
    + "10.5\t12.5\t14\t16\n11.5\t13.5\t10\t12\n12.5\t11\t12\t14\n");
  for (const [i, b] of [1, 2, 3].entries()) {
    if (i > 0) {
      await page.getByRole("button", { name: "Analyze", exact: true }).click();
      await page.getByRole("menuitem", { name: /Column analyses/ }).click();
      await page.waitForTimeout(800);
    }
    await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
    await page.locator(".pane-controls").getByLabel("Group B").selectOption(String(b));
    await page.waitForTimeout(800);
  }
  const mChip = page.locator(".guide-chip", { hasText: "t tests on this table" });
  expect("three t tests: chip with the familywise error 1−0.95³ = 14% (Bonferroni 15%)",
    await appears(mChip, 30000) && (await mChip.innerText())
      .includes("3 t tests on this table: familywise error ≈ 1−0.95³ = 14% (Bonferroni bound 15%)"),
    await mChip.innerText().catch(() => ""));
  await mChip.click();
  await page.getByRole("button", { name: "Adjust these 3 P values (Holm-Šídák)" }).click();
  const holm = await page.locator(".guide-holm").waitFor({ timeout: 60000 })
    .then(() => page.locator(".guide-holm").innerText(), () => "");
  expect("Holm-Šídák across the three: Control vs. C 0.002632 → 0.007874",
    /Control vs\. C\s+0\.002632\s+0\.007874/.test(holm), holm.replace(/\s+/g, " "));
  await page.getByRole("button", { name: "One-way ANOVA with Dunnett vs Control" }).click();
  expect("one click: ordinary one-way ANOVA with Dunnett's comparisons against Control",
    await resultsText(/Ordinary one-way ANOVA[\s\S]*C vs\. Control/)
    && await page.locator(".pane-controls").getByLabel("Multiple comparisons").inputValue() === "dunnett");
}

// --- discoverability (user-needs catalogue, Wave 0): features users look
// for where they look. "Help me choose…" first in Analyze, worded with the
// table's own rows, landing on the test with its reason; "Plan next
// experiment" from a pilot t test with the pilot SD filled in (no post
// hoc power); "How this is validated" on a Dunnett ANOVA; Cox regression
// from the survival results; Compare fits from a curve fit; the Save
// menu's .pzfx export and Prism-to-CSV conversion; the start screen's
// Prism note with a dropped .pzfx file.
{
  // axe-core (WCAG 2 A/AA, contrast included) on the new parts of a page.
  const axeFile = createRequire(join(here, "e2e-check.mjs")).resolve("axe-core/axe.min.js");
  const axeViolations = async (pg, selectors) => {
    await pg.addScriptTag({ path: axeFile }).catch(() => {});
    return pg.evaluate(async (sels) => {
      const out = [];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) { out.push(`${sel}: missing`); continue; }
        // eslint-disable-next-line no-undef
        const r = await axe.run(el, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
        out.push(...r.violations.flatMap((x) => x.nodes.map((n) => `${sel} ${x.id}: ${n.html.slice(0, 70)}`)));
      }
      return out;
    }, selectors);
  };
  const pasteInto = async (csv) => {
    await page.getByRole("button", { name: "Import…", exact: true }).click();
    const imp = page.locator(".import-dialog");
    await imp.getByLabel("Pasted text").check();
    await imp.getByLabel("Text to import").fill(csv);
    const titles = imp.getByLabel(/holds column titles/);
    if (!(await titles.isChecked())) await titles.check();
    await imp.getByRole("tab", { name: "Placement" }).click();
    await imp.getByLabel(/In place of the table/).check();
    await imp.getByRole("button", { name: "Import", exact: true }).click();
    await imp.waitFor({ state: "detached", timeout: 60000 });
  };
  // A two-group pilot: Control vs Treated, 6 animals each.
  await page.getByRole("button", { name: "New data table" }).first().click();
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByLabel("Table name").fill("Pilot");
  await nd.getByLabel("Groups (columns)", { exact: true }).fill("2");
  await nd.getByLabel("Rows (values per group)", { exact: true }).fill("6");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await pasteInto("Control,Treated\n10.2,13.4\n11.5,14.1\n9.8,12.8\n12.1,15.0\n10.9,13.9\n11.3,14.6");
  await page.waitForSelector('.pane-results[data-live="true"]', { timeout: 120000 });

  // (a) Help me choose… is the first entry of Analyze; three questions
  // about the user's own rows; lands on the test with its reason.
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  const firstItem = page.getByRole("menu", { name: "Add an analysis" }).getByRole("menuitem").first();
  expect("Analyze: Help me choose… is the first entry",
    (await firstItem.innerText()).startsWith("Help me choose…"), await firstItem.innerText());
  await firstItem.click();
  const hm = page.getByRole("dialog", { name: "Help me choose a test" });
  await hm.waitFor({ timeout: 10000 });
  expect("Help me choose: two groups pre-filled from the table",
    await hm.getByRole("radio", { name: "Two", exact: true }).isChecked()
    && (await hm.innerText()).includes("Your table has 2 data sets: Control and Treated."));
  const pairQ = "Is row 1 of Control (10.2) the same animal, culture or experiment as row 1 of Treated (13.4)?";
  const pairGroup = hm.getByRole("group", { name: pairQ });
  expect("the pairing question uses the table's own first row", await pairGroup.count() === 1);
  await pairGroup.getByRole("radio", { name: "No" }).check();
  await hm.getByRole("group", { name: "What is each value in Control?" })
    .getByRole("radio", { name: "One independent subject or experiment" }).check();
  await hm.getByRole("group", { name: "Do you expect the groups to have equal SDs?" })
    .getByRole("radio", { name: "Yes, by design" }).check();
  const recTest = await hm.locator(".wt-test").innerText();
  const recReason = await hm.locator(".wt-test + p").innerText();
  expect("Help me choose recommends the unpaired t test with a one-paragraph reason",
    recTest === "Unpaired t test" && recReason.length > 80, `${recTest}: ${recReason.slice(0, 80)}`);
  await hm.getByRole("button", { name: "Open on “Pilot”" }).click();
  const why = page.getByRole("note", { name: "Why this test" });
  const whyShown = await why.waitFor({ timeout: 30000 }).then(() => true, () => false);
  expect("lands on the t test with the reason (Why Unpaired t test.)", whyShown &&
    (await why.innerText()).startsWith(`Why Unpaired t test. ${recReason.slice(0, 40)}`));
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });

  // (b) Plan next experiment: the pilot SD (pooled, 0.825) filled in; the
  // effect to detect is chosen (1 unit): 12 per group for 80% power.
  await page.getByRole("button", { name: "Plan next experiment…" }).click();
  const pw = page.locator("dialog.power-dialog");
  await pw.waitFor({ timeout: 15000 });
  const sdLine = await pw.locator(".power-pilot-sd").innerText();
  expect("Plan next experiment: pilot SD 0.825 (pooled SD of Control and Treated, n = 6 per group)",
    /Pilot SD: 0\.825 \(pooled SD of Control and Treated; unpaired t test, n = 6 per group\)/.test(sdLine),
    sdLine);
  expect("the pilot SD is filled in as the common SD",
    await pw.getByLabel("SD (common)").first().inputValue().catch(() => "") === "0.825"
    || await pw.locator('input[aria-label="SD (common)"]').first().inputValue() === "0.825");
  expect("no observed (post hoc) power: the note cites GraphPad FAQ 1710",
    await pw.getByRole("link", { name: /FAQ 1710/ }).count() === 1);
  await pw.getByLabel("Difference to detect").fill("1");
  const just = await page.waitForFunction(() => {
    const t = document.querySelector("dialog.power-dialog .power-sentence")?.textContent ?? "";
    return t.includes("12 animals per group (24 in total)") && t.includes("pooled SD of Control and Treated in the pilot experiment “Pilot” (0.825") ? t : null;
  }, null, { timeout: 60000 }).then((h) => h.jsonValue(), () => "");
  expect("justification: 12 animals per group for 80% power, citing the pilot SD", !!just, String(just).slice(0, 160));
  const axePower = await axeViolations(page, ["dialog.power-dialog .power-pilot", ".results-links", ".results-why"]);
  expect("axe-core: the pilot card and the results links pass WCAG 2 A/AA", axePower.length === 0,
    axePower.join(" | "));
  await pw.getByRole("button", { name: "Done" }).click();

  // (d) How this is validated, on a one-way ANOVA with Dunnett's test.
  await newExampleTable("column");
  await page.waitForSelector(".stat-cols", { timeout: 30000 });
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /Help me choose/ }).click();
  const hm2 = page.getByRole("dialog", { name: "Help me choose a test" });
  await hm2.getByText("Each vs a control", { exact: true }).click();
  await hm2.getByRole("button", { name: /^Open on/ }).click();
  await page.waitForSelector(".result-card h3:has-text('Ordinary one-way ANOVA')", { timeout: 30000 });
  const valLink = page.getByRole("navigation", { name: "About these results" });
  expect("results sheet: How this is validated, with its count sentence",
    await valLink.getByRole("button", { name: "How this is validated" }).count() === 1
    && await page.waitForFunction(() => /checked against SciPy, \d published tables?/.test(
      document.querySelector(".results-links")?.textContent ?? ""), null, { timeout: 15000 })
      .then(() => true, () => false),
    await valLink.innerText());
  await valLink.getByRole("button", { name: "How this is validated" }).click();
  const val = page.getByRole("dialog", { name: "How OpenDose is validated" });
  await val.waitFor({ timeout: 15000 });
  const scopeText = await val.getByRole("note", { name: "Checks for this analysis" }).innerText();
  const rows = await val.locator(".validation-table tbody tr").allInnerTexts();
  expect("the validation page opens on the Dunnett checks only (published critical values 2.23, 2.57, 2.76…)",
    scopeText.includes("Checks for one-way ANOVA with Dunnett's test") && rows.length >= 5
    && rows.every((r) => r.includes("Dunnett")) && rows.some((r) => r.includes("2.23, 2.57, 2.76"))
    && rows.some((r) => r.includes("scipy.stats.dunnett")), `${rows.length} rows; ${scopeText.slice(0, 120)}`);
  const axeVal = await axeViolations(page, [".validation-scope"]);
  expect("axe-core: the validation page's analysis note passes", axeVal.length === 0, axeVal.join(" | "));
  await val.getByRole("button", { name: /^Show all \d+ checks$/ }).click();
  expect("Show all lists every check again",
    (await val.locator(".validation-table tbody tr").count()) > rows.length + 50);
  await val.getByRole("button", { name: "Close" }).click();

  // (c) Survival results link to Cox regression on the same table.
  await newExampleTable("survival");
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  await page.getByRole("button", { name: "Cox regression (hazard ratios with covariates)" }).click();
  const coxRow = await cardRow("Cox proportional hazards", "Group: Treated vs Control");
  // statsmodels PHReg (Efron ties) on the same 20 subjects: HR 0.4513,
  // 95% CI 0.1510 to 1.348.
  expect("the Cox link opens Cox regression on the same table: HR 0.4513 (0.151 to 1.348)",
    await page.getByRole("tab", { name: "Cox" }).count() === 1 && coxRow.includes("0.4513")
    && coxRow.includes("0.151 to 1.348"), coxRow);

  // (g) Curve-fit results offer Compare fits, set up from the fit.
  await newExampleTable("xy");
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
  const cmpModel = page.getByRole("button", { name: "Compare with another model…" });
  expect("fit results show the compare-fits links",
    await appears(cmpModel) && await page.getByRole("button", { name: "Compare with another data set…" }).count() <= 1);
  await cmpModel.click();
  expect("Compare fits opens on the same table (F test and AICc, 3PL vs 4PL)",
    await page.waitForFunction(() => {
      const t = document.querySelector(".pane-results")?.textContent ?? "";
      return /AICc/.test(t) && /is preferred/.test(t);
    }, null, { timeout: 60000 }).then(() => true, () => false)
    && await page.getByRole("tab", { name: "Compare fits" }).count() === 1);

  // (f) The Save menu: the .pzfx export by its plain label, and Prism
  // files converted to CSV (two files, every table, in one zip).
  await page.getByRole("button", { name: "More ways to save and share" }).click();
  expect("Save menu lists the .pzfx export plainly",
    await page.getByRole("menuitem", { name: "Export tables as .pzfx (opens in GraphPad Prism)" }).count() === 1);
  const PRISMF = join(here, "..", "..", "engine", "tests", "fixtures", "synthetic_project.prism");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 10000 }),
    page.getByRole("menuitem", { name: "Convert Prism files to CSV…" }).click(),
  ]);
  const [zipDl] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    chooser.setFiles([join(here, "..", "e2e-fixtures", "sample.pzfx"), PRISMF]),
  ]);
  const zipPath = join(tmp, zipDl.suggestedFilename());
  await zipDl.saveAs(zipPath);
  const zip = unzipSync(readFileSync(zipPath));
  const entries = Object.keys(zip).sort();
  expect("Prism files to CSV: one folder per file, every data table, a README",
    zipDl.suggestedFilename() === "prism-tables-csv.zip" && entries.includes("README.txt")
    && entries.includes("sample/dose-response.csv") && entries.includes("sample/groups.csv")
    && entries.some((e) => e.startsWith("synthetic-project/")), entries.join(", "));
  expect("the converted dose-response CSV starts with its titles row",
    /^X|^log\[Dose\]/.test(strFromU8(zip["sample/dose-response.csv"] ?? new Uint8Array())),
    strFromU8(zip["sample/dose-response.csv"] ?? new Uint8Array()).split("\n")[0]);

  // (e) and the results empty state: the start screen says Prism files
  // open here; a .pzfx dropped on it imports every data table.
  const ctx3 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p3 = await ctx3.newPage();
  p3.on("pageerror", (e) => errors.push(`pageerror (prism drop): ${e.message}`));
  await p3.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await p3.locator(".start-screen").waitFor({ timeout: 60000 });
  const prismNote = await p3.getByRole("region", { name: "GraphPad Prism files (.prism, .pzfx)" }).innerText();
  expect("start screen: .prism / .pzfx files open here, analyses recomputed",
    prismNote.includes("Open a .prism or .pzfx file: every data table is imported; analyses are recomputed here")
    && await p3.getByRole("button", { name: "Convert Prism files to CSV…" }).count() === 1, prismNote.slice(0, 120));
  const axeStart = await axeViolations(p3, [".start-prism"]);
  expect("axe-core: the start screen's Prism section passes", axeStart.length === 0, axeStart.join(" | "));
  const b64 = readFileSync(join(here, "..", "e2e-fixtures", "sample.pzfx")).toString("base64");
  const dt = await p3.evaluateHandle((b) => {
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const d = new DataTransfer();
    d.items.add(new File([u], "sample.pzfx", { type: "application/xml" }));
    return d;
  }, b64);
  await p3.dispatchEvent("main.start-screen", "dragover", { dataTransfer: dt });
  await p3.dispatchEvent("main.start-screen", "drop", { dataTransfer: dt });
  const ch = p3.locator(".pzfx-chooser");
  await ch.waitFor({ timeout: 180000 });
  expect("dropped .pzfx: the chooser lists both data tables and says analyses are recomputed",
    (await ch.innerText()).includes("analyses are recomputed here")
    && await ch.getByRole("button", { name: /Dose response/ }).count() === 1
    && await ch.getByRole("button", { name: /Groups/ }).count() === 1);
  await ch.getByRole("button", { name: "Import all" }).click();
  expect("Import all: every data table arrives, with the recompute note in the status line",
    await p3.getByRole("treeitem", { name: "Dose response", exact: true }).waitFor({ timeout: 30000 })
      .then(() => true, () => false)
    && await p3.getByRole("treeitem", { name: "Groups", exact: true }).count() === 1
    && (await p3.locator("header .status").innerText()).includes("analyses are recomputed here"));
  // A table whose results and graphs are deleted lists where to start.
  const groupsItem = p3.getByRole("treeitem", { name: "Groups", exact: true });
  for (let i = 0; i < 6; i++) {
    const kids = groupsItem.getByRole("treeitem");
    if (!(await kids.count())) break;
    await kids.first().locator(":scope > .nav-row").click({ button: "right" });
    await p3.getByRole("menuitem", { name: /Delete/ }).click();
    await p3.getByRole("alertdialog").getByRole("button", { name: "Delete" })
      .click({ timeout: 2000 }).catch(() => {});
    await p3.waitForTimeout(300);
  }
  await groupsItem.locator(":scope > .nav-row").click();
  const empty = p3.getByRole("list", { name: "Where to start" });
  expect("results empty state lists Help me choose, Plan an experiment and validation",
    await appears(empty) && (await empty.getByRole("button").allInnerTexts()).join("|")
      === "Help me choose…|Plan an experiment (power)…|How OpenDose is validated",
    await empty.innerText().catch(() => ""));
  const axeEmpty = await axeViolations(p3, [".results-empty-links"]);
  expect("axe-core: the empty results' entry points pass", axeEmpty.length === 0, axeEmpty.join(" | "));
  await ctx3.close();
}

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
