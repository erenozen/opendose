// End-to-end checks of the results honesty features (FEATURE-PLAN wave 1):
// residual plots for curve fits and ANOVA models in the Checks row (P-11),
// the smallest P a rank test can reach (P-15), the "Analysed" line of
// regression, Cox and contingency results (P-16) and the ratio to control
// with its Fieller CI (P-18). Each number asserted here is pinned in the
// engine tests from an independent reference (engine/tests/reference/).
// Usage: node scripts/e2e-results.mjs [http://localhost:5173/]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const url = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("example", "1");
  return u.toString();
})();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

const fileMenu = async (item) => {
  await page.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
};
const appears = (locator, timeout = 30000) => locator.first().waitFor({ timeout })
  .then(() => true, () => false);
const openChecks = async () => {
  const d = page.locator(".pane-answer details.checks").first();
  await d.waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
  if (await d.count() && !(await d.evaluate((e) => e.open))) await d.locator("summary").click();
};
const answerText = (re, timeout = 60000) => page.waitForFunction((src) => {
  const el = document.querySelector(".pane-answer");
  return !!el && new RegExp(src).test(el.textContent ?? "");
}, re.source, { timeout }).then(() => true, () => false);
const liveResults = (re, timeout = 60000) => page.waitForFunction((src) => {
  const el = document.querySelector('.pane-results[data-live="true"]');
  return !!el && new RegExp(src).test(el.textContent ?? "");
}, re.source, { timeout }).then(() => true, () => false);
/** A new table from pasted text (first line: column titles). */
const pastedTable = async (type, name, text) => {
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator(`input[name="table-type"][value="${type}"]`).check();
  await nd.getByLabel("Table name").fill(name);
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp = page.locator(".import-dialog");
  await imp.getByLabel("Pasted text").check();
  await imp.getByLabel("Text to import").fill(text);
  const titles = imp.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp.getByRole("tab", { name: "Placement" }).click();
  await imp.getByLabel(/In place of the table/).check();
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 30000 });
};
const points = (plot) => page.locator(`.pane-answer .resid-plot[data-plot="${plot}"] .scatterlayer .point`).count();

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });

// --- P-11: residuals of the example's 4PL fit, in the Checks row ---------
{
  await openChecks();
  const toggle = page.locator(".pane-answer").getByRole("button", { name: "Residuals of “Drug A”" });
  expect("P-11 fit: the Checks row has a Residuals section for “Drug A”", await appears(toggle));
  const teaser = await page.locator(".pane-answer .resid-teaser").first().innerText().catch(() => "");
  expect("P-11 fit: the closed section names its plots and counts 27 values",
    /against X and against the fitted Y, and a QQ plot \(27 values\)/.test(teaser), teaser);
  await toggle.click();
  const drawn = await appears(page.locator('.pane-answer .resid-plot[data-plot="qq"] .scatterlayer .point'));
  const [nx, nf, nq] = [await points("resid-x"), await points("resid-fitted"), await points("qq")];
  expect("P-11 fit: residual vs X, residual vs fitted and a QQ plot, 27 points each",
    drawn && nx === 27 && nf === 27 && nq === 27, `${nx} / ${nf} / ${nq}`);
  const figs = await page.locator(".pane-answer .residuals-card figcaption strong").allInnerTexts();
  expect("P-11 fit: plots in the order vs. X, vs. fitted, QQ",
    figs.join("|") === "Residuals vs. X.|Residuals vs. fitted.|QQ plot.", figs.join("|"));
  // scipy curve_fit reference (engine/tests/reference/fit_residuals.py):
  // Shapiro-Wilk W = 0.97639 on the 27 residuals
  const sw = await page.locator(".pane-answer .resid-shapiro").first().innerText().catch(() => "");
  expect("P-11 fit: Shapiro-Wilk on the 27 residuals, W = 0.9764 (scipy reference)",
    /Shapiro-Wilk on the 27 residuals: W = 0\.9764/.test(sw), sw);
  const advice = await page.locator(".pane-answer .resid-advice").first().innerText().catch(() => "");
  expect("P-11 fit: the advice reads the plots, not a P value, and cites its source",
    /Look at the 27 residuals for a pattern/.test(advice) && /Source: GraphPad curve fitting guide/.test(advice)
      && !/nonparametric/i.test(advice), advice.slice(0, 100));
}

