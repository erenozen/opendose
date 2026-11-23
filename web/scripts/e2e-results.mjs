// End-to-end checks of the results honesty features (FEATURE-PLAN wave 1):
// residual plots for curve fits and ANOVA models in the Checks row (P-11),
// the smallest P a rank test can reach (P-15), the "Analysed" line of
// regression, Cox and contingency results (P-16) and the ratio to control
// with its Fieller CI (P-18); and the tests of wave 1: equivalence (P-12),
// comparing regression lines (P-13), pairs of rows of a contingency table
// (P-14) and two event rates (P-47); and the fit models of wave 1: Weibull
// and hormesis models (P-19), range constraints (P-20), initial values and
// the fit report (P-21) and simulating a user-defined equation (P-51).
// Each number asserted here is pinned in the engine tests from an
// independent reference (engine/tests/reference/).
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

// --- P-21: initial values of the example 4PL, typed and reported ---------
{
  // engine/tests/reference/initial_values.py: the rules give Top 101.5,
  // Bottom 0.5, LogIC50 -7, HillSlope -1; from those and from a typed
  // LogIC50 = -5 the fit reaches LogIC50 -6.983 (SE 0.01471)
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"],
    { origin: new URL(baseUrl).origin });
  const fold = page.locator(".pane-results details.fit-starts").first();
  await fold.locator("summary").click();
  const startRows = async () => (await fold.locator("tbody tr").allInnerTexts())
    .map((t) => t.replace(/\s+/g, " ").trim());
  const rules = await startRows();
  expect("P-21 acceptance: four initial values from the model's rules",
    rules.join(" | ") === "Top 101.5 the model's rules | Bottom 0.5 the model's rules"
      + " | LogIC50 -7 the model's rules | HillSlope -1 the model's rules", rules.join(" | "));
  const note = await fold.locator(".hint-block").innerText().catch(() => "");
  expect("P-21 the fold says the other starts tried", /also tried 9 more starts with LogIC50/.test(note), note);
  const controls = page.locator(".pane-controls");
  await controls.locator("details.initial-values > summary").click();
  await controls.getByLabel("LogIC50 start").fill("-5");
  const typed = await appears(fold.locator("tbody tr", { hasText: "typed" }), 60000);
  const logRow = (await page.locator(".pane-results .results-table tr", { hasText: "LogIC50" }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  expect("P-21 acceptance: a typed LogIC50 start converges to the same LogIC50 -6.983 (SE 0.01471)",
    typed && (await startRows()).includes("LogIC50 -5 typed") && logRow.startsWith("LogIC50 -6.983 0.01471"),
    `${(await startRows()).join(" | ")} / ${logRow}`);
  await fold.getByRole("button", { name: /Copy fit report/ }).click();
  const report = await page.waitForFunction(() => navigator.clipboard.readText()
    .then((t) => (t.startsWith("Fit report") ? t : false)), null, { timeout: 10000 })
    .then((h) => h.jsonValue(), () => "");
  expect("P-21 Copy fit report: equation, initial values, constraints, weighting, CI method, every parameter",
    report.startsWith("Fit report: Drug A")
      && report.includes("Equation: Y=Bottom + (Top-Bottom)/(1+10^((LogIC50-X)*HillSlope))")
      && report.includes("  LogIC50 = -5 (typed)") && report.includes("  Top = 101.5 (from the model's rules)")
      && report.includes("Constraints\n  None") && report.includes("  Weighting: No weighting")
      && report.includes("  Confidence intervals: asymptotic (symmetrical), 95%")
      && report.includes("  LogIC50 = -6.983, SE 0.01471, 95% CI -7.013 to -6.953"),
    report.slice(0, 400).replace(/\n/g, " / "));
  await controls.getByLabel("LogIC50 start").fill("");
  await appears(fold.locator("tbody tr", { hasText: "LogIC50 -7" }), 60000);
  await controls.locator("details.initial-values > summary").click();
}

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

// --- P-14: pairwise comparisons of rows after an r x c test -------------
{
  // engine/tests/reference/pairwise_proportions.py: scipy per pair,
  // statsmodels multipletests("holm"); the plan's acceptance data
  await pastedTable("contingency", "Genotypes",
    "Genotype\tPositive\tNegative\nWT\t18\t2\nHet\t15\t5\nKO\t5\t15\n");
  await liveResults(/Chi-square/);
  await page.locator(".pane-controls").getByLabel("Correction").selectOption("holm");
  const table = page.locator(".pane-results .pairwise-table");
  const shown = await appears(table, 60000);
  const rows = shown ? (await table.locator("tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()) : [];
  expect("P-14 three comparisons with the test each used, raw and Holm-adjusted P",
    rows.length === 3
      && rows[0] === "WT vs. Het 0.9 vs. 0.75 Fisher's exact (an expected count below 5) 0.4075 0.4075 No"
      && rows[1] === "WT vs. KO 0.9 vs. 0.25 Chi-square with Yates' correction (every expected count 5 or more) 1.240e-4 3.719e-4 Yes"
      && rows[2] === "Het vs. KO 0.75 vs. 0.25 Chi-square with Yates' correction (every expected count 5 or more) 0.004427 0.008853 Yes",
    rows.join(" | "));
  const fam = await page.locator(".pane-results .pairwise-rows .family-line").first().innerText().catch(() => "");
  expect("P-14 the family line: 3 comparisons, Holm",
    fam.startsWith("P values adjusted for 3 comparisons (Holm): all pairs of 3 rows."), fam);
}

// --- P-47: compare two event rates ----------------------------------------
{
  // engine/tests/reference/event_rates.py: statsmodels test_poisson_2indep
  // (exact-cond) and the Clopper-Pearson interval of 23 / 64
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: "Compare two event rates…" }).click();
  const dlg = page.getByRole("dialog", { name: "Compare two event rates" });
  expect("P-47 the Analyze menu opens the rates calculator", await appears(dlg));
  await dlg.getByLabel("Exposure unit").fill("hours");
  await dlg.getByLabel("Events in group 1").fill("23");
  await dlg.getByLabel("Exposure of group 1").fill("10");
  await dlg.getByLabel("Events in group 2").fill("41");
  await dlg.getByLabel("Exposure of group 2").fill("12");
  const table = dlg.locator(".rates-table");
  await appears(table, 60000);
  const row = async (label) => (await table.locator("tr", { hasText: label }).first().innerText().catch(() => ""))
    .replace(/\s+/g, " ").trim();
  const ratio = await row("Rate ratio");
  expect("P-47 acceptance: rate ratio 0.6732 (0.3856 to 1.149)",
    ratio === "Rate ratio Group 1/Group 2 (exact conditional 95% CI) 0.6732 (0.3856 to 1.149)", ratio);
  const p = await row("P value, exact conditional test");
  expect("P-47 acceptance: exact P = 0.1335", p === "P value, exact conditional test (two-tailed) P = 0.1335", p);
  const r1 = await row("Rate of Group 1");
  expect("P-47 the exact CI of one rate: 2.3 per hour (1.458 to 3.451)",
    r1 === "Rate of Group 1 (per hour, exact 95% CI) 2.3 (1.458 to 3.451); 23 events in 10", r1);
  await dlg.getByRole("button", { name: "Done" }).click();
  // the palette finds it too
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("combobox", { name: "Find a command or sheet" });
  await palette.fill("event rates");
  const opt = page.getByRole("option", { name: /Compare two event rates/ });
  expect("P-47 Ctrl+K finds 'Compare two event rates…'", await appears(opt, 10000));
  await page.keyboard.press("Escape");
}

// --- P-19, P-20, P-51: fit models ----------------------------------------
{
  /** An XY table with one Y column from pasted text (X in column 1). */
  const xyFromText = async (name, text) => {
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
  const pickModel = async (search, option) => {
    await page.getByRole("button", { name: /^Model:/ }).click();
    await page.getByRole("combobox", { name: "Search models" }).fill(search);
    await page.getByRole("option", { name: option }).click();
  };
  const paramRow = async (label) => (await page.locator(".pane-results .results-table tbody tr")
    .filter({ has: page.locator("th", { hasText: new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`) }) })
    .first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();

  // P-19 acceptance: drc's ryegrass (engine/tests/fixtures/drc_datasets.json)
  // fitted with Weibull type 1; scipy reference engine/tests/reference/
  // weibull_hormesis.py: b 2.3933 (SE 0.4396), c 0.66045, d 7.8059,
  // e 3.6001, ED50 3.0889 (2.7232 to 3.4547), 24 points
  const rye = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "fixtures",
    "drc_datasets.json"), "utf8")).ryegrass;
  await xyFromText("Ryegrass", "conc\trootl\n"
    + rye.conc.map((c, i) => `${c}\t${rye.rootl[i]}`).join("\n") + "\n");
  await pickModel("weibull type 1", /Weibull type 1 \(W1\.4\), X is concentration/);
  const shown = await liveResults(/ED50/, 90000);
  const b = await paramRow("b");
  const ed50 = await paramRow("ED50 (M)");
  expect("P-19 acceptance: W1.4 on ryegrass, b = 2.393 (SE 0.4396)", shown && b.startsWith("b 2.393 0.4396"), b);
  expect("P-19 c, d and e: 0.6605, 7.806, 3.6",
    (await paramRow("c")).startsWith("c 0.6605 ") && (await paramRow("d")).startsWith("d 7.806 ")
      && (await paramRow("e")).startsWith("e 3.6 "),
    [await paramRow("c"), await paramRow("d"), await paramRow("e")].join(" | "));
  expect("P-19 ED50 3.089 with its CI 2.723 to 3.455", ed50 === "ED50 (M) 3.089 n/a 2.723 to 3.455", ed50);
  const n = await paramRow("# of points analyzed");
  const nPoints = (await page.locator(".pane-results tr", { hasText: "# of points analyzed" }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  expect("P-19 the zero-dose wells stay in: 24 points", nPoints === "# of points analyzed 24", nPoints || n);
  const fitNote = await page.locator(".pane-results .fit-note").first().innerText().catch(() => "");
  expect("P-19 the ED label: e is the inflection point, not the ED50",
    /e is the inflection point, not the ED50/.test(fitNote), fitNote.slice(0, 160));
  expect("P-19 the headline is the ED50", await answerText(/ED50/));

  // P-20 acceptance: a free fit with Bottom below 0, then Bottom > 0 with
  // its reason (engine/tests/reference/range_constraints.py: Bottom 0,
  // Top 99.2961, LogIC50 -6.90593, HillSlope -1.25189)
  const X = [-9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5];
  const ROWS = [[101.2, 98.4, 99.6], [97.9, 100.8, 96.5], [95.1, 92.3, 96.8], [84.0, 80.2, 86.9],
    [55.3, 60.8, 52.1], [24.7, 28.9, 21.6], [7.9, 3.1, 5.6], [-1.2, 2.4, -3.9], [-4.8, -1.1, -6.3]];
  await xyFromText("Negative bottom", "logX\tSignal\n"
    + X.flatMap((x, i) => ROWS[i].map((y) => `${x}\t${y}`)).join("\n") + "\n");
  await pickModel("inhibitor variable four", /log\(inhibitor\) vs\. response -- Variable slope \(four/);
  const controls = page.locator(".pane-controls");
  const logX = controls.getByLabel("X values are already log10(concentration)");
  if (!(await logX.isChecked())) await logX.check();
  await liveResults(/LogIC50/);
  await page.waitForFunction(() => /Bottom\s+-4\.402/.test(document.querySelector(
    '.pane-results[data-live="true"] .results-table')?.textContent ?? ""), null, { timeout: 60000 }).catch(() => {});
  expect("P-20 the free fit puts Bottom below 0: -4.402", (await paramRow("Bottom")).startsWith("Bottom -4.402"),
    await paramRow("Bottom"));
  await controls.locator(".constraint-row", { hasText: "Bottom = constant" }).locator('input[type="checkbox"]').check();
  await controls.getByRole("radio", { name: "Greater than" }).check();
  await controls.getByLabel("Bottom greater than").fill("0");
  await controls.getByLabel("Why Bottom cannot go past this").fill("signal cannot be negative");
  const bounded = await page.waitForFunction(() => /at its constraint: SE not reliable/.test(document.querySelector(
    '.pane-results[data-live="true"] .results-table')?.textContent ?? ""), null, { timeout: 60000 })
    .then(() => true, () => false);
  const bottom = await paramRow("Bottom");
  expect("P-20 acceptance: Bottom sits at 0 and its row says 'at its constraint: SE not reliable'",
    bounded && bottom === "Bottom 0 at its constraint: SE not reliable not reported (at its constraint)", bottom);
  expect("P-20 the other parameters: Top 99.3, LogIC50 -6.906, HillSlope -1.252",
    (await paramRow("Top")).startsWith("Top 99.3 ") && (await paramRow("LogIC50")).startsWith("LogIC50 -6.906 ")
      && (await paramRow("HillSlope")).startsWith("HillSlope -1.252 "),
    [await paramRow("Top"), await paramRow("LogIC50"), await paramRow("HillSlope")].join(" | "));
  const methods = await page.locator(".methods-text p").first().innerText().catch(() => "");
  expect("P-20 acceptance: the methods sentence states the constraint and its reason",
    methods.includes("(constraining Bottom > 0, stated reason: signal cannot be negative)"), methods.slice(0, 200));

  // P-51: simulate from a user-defined equation saved in the library; the
  // ideal column equals 100·exp(-0.3·X) (engine/tests/
  // test_simulate_user_equation.py checks it against the compiled equation)
  await pickModel("own equation", /Enter your own equation/);
  const eqDlg = page.getByRole("dialog", { name: "User-defined equation" });
  await eqDlg.getByLabel("Name").fill("Decay");
  await eqDlg.getByLabel("Equation", { exact: true }).fill("Y = A*exp(-k*X)");
  await eqDlg.getByText("Equation is valid").waitFor({ timeout: 30000 });
  await eqDlg.getByRole("button", { name: /Save to my equations/ }).click();
  await eqDlg.getByRole("button", { name: "Cancel" }).click();
  await fileMenu("New data table…");
  await page.getByRole("button", { name: "Simulate data…" }).click();
  const sim = page.locator(".simulate-dialog");
  await sim.getByLabel("Model", { exact: true }).selectOption({ label: "Decay" });
  await sim.getByLabel("A", { exact: true }).fill("100");
  await sim.getByLabel("k", { exact: true }).fill("0.3");
  await sim.getByLabel("First X").fill("0");
  await sim.getByLabel("Step").fill("0.5");
  await sim.getByLabel("Last X").fill("5");
  await sim.getByLabel("Replicates").fill("1");
  await sim.getByLabel("Kind").selectOption("none");
  await sim.getByLabel(/ideal values/).check();
  await sim.getByLabel("Table name").fill("Simulated decay");
  await sim.getByLabel("Random seed").fill("7");
  await sim.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".origin-note", { timeout: 30000 });
  const cells = await page.evaluate(() => [...document.querySelectorAll(".data-table input")]
    .filter((i) => /\(ideal\), Y1, row \d+$/.test(i.getAttribute("aria-label") ?? ""))
    .map((i) => Number(i.value)));
  const want = Array.from({ length: 11 }, (_, i) => 100 * Math.exp(-0.3 * i * 0.5));
  expect("P-51 acceptance: the ideal column equals A·exp(-k·X) at all 11 X values",
    cells.length === 11 && cells.every((v, i) => Math.abs(v - want[i]) <= 1e-9 * want[i]), cells.join(", "));
  const origin = await page.locator(".origin-note").first().innerText().catch(() => "");
  expect("P-51 the table's note names the equation",
    origin.includes("the user-defined equation “Decay” (Y = A*exp(-k*X))"), origin.slice(0, 200));
  const refit = await liveResults(/\bk\b/, 90000);
  const kRow = await paramRow("k");
  expect("P-51 its curve fit uses the same equation and recovers k = 0.3",
    refit && kRow.startsWith("k 0.3 "), kRow);
}

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
expect("no page errors", errors.length === 0, `${errors.length}`);
console.log(fail.length ? `\nFAILURES (${fail.length}):\n${fail.join("\n")}` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
