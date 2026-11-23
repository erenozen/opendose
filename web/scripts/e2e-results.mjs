// End-to-end checks of the results honesty features (FEATURE-PLAN wave 1):
// residual plots for curve fits and ANOVA models in the Checks row (P-11),
// the smallest P a rank test can reach (P-15), the "Analysed" line of
// regression, Cox and contingency results (P-16) and the ratio to control
// with its Fieller CI (P-18); and the tests of wave 1: equivalence (P-12),
// comparing regression lines (P-13), pairs of rows of a contingency table
// (P-14) and two event rates (P-47). Each number asserted here is pinned in
// the engine tests from an independent reference (engine/tests/reference/).
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

// --- P-18: ratio to control with a Fieller CI ------------------------------
{
  // engine/tests/reference/fieller_ratio.py: Fieller's quadratic by hand,
  // 0.65 (95% CI 0.57615 to 0.72919); Dunnett plug-in intervals with
  // the critical value by nested quadrature (c = 2.59904)
  await pastedTable("column", "Control and treated",
    "Control\tTreated\n100\t60\n95\t70\n105\t65\n98\t55\n102\t75\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  await liveResults(/CI of ratio \(Fieller\)/);
  const row = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const ratio = await row("Ratio Treated/Control");
  const ci = await row("95% CI of ratio (Fieller)");
  expect("P-18 typeset table: 'Ratio Treated/Control 0.65 (65% of Control)'",
    ratio === "Ratio Treated/Control 0.65 (65% of Control)", ratio);
  expect("P-18 typeset table: '95% CI of ratio (Fieller) 0.5762 to 0.7292'",
    ci === "95% CI of ratio (Fieller) 0.5762 to 0.7292", ci);
  // the sentence pinned (ruling 10): the ratio and its CI, not "35% lower"
  const sentence = await page.locator(".pane-answer .meaning-sentence").first().innerText().catch(() => "");
  expect("P-18 'What this means' uses the ratio and its Fieller CI",
    sentence.includes("(mean 65 vs. 100; Treated/Control = 0.65, 95% CI 0.5762 to 0.7292 by Fieller's method)")
      && !/35% lower/.test(sentence), sentence.slice(0, 220));

  await pastedTable("column", "Dose groups",
    "Control\tLow\tMid\tHigh\n100\t92\t80\t60\n95\t88\t76\t70\n105\t97\t85\t65\n98\t90\t79\t55\n102\t95\t83\t75\n\t\t81\t\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("anova");
  await page.locator(".pane-controls label.check-row", { has: page.locator('span:text-is("Multiple comparisons")') })
    .locator("select").selectOption("dunnett");
  const table = page.locator(".pane-results .ratio-table");
  const shown = await appears(table, 60000);
  const rows = shown ? (await table.locator("tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()) : [];
  expect("P-18 Dunnett: a ratio and a simultaneous Fieller CI per comparison",
    rows.length === 3
      && rows[0] === "Low vs. Control 0.924 92.4% 0.8491 to 1.005"
      && rows[1] === "Mid vs. Control 0.8067 80.67% 0.7396 to 0.8791"
      && rows[2] === "High vs. Control 0.65 65% 0.5839 to 0.7204", rows.join(" | "));
}

// --- P-12: equivalence and non-inferiority (two one-sided tests) ----------
{
  // engine/tests/reference/equivalence_tost.py (statsmodels ttost_ind):
  // means 10.2 and 10.0, SD 0.5, n = 8 each; 90% CI -0.2403 to 0.6403;
  // margin ±1: P_TOST 0.003210 (equivalent); ±0.5: 0.1250 (not shown)
  await pastedTable("column", "Equivalence",
    "A\tB\n10.8\t10.6\n10.75\t10.55\n10.55\t10.35\n10.5\t10.3\n9.6\t9.4\n9.65\t9.45\n9.85\t9.65\n9.9\t9.7\n");
  const controls = page.locator(".pane-controls");
  await controls.locator("select.analysis-select").selectOption("ttest");
  await liveResults(/Difference between means/);
  await controls.getByLabel("Equivalence test").selectOption("equivalence");
  await controls.getByLabel(/^Margin/).fill("1");
  const ok1 = await answerText(/Equivalent within ±1/);
  const fig = (await page.locator(".pane-answer .answer-figure").first().innerText().catch(() => "")).trim();
  const ciLine = (await page.locator(".pane-answer .answer-ci").first().innerText().catch(() => "")).trim();
  expect("P-12 acceptance: the answer pane says 'Equivalent within ±1'",
    ok1 && fig === "Equivalent within ±1", fig);
  expect("P-12 the 90% CI in the headline is -0.2403 to 0.6403 (statsmodels reference)",
    ciLine === "90% CI -0.2403 to 0.6403", ciLine);
  const row = async (label) => (await page.locator(".pane-results .equivalence-table tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const ptost = await row("P (TOST");
  expect("P-12 P (TOST) 0.003210 at ±1", /^P \(TOST, the larger one-sided P\) 0\.00321\d?$/.test(ptost), ptost);
  const lowT = await row("Null hypothesis A − B ≤ -1");
  expect("P-12 the lower one-sided test: t = 4.8, P = 1.413e-4",
    lowT === "Null hypothesis A − B ≤ -1 t = 4.8, P = 1.413e-4", lowT);
  // the CI drawn inside the margin lines
  const geom = await page.locator(".pane-results .equivalence-strip").first().evaluate((svg) => {
    const m = [...svg.querySelectorAll(".eq-margin")].map((l) => Number(l.getAttribute("x1")));
    const c = svg.querySelector(".eq-ci");
    return { m, lo: Number(c.getAttribute("x1")), hi: Number(c.getAttribute("x2")) };
  }).catch(() => null);
  expect("P-12 the 90% CI sits inside the margin lines",
    !!geom && geom.m.length === 2 && geom.m[0] < geom.lo && geom.hi < geom.m[1], JSON.stringify(geom));
  await openChecks();
  expect("P-12 the Checks row names the margin and asks when it was set",
    await appears(page.locator(".pane-answer").getByText("Equivalence margin ±1: set before looking at the data?")));

  await controls.getByLabel(/^Margin/).fill("0.5");
  const ok2 = await answerText(/Not shown to be equivalent/);
  const p2 = await (async () => { await liveResults(/±0\.5/); return row("P (TOST"); })();
  expect("P-12 acceptance: margin ±0.5 reads 'Not shown to be equivalent', P (TOST) 0.125",
    ok2 && /0\.125\d*$/.test(p2), p2);
  const reading = await page.locator(".pane-results .equivalence-results .model-line").first().innerText().catch(() => "");
  expect("P-12 a failed TOST is not read as a difference",
    /does not show that the groups differ/.test(reading) && !/significantly different/.test(reading), reading.slice(0, 120));
  await controls.getByLabel("Equivalence test").selectOption("off");
}

// --- P-13: compare slopes and intercepts of regression lines ------------
{
  // engine/tests/reference/compare_lines.py, "parallel" (statsmodels OLS:
  // anova_lm of y ~ x + g vs y ~ x * g, then y ~ x vs y ~ x + g)
  /** An XY table with one Y column per data set (the default has three
   *  replicate subcolumns), from pasted text. */
  const pastedXY = async (name, text) => {
    await fileMenu("New data table…");
    const nd = page.locator(".new-table-dialog");
    await nd.locator('input[name="table-type"][value="xy"]').check();
    await nd.getByLabel("Table name").fill(name);
    await nd.locator(".field-num input").nth(1).fill("1");
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
  await pastedXY("Two lines",
    "X\tControl\tTreated\n1\t3.1\t6.0\n2\t5.2\t7.7\n3\t6.8\t10.1\n4\t9.1\t11.8\n5\t11.0\t14.2\n6\t12.7\t15.9\n7\t15.2\t17.8\n8\t16.9\t20.1\n");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Linear regression/ }).click();
  await liveResults(/Slope/);
  await page.locator(".pane-controls").getByLabel("Compare slopes and intercepts (two or more data sets)").check();
  const block = page.locator(".pane-results .compare-lines-table");
  const shown = await appears(block, 60000);
  const cell = async (label) => (await block.locator(`tr[data-row="${label}"] td`).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const slopes = shown ? await cell("Are the slopes equal?") : "";
  expect("P-13 slope F test: F (1, 12) = 0.644, P = 0.4379, not shown to differ",
    slopes === "F (1, 12) = 0.644, P = 0.4379 The slopes are not shown to differ.", slopes);
  const common = await cell("Common slope (parallel lines)");
  expect("P-13 common slope 1.995 (95% CI 1.951 to 2.039)",
    common === "1.995 95% CI 1.951 to 2.039", common);
  const diff = await cell("Slope difference (Control − Treated)");
  expect("P-13 slope difference -0.03333 (95% CI -0.1238 to 0.05717)",
    diff === "-0.03333 95% CI -0.1238 to 0.05717", diff);
  const elev = await cell("Are the intercepts equal?");
  expect("P-13 intercept test F (1, 13) = 987.9, P < 0.0001, lines parallel at different heights",
    elev === "F (1, 13) = 987.9, P < 0.0001 The lines are parallel but at different heights.", elev);
  // diverging lines: the intercept test is said not to be meaningful
  await pastedXY("Diverging lines",
    "X\tA\tB\n0\t1.2\t0.8\n2\t2.9\t4.1\n4\t5.1\t8.2\n6\t7.2\t11.9\n8\t8.8\t16.2\n10\t11.1\t19.7\n");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Linear regression/ }).click();
  await liveResults(/Slope/);
  await page.locator(".pane-controls").getByLabel("Compare slopes and intercepts (two or more data sets)").check();
  await appears(block, 60000);
  const d1 = await cell("Are the slopes equal?");
  const d2 = await cell("Are the intercepts equal?");
  expect("P-13 diverging: slopes differ (F (1, 8) = 621.5) and the intercept test is flagged",
    /^F \(1, 8\) = 621\.5, P < 0\.0001 The slopes differ\.$/.test(d1) && /Not meaningful: the slopes differ/.test(d2),
    `${d1} | ${d2}`);
}

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
expect("no page errors", errors.length === 0, `${errors.length}`);
console.log(fail.length ? `\nFAILURES (${fail.length}):\n${fail.join("\n")}` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