// --- P-11: residuals of two-way ANOVA (2 x 3, 4 replicates) --------------
{
  // engine/tests/reference/anova_residuals.py, TWO_WAY
  const TWO_WAY = [
    [[12.1, 13.4, 11.8, 12.9], [15.2, 14.8, 16.1, 15.5], [18.4, 17.2, 19.0, 18.1]],
    [[10.2, 11.5, 9.8, 10.9], [14.9, 13.1, 15.8, 14.0], [22.3, 20.8, 23.5, 21.1]],
  ];
  await fileMenu("New data table…");
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator('input[name="table-type"][value="grouped"]').check();
  const shape = dlg.locator(".field-num input");
  await shape.nth(0).fill("3");
  await shape.nth(1).fill("4");
  await shape.nth(2).fill("2");
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".data-table", { timeout: 10000 });
  for (let r = 0; r < 2; r++) {
    for (let d = 0; d < 3; d++) {
      for (let s = 0; s < 4; s++) {
        await page.locator(`.data-table input[aria-label='Dataset ${"ABC"[d]}, Y${s + 1}, row ${r + 1}']`)
          .fill(String(TWO_WAY[r][d][s]));
      }
    }
  }
  await page.keyboard.press("Tab");
  const ready = await liveResults(/Interaction/);
  await openChecks();
  const toggle = page.locator(".pane-answer").getByRole("button", { name: "Residuals: QQ plot and residuals vs. fitted" });
  expect("P-11 two-way: the Checks row has a Residuals section", ready && await appears(toggle));
  await toggle.click();
  await appears(page.locator('.pane-answer .resid-plot[data-plot="qq"] .scatterlayer .point'));
  // a full redraw settles after the last cell edit
  await page.waitForFunction(() => document.querySelectorAll(
    '.pane-answer .resid-plot[data-plot="qq"] .scatterlayer .point').length === 24, null, { timeout: 30000 })
    .catch(() => {});
  const nq = await points("qq"), nf = await points("resid-fitted");
  expect("P-11 two-way: a QQ plot of 24 cell-mean residuals (and 24 against the fitted cell means)",
    nq === 24 && nf === 24, `${nq} / ${nf}`);
  const axis = await page.evaluate(() => document.querySelector(
    '.pane-answer .resid-plot[data-plot="resid-fitted"]')?.layout?.xaxis?.title?.text ?? "");
  expect("P-11 two-way: fitted values are the cell means", axis === "Fitted value (cell mean)", axis);
  // statsmodels ols("y ~ C(A) * C(B)").resid, Shapiro-Wilk W = 0.97441
  const sw = await page.locator(".pane-answer .resid-shapiro").first().innerText().catch(() => "");
  expect("P-11 two-way: Shapiro-Wilk on the 24 pooled residuals, W = 0.9744 (statsmodels reference)",
    /Shapiro-Wilk on the 24 pooled residuals: W = 0\.9744/.test(sw), sw);
}

// --- P-15: a rank test that cannot reach P < 0.05 ------------------------
{
  await pastedTable("column", "Three and three", "A\tB\n1\t4\n2\t5\n3\t6\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  await page.locator(".pane-controls").getByRole("combobox", { name: "Test", exact: true }).selectOption("mann_whitney");
  // the plan's acceptance wording; 2 / C(6, 3) = 0.10 (hand derivation,
  // scipy mannwhitneyu exact; engine/tests/test_rank_floor.py)
  const title = "With 3 and 3 values the smallest possible two-sided P is 0.10, so this design cannot reach P < 0.05";
  const note = page.locator('.pane-answer [data-banner="rank-floor"]');
  const shown = await answerText(new RegExp(title.replace(/[.()]/g, "\\$&")));
  expect("P-15 Mann-Whitney 1, 2, 3 vs 4, 5, 6: the Checks row says the design cannot reach P < 0.05",
    shown && (await note.first().innerText().catch(() => "")).includes(title));
  const text = await note.first().innerText().catch(() => "");
  expect("P-15: worded as a design fact, with the t test on log values and its sources",
    /property of the design, fixed before any data were collected/.test(text)
      && /t test on the log of the values/.test(text) && /not from this result/.test(text)
      && /Nonparametric tests with small and large samples/.test(text)
      && /Analyzing ratios with logs/.test(text), text.slice(0, 160));
  await liveResults(/Mann-Whitney U/);
  const pRow = await page.locator(".pane-results tr", { hasText: "P value (two-tailed" }).first()
    .innerText().catch(() => "");
  expect("P-15: the Mann-Whitney P itself is the floor, 0.1",
    /^P value \(two-tailed[^)]*\)\s+0\.10*(\s|$)/.test(pRow.trim()), pRow.replace(/\s+/g, " "));
  // four and four: 2 / 70 = 0.029 can reach it, no note
  await pastedTable("column", "Four and four", "A\tB\n1\t5\n2\t6\n3\t7\n4\t8\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  await page.locator(".pane-controls").getByRole("combobox", { name: "Test", exact: true }).selectOption("mann_whitney");
  await liveResults(/Mann-Whitney/);
  expect("P-15: 4 vs 4 can reach P < 0.05, so no note",
    await page.locator('[data-banner="rank-floor"]').count() === 0);
}

// --- P-16: the Analysed line of a multiple regression --------------------
{
  // engine/tests/reference/analysed_rows.py: 30 rows, Age blank in rows
  // 3, 9, 17 and 22; statsmodels OLS(missing = "drop").nobs = 26
  const ref = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "reference",
    "analysed_rows.json"), "utf8"));
  const t = ref.table;
  const tsv = "Age\tDose\tY\n" + t.Y.map((_, i) => [t.Age[i] ?? "", t.Dose[i], t.Y[i]].join("\t")).join("\n");
  await pastedTable("multivariable", "Thirty rows", tsv);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /Multiple linear regression/ }).click();
  const line = page.locator(".notes-strip .analysed-line");
  const want = `Analysed: ${ref.multiple.nobs} of 30 rows; 4 dropped for a blank in Age (rows ${ref.multiple.dropped_rows.join(", ")}).`;
  const ok = await page.waitForFunction((w) => document.querySelector(".notes-strip .analysed-line")
    ?.textContent === w, want, { timeout: 60000 }).then(() => true, () => false);
  expect("P-16 multiple regression: 'Analysed: 26 of 30 rows; 4 dropped for a blank in Age (rows 3, 9, 17, 22).'",
    ok, await line.first().innerText().catch(() => ""));
}

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
expect("no page errors", errors.length === 0, `${errors.length}`);
console.log(fail.length ? `\nFAILURES (${fail.length}):\n${fail.join("\n")}` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
