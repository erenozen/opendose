// End-to-end checks of the results honesty features (FEATURE-PLAN wave 1):
// residual plots for curve fits and ANOVA models in the Checks row (P-11),
// the smallest P a rank test can reach (P-15), the "Analysed" line of
// regression, Cox and contingency results (P-16) and the ratio to control
// with its Fieller CI (P-18); and the tests of wave 1: equivalence (P-12),
// comparing regression lines (P-13), pairs of rows of a contingency table
// (P-14) and two event rates (P-47); and the fit models of wave 1: Weibull
// and hormesis models (P-19), range constraints (P-20), initial values and
// the fit report (P-21) and simulating a user-defined equation (P-51); the
// fit summary and its table of parameters (P-17); interpolated unknowns
// with their CIs (P-22); method comparison and reliability:
// Passing-Bablok (P-42), Lin's CCC (P-43) and the reliability ICC (P-44);
// quasi-Poisson (P-46), partial and compared correlations (P-48), the
// survival difference at a chosen time (P-28) and the references behind
// a Normalize (P-57); the general linear mixed model on a long table
// (P-87); interaction contrasts in RM designs and custom contrasts (P-83).
// Each number asserted here is pinned in the engine tests from an
// independent reference (engine/tests/reference/).
// Usage: node scripts/e2e-results.mjs [http://localhost:5173/]
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  // the label wraps the select, so its name includes the options: find it by its caption
  const simSelect = (caption) => sim.locator("label.field")
    .filter({ has: page.locator("span", { hasText: new RegExp(`^${caption}$`) }) }).locator("select");
  await simSelect("Model").selectOption({ label: "Decay" });
  await sim.getByLabel("A", { exact: true }).fill("100");
  await sim.getByLabel("k", { exact: true }).fill("0.3");
  await sim.getByLabel("First X", { exact: true }).fill("0");
  await sim.getByLabel("Step", { exact: true }).fill("0.5");
  await sim.getByLabel("Last X", { exact: true }).fill("5");
  await sim.getByLabel("Replicates", { exact: true }).fill("1");
  await simSelect("Kind").selectOption("none");
  await sim.getByLabel(/ideal values/).check();
  await sim.getByLabel("Table name", { exact: true }).fill("Simulated decay");
  await sim.getByLabel("Random seed").fill("7");
  await sim.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".origin-note", { timeout: 30000 });
  const cells = await page.evaluate(() => [...document.querySelectorAll(".data-table input")]
    .filter((i) => /\(ideal\)(, Y1)?, row \d+$/.test(i.getAttribute("aria-label") ?? ""))
    .map((i) => Number(i.value)));
  const want = Array.from({ length: 11 }, (_, i) => 100 * Math.exp(-0.3 * i * 0.5));
  expect("P-51 acceptance: the ideal column equals A·exp(-k·X) at all 11 X values",
    cells.length === 11 && cells.every((v, i) => Math.abs(v - want[i]) <= 1e-9 * want[i]), cells.join(", "));
  await page.locator(".origin-note").getByRole("button", { name: "Methods" }).click();
  const origin = await page.locator(".origin-note").first().innerText().catch(() => "");
  expect("P-51 the table's note names the equation",
    origin.includes("the user-defined equation “Decay” (Y = A*exp(-k*X))"), origin.slice(0, 200));
  const refit = await liveResults(/\bk\b/, 90000);
  const kRow = await paramRow("k");
  expect("P-51 its curve fit uses the same equation and recovers k = 0.3",
    refit && kRow.startsWith("k 0.3 "), kRow);
}

// --- P-40: Mauchly, Huynh-Feldt and partial omega squared in RM ANOVA ----
{
  // engine/tests/reference/rm_sphericity.py (pingouin 0.7): GG 0.3897,
  // HF 0.4125, Mauchly W = 0.01253, P = 3.3e-6, HF P = 1.444e-4,
  // partial omega squared 0.5257
  await pastedTable("column", "RM 10 x 4", "Vehicle\tLow\tMid\tHigh\n"
    + "12.1\t14.3\t15.0\t19.8\n10.4\t11.9\t13.7\t14.2\n13.8\t15.1\t18.2\t24.9\n"
    + "9.7\t10.2\t12.5\t13.1\n11.2\t13.8\t14.1\t20.3\n12.9\t13.5\t16.8\t17.0\n"
    + "10.8\t12.7\t13.2\t21.6\n14.2\t15.9\t17.4\t18.1\n11.5\t12.0\t15.3\t22.7\n"
    + "13.1\t14.6\t16.0\t16.4\n");
  await page.locator(".pane-controls select.analysis-select").selectOption("rm_anova");
  await liveResults(/Mauchly's test of sphericity/);
  const row = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const [gg, hf, phf, mau] = [await row("Geisser-Greenhouse epsilon"),
    await row("Huynh-Feldt epsilon"), await row("P (Huynh-Feldt corrected)"),
    await row("Mauchly's test of sphericity")];
  expect("P-40 typeset table: GG ε 0.3897, HF ε 0.4125 (Lecoutre), HF P 1.444e-4, Mauchly W 0.01253 (P < 0.0001)",
    gg === "Geisser-Greenhouse epsilon 0.3897" && hf === "Huynh-Feldt epsilon (Lecoutre) 0.4125"
      && phf === "P (Huynh-Feldt corrected) 1.444e-4"
      && mau === "Mauchly's test of sphericity W = 0.01253, P < 0.0001", [gg, hf, phf, mau].join(" | "));
  await openChecks();
  await page.locator(".pane-answer").getByRole("button", { name: /Sphericity: ε = 0\.39/ }).click();
  const chip = await page.getByRole("region", { name: "Sphericity: ε = 0.39" }).innerText().catch(() => "");
  expect("P-40 acceptance: the sphericity chip lists GG ε, HF ε and Mauchly's W with P",
    chip.includes("GG ε = 0.39, HF ε = 0.412, Mauchly's W = 0.0125, P < 0.0001")
      && chip.includes("Mauchly's test is reported, not used to choose the correction")
      && chip.includes("Lecoutre 1991"), chip.slice(0, 300));
  const omega = await page.locator(".pane-results tr", { hasText: "Partial ω²" }).first()
    .evaluate((el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
  expect("P-40 acceptance: the effect-size block adds partial ω² = 0.5257, without a CI",
    /^Partial ω²\s*0\.5257\s*(n\/a|—)?/.test(omega) && !/to/.test(omega), omega);
}

// --- P-41: trend across ordered columns (Jonckheere-Terpstra, Page) -------
{
  // engine/tests/reference/ordered_trend.py: 4 doses x 5, no ties: J = 140
  // of a possible 150, E = 75, SD 14.86, exact two-sided P 8.9e-7
  await pastedTable("column", "Four doses", "0 mg/kg\t1 mg/kg\t3 mg/kg\t10 mg/kg\n"
    + "41.2\t43.1\t47.3\t50.2\n38.5\t45.6\t44.4\t47.7\n44.0\t40.8\t49.8\t52.6\n"
    + "39.7\t46.2\t46.9\t49.1\n42.3\t44.9\t48.1\t53.4\n");
  const controls = page.locator(".pane-controls");
  // the "Type" select sits in a label whose text includes its options
  const typeSelect = () => controls.locator("label.check-row", {
    has: page.locator("span", { hasText: /^Type$/ }) }).locator("select");
  await controls.locator("select.analysis-select").selectOption("anova");
  await typeSelect().selectOption("nonparametric");
  await controls.getByLabel("Jonckheere-Terpstra test for trend across ordered columns").check();
  const hint = await controls.locator(".hint-block", { hasText: "Tested in the order of the columns" })
    .innerText().catch(() => "");
  expect("P-41 the controls name the order tested (the dose order is the hypothesis)",
    hint.includes("first to last: 0 mg/kg, then 1 mg/kg, then 3 mg/kg, then 10 mg/kg"), hint);
  await liveResults(/Jonckheere-Terpstra J/);
  const row = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const head = await page.locator(".pane-results h4", { hasText: "Trend across ordered columns" })
    .count();
  const [j, e, p2] = [await row("Jonckheere-Terpstra J"), await row("Expected under no trend"),
    await row("P value, two-sided")];
  expect("P-41 acceptance: “Trend across ordered columns” with J = 140 (E 75, SD 14.86) and exact P < 0.0001",
    head === 1 && j === "Jonckheere-Terpstra J 140" && e === "Expected under no trend (SD) 75 (14.86)"
      && p2 === "P value, two-sided (exact) < 0.0001", [j, e, p2].join(" | "));
  // Hicks (2009) teaching methods, published L = 133.5; exact P given the
  // ties 3.842e-4 one-sided (full enumeration of 1.9 million tables)
  await pastedTable("column", "Teaching methods", "Tutorial\tLecture\tSeminar\n"
    + "3\t4\t3\n2\t2\t4\n3\t3\t5\n1\t3\t2\n2\t3\t2\n2\t4\t5\n1\t2\t4\n3\t4\t4\n2\t4\t5\n1\t3\t4\n");
  await controls.locator("select.analysis-select").selectOption("rm_anova");
  await typeSelect().selectOption("nonparametric");
  await controls.getByLabel("Page's test for trend across ordered treatments").check();
  await liveResults(/Page's L/);
  const [l, inc, two] = [await row("Page's L"), await row("P value, one-sided: increasing"),
    await row("P value, two-sided")];
  expect("P-41 acceptance: the Friedman results gain a Page line, L = 133.5 (published), P 3.842e-4 one-sided",
    l === "Page's L 133.5" && inc === "P value, one-sided: increasing 3.842e-4"
      && two === "P value, two-sided (exact, given the ties) 7.684e-4", [l, inc, two].join(" | "));
}

// --- P-45: Cochran's Q with pairwise McNemar tests ------------------------
{
  // engine/tests/reference/cochran_q.py (statsmodels cochrans_q and
  // mcnemar(exact=True), Holm): Q = 11.56, df = 2, P = 0.0031; A vs C
  // Holm P 0.0234
  await pastedTable("column", "Three stains", "Stain A\tStain B\tStain C\n"
    + "1\t1\t0\n1\t0\t0\n1\t1\t1\n0\t0\t0\n1\t1\t0\n1\t0\t0\n"
    + "1\t1\t0\n1\t1\t1\n0\t1\t0\n1\t0\t0\n1\t1\t0\n1\t1\t0\n");
  const controls = page.locator(".pane-controls");
  await controls.locator("select.analysis-select").selectOption("cochran_q");
  await liveResults(/Cochran's Q/);
  const row = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const [q, df, p] = [await row("Cochran's Q"), await row("df"), await row("P value (chi-square)")];
  expect("P-45 acceptance: Q = 11.56, df = 2, P = 0.003096 for 12 subjects under three stains",
    q === "Cochran's Q 11.56" && df === "df 2" && p === "P value (chi-square) 0.003096 **",
    [q, df, p].join(" | "));
  const fam = await page.locator(".pane-results .family-line").first().innerText().catch(() => "");
  const ac = await row("Stain A vs. Stain C");
  expect("P-45 acceptance: three Holm-adjusted McNemar comparisons, A vs C 8/0 discordant, P 0.02344 (0.007813 unadjusted)",
    /3 comparisons/.test(fam) && /Holm/.test(fam)
      && ac === "Stain A vs. Stain C 8, 0 0.6667 0.02344 0.007813 *", `${fam} / ${ac}`);
  // a 2 in the 0/1 layout is named, not analysed
  await pastedTable("column", "Not binary", "Stain A\tStain B\tStain C\n1\t0\t2\n0\t1\t1\n1\t1\t0\n");
  await controls.locator("select.analysis-select").selectOption("cochran_q");
  const named = await page.waitForFunction(() => /row 1 of Stain C holds 2\. Enter one subject per row/
    .test(document.body.innerText), null, { timeout: 60000 }).then(() => true, () => false);
  expect("P-45 a value other than 0 or 1 is named with its row and column", named);
}

// --- P-27: repeated-measures correlation ----------------------------------
{
  // engine/tests/reference/rm_corr.py: Bland & Altman 1995, 47 pH / PaCO2
  // pairs of 8 subjects; pingouin rm_corr r = -0.5068, df = 38, P 8.471e-4,
  // 95% CI -0.71 to -0.23 (engine -0.7067 to -0.2319)
  const ref = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/rm_corr.json"), "utf8"));
  await pastedTable("column", "pH and PaCO2", "pH\tPaCO2\tSubject\n"
    + ref.x.map((x, i) => `${x}\t${ref.y[i]}\t${ref.subject[i]}`).join("\n") + "\n");
  const controls = page.locator(".pane-controls");
  await controls.locator("select.analysis-select").selectOption("correlation");
  await liveResults(/Correlation: pH vs\. PaCO2/);
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: /Subjects ignored/ });
  expect("P-27 a chip says the Subject column is ignored by the plain correlation", await appears(chip));
  await controls.getByRole("combobox", { name: "Subject" }).selectOption("d2");
  await liveResults(/Repeated-measures correlation: pH vs\. PaCO2/);
  const row = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const [r, ci, df, p] = [await row("Repeated-measures r"), await row("CI of r_rm"),
    await row("df"), await row("P value (two-tailed)")];
  expect("P-27 acceptance: rm-corr r = -0.5068, its 95% CI -0.7067 to -0.2319 and df = 38",
    r === "Repeated-measures r (r_rm) -0.5068" && ci === "95% CI of r_rm (Fisher z) -0.7067 to -0.2319"
      && df === "df 38" && p === "P value (two-tailed) 8.471e-4 ***", [r, ci, df, p].join(" | "));
  const scope = await page.locator(".pane-results .model-line", { hasText: "Within subjects only" })
    .first().innerText().catch(() => "");
  expect("P-27 the results say rm-corr measures the within-subject association only",
    /does not say whether subjects with higher pH have higher PaCO2/.test(scope), scope);
  expect("P-27 with the Subject role set, the chip is gone",
    await page.locator(".pane-answer").getByRole("button", { name: /Subjects ignored/ }).count() === 0);
}

// --- P-42, P-43, P-44: method comparison and reliability ---------------
const methodRow = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
  .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const analyzeWith = async (re) => {
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: re }).click();
};
{
  // engine/tests/reference/method_regression.py: Giavarina (2015) Table 1;
  // the article prints y = 7.08 (-0.30 to 19.84) + 1.06 (1.02 to 1.09) x
  const ref = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/method_regression.json"), "utf8"));
  const g = ref.giavarina;
  await pastedTable("xy", "Giavarina", "Method A\tMethod B\n"
    + g.x.map((x, i) => `${x}\t${g.y[i]}`).join("\n") + "\n");
  await analyzeWith(/^Passing-Bablok regression/);
  await liveResults(/Passing-Bablok regression: Method B vs Method A/);
  const [pb, ts, dm, cusum] = [await methodRow("Passing-Bablok"), await methodRow("Theil-Sen"),
    await methodRow("Deming"), await methodRow("CUSUM")];
  expect("P-42 acceptance: Passing-Bablok slope 1.055 (1.02 to 1.091), intercept 7.082 (-0.3049 to 19.84)",
    pb === "Passing-Bablok 1.055 1.02 to 1.091 7.082 -0.3049 to 19.84", pb);
  expect("P-42 Theil-Sen beside it: slope 1.052 (1.017 to 1.091), intercept 8.231 without a CI",
    ts === "Theil-Sen 1.052 1.017 to 1.091 8.231 not defined", ts);
  expect("P-42 Deming beside it", /^Deming \(equal error variances\) 1\.046 /.test(dm), dm);
  expect("P-42 the CUSUM test: H = 1.25, P = 0.08787, linear",
    cusum === "Linearity (CUSUM test) H = 1.25, P = 0.08787: no significant deviation from linearity", cusum);
  expect("P-42 headline: the Passing-Bablok slope with its CI",
    await answerText(/Passing-Bablok slope\s*1\.055\s*95% CI 1\.02 to 1\.091/));
  expect("P-42 the graph draws the line of identity, the pairs and the Passing-Bablok line",
    await page.locator(".plot .scatterlayer .trace").count() === 3);
  // P-43 in Deming: CCC 0.9915 (0.9836 to 0.9956), engine/tests/reference/lin_ccc.py
  await analyzeWith(/^Deming regression/);
  await liveResults(/concordance correlation/);
  const dccc = `${await methodRow("concordance correlation")} | ${await methodRow("CI of the CCC")}`;
  expect("P-43 Deming results carry Lin's CCC 0.9915 (95% CI 0.9836 to 0.9956)",
    dccc === "Lin's concordance correlation (CCC) 0.9915 | 95% CI of the CCC 0.9836 to 0.9956", dccc);

  // Bland-Altman on the ejection fractions (the template's data), its CCC
  // (P-43 acceptance) and the link to Passing-Bablok of the same columns
  const e = ref.ejection;
  await pastedTable("column", "Ejection", "RV\tIC\n" + e.x.map((x, i) => `${x}\t${e.y[i]}`).join("\n") + "\n");
  await analyzeWith(/^Bland-Altman/);
  await liveResults(/concordance correlation/);
  const bccc = `${await methodRow("concordance correlation")} | ${await methodRow("CI of the CCC")}`;
  expect("P-43 acceptance: Bland-Altman results carry Lin's CCC 0.6614 (95% CI 0.509 to 0.7736)",
    bccc === "Lin's concordance correlation (CCC) 0.6614 | 95% CI of the CCC 0.509 to 0.7736", bccc);
  expect("P-43 the CCC caveat sits beside it",
    await liveResults(/The CCC mixes precision and accuracy: Pearson's r 0\.7325 \(precision\)/));
  await page.getByRole("button", { name: "Passing-Bablok regression of these two columns" }).click();
  await liveResults(/Passing-Bablok regression: IC vs RV/);
  const epb = await methodRow("Passing-Bablok");
  expect("P-42 the Bland-Altman link fits Passing-Bablok of IC on RV: 0.9941 (0.7683 to 1.209)",
    epb === "Passing-Bablok 0.9941 0.7683 to 1.209 -0.55 -1.563 to 0.581", epb);
}
{
  // P-44: Shrout & Fleiss (1979), 6 targets x 4 judges; printed .17, .29,
  // .71, .44, .62, .91; CIs McGraw & Wong (engine/tests/reference/icc_reliability.py)
  const ref = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/icc_reliability.json"), "utf8"));
  await pastedTable("column", "Shrout-Fleiss", "Judge 1\tJudge 2\tJudge 3\tJudge 4\n"
    + ref.shrout_fleiss.matrix.map((r) => r.join("\t")).join("\n") + "\n");
  await analyzeWith(/^Agreement \(ICC\)/);
  await liveResults(/Intraclass correlation: 6 targets, 4 raters/);
  const want = {
    "ICC(1,1)": "0.1657 -0.1329 to 0.7226", "ICC(2,1)": "0.2898 0.01879 to 0.7611",
    "ICC(3,1)": "0.7148 0.3425 to 0.9459", "ICC(1,4)": "0.4428 -0.8844 to 0.9124",
    "ICC(2,4)": "0.6201 0.07114 to 0.9272", "ICC(3,4)": "0.9093 0.6757 to 0.9859",
  };
  const got = {};
  for (const k of Object.keys(want)) got[k] = await methodRow(k);
  expect("P-44 acceptance: all six ICCs with McGraw-Wong CIs (Shrout & Fleiss: .17 .29 .71 .44 .62 .91)",
    Object.entries(want).every(([k, v]) => got[k].startsWith(k) && got[k].endsWith(v)),
    Object.values(got).join(" | "));
  const [f1, f2] = [await methodRow("One-way forms"), await methodRow("Two-way forms")];
  expect("P-44 the F tests of ICC = 0: F(5, 18) = 1.795 and F(5, 15) = 11.03",
    f1 === "One-way forms F(5, 18) = 1.795, P = 0.1648"
      && f2 === "Two-way forms F(5, 15) = 11.03, P = 1.346e-4", `${f1} | ${f2}`);
  expect("P-44 the default form ICC(2,1) leads", /^ICC\(2,1\) \(chosen\)/.test(got["ICC(2,1)"])
    && await answerText(/ICC\(2,1\)\s*0\.2898\s*95% CI 0\.01879 to 0\.7611/), got["ICC(2,1)"]);
  await page.locator(".pane-controls").getByLabel("ICC form").selectOption("ICC3");
  expect("P-44 choosing ICC(3,1) moves the headline and its explainer",
    await answerText(/ICC\(3,1\)\s*0\.7148\s*95% CI 0\.3425 to 0\.9459/)
      && /constant offset between them does not matter/.test(await page.locator(".pane-controls").innerText()));
}

// --- P-17: the fit summary above the cards and the table of parameters ----
{
  // engine/tests/reference/fit_summary_12.py: twelve compounds, one 4PL each;
  // Compound L never reaches its bottom plateau (IC50 > 30 µM)
  const FX = JSON.parse(readFileSync(join(here, "../src/sheets/xy/__tests__/fitSummary.fixture.json"), "utf8"));
  const sig4 = (v) => (Math.abs(v) < 1e-3 ? v.toExponential(3) : String(Number(v.toPrecision(4))));
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  pg.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  await pg.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  await pg.keyboard.press("Escape");
  await pg.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "fit-summary-12.json"));
  const summary = pg.locator('.pane-results[data-live="true"] .fit-summary-table');
  expect("P-17 a typeset summary table sits above the per-curve cards", await appears(summary, 120000));
  const rows = summary.locator("tbody tr");
  const n = await rows.count();
  expect("P-17 acceptance: the summary lists 12 rows, one per compound", n === 12, String(n));
  const cell = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
  const mismatched = [];
  for (let i = 0; i < n; i++) {
    const name = await cell(rows.nth(i).locator("th"));
    const tds = rows.nth(i).locator("td");
    const card = pg.locator(".pane-results .result-card").filter({ has: pg.locator("h3", { hasText: new RegExp(`^${name}`) }) })
      .filter({ hasNot: pg.locator(".fit-summary-table") }).first();
    const cardRow = async (label) => cell(card.locator("tbody tr").filter({ has: pg.locator(`th:text-is("${label}")`) }).first());
    const want = [`IC50 (µM) ${await cell(tds.nth(0))} n/a ${await cell(tds.nth(1))}`,
      `HillSlope ${await cell(tds.nth(2))}`, `Top ${await cell(tds.nth(3))}`, `Bottom ${await cell(tds.nth(4))}`];
    const got = [await cardRow("IC50 (µM)"), await cardRow("HillSlope"), await cardRow("Top"), await cardRow("Bottom")];
    if (!want.every((w, k) => got[k].startsWith(w))) mismatched.push(`${name}: ${want.join(" | ")} vs ${got.join(" | ")}`);
    if (await cell(tds.nth(5)) !== await cardRow("R squared").then((t) => t.replace("R squared ", ""))) mismatched.push(`${name} R²`);
  }
  expect("P-17 each summary row equals its data set's card (IC50, CI, HillSlope, Top, Bottom, R²)",
    mismatched.length === 0, mismatched.slice(0, 2).join("; "));
  const a = FX.result.datasets[0].fit.params.IC50.value;
  expect(`P-17 Compound A's IC50 reads ${sig4(a)} µM (the engine's value)`,
    await cell(rows.nth(0).locator("td").nth(0)) === sig4(a), await cell(rows.nth(0).locator("td").nth(0)));
  const lRow = await cell(rows.nth(11));
  const reasons = await cell(pg.locator(".fit-summary-reasons"));
  expect("P-17 acceptance: the incomplete compound is flagged Extrapolated with its reason",
    lRow.startsWith("Compound L > 30 (not reached in the range tested)") && lRow.endsWith(" Extrapolated")
    && reasons.startsWith("Compound L, extrapolated: IC50 > 30 µM (not reached in the range tested): ")
    && reasons.includes("the bottom plateau is not defined by the data"), `${lRow} | ${reasons.slice(0, 300)}`);
  const others = [];
  for (let i = 0; i < 11; i++) others.push((await cell(rows.nth(i).locator("td").last())));
  expect("P-17 the eleven complete curves carry no flag", others.every((t) => t === "None"), others.join(","));
  await pg.locator(".fit-summary").getByLabel("Sort rows by").selectOption({ label: "IC50 (µM), highest first" });
  const order = await summary.locator("tbody th").allInnerTexts();
  const byIc = FX.result.datasets.map((d) => d.name)
    .sort((x, y) => FX.result.datasets.find((d) => d.name === y).fit.params.IC50.value
      - FX.result.datasets.find((d) => d.name === x).fit.params.IC50.value);
  expect("P-17 sorting by IC50, highest first, orders the rows by the fitted IC50",
    order.join(",") === byIc.join(",")
    && await summary.locator('th[aria-sort="descending"]').innerText() === "IC50 (µM)", order.join(","));
  await pg.getByRole("button", { name: "Make a table of parameters" }).click();
  await pg.waitForSelector(".grid-toolbar", { timeout: 30000 });
  const sel = await pg.locator('[role=treeitem][aria-selected="true"]').first().getAttribute("aria-label");
  expect("P-17 acceptance: \"Make a table of parameters\" makes the linked table and selects it",
    (sel ?? "").startsWith("Parameters of Twelve compounds"), sel);
  const titles = [];
  for (let r = 1; r <= 12; r++) titles.push(await pg.locator(`.data-table input[aria-label="Row ${r} title"]`).inputValue());
  const ic = [];
  for (let r = 1; r <= 12; r++) ic.push(await pg.locator(`.data-table input[aria-label="IC50 (µM), row ${r}"]`).inputValue());
  expect("P-17 the linked table has the same 12 rows",
    titles.join(",") === FX.result.datasets.map((d) => d.name).join(","), titles.join(","));
  expect("P-17 its IC50 column holds each fitted IC50, empty for Compound L (reported as > 30 µM)",
    // the browser engine's BLAS differs from the fixture's in the last bits
    ic.slice(0, 11).every((v, i) => Math.abs(Number(v) / FX.result.datasets[i].fit.params.IC50.value - 1) < 1e-9)
    && ic[11] === "",
    ic.join(","));
  await pg.close();
}


// --- P-22: interpolated unknowns with their CIs ---------------------------
{
  // engine/tests/reference/interpolate_unknowns.py: a BCA standard curve
  // (7 standards, quadratic, statsmodels OLS) and investr's inversion
  // intervals computed independently; X, CI and prediction interval
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/interpolate_unknowns.json"), "utf8"));
  const sig4 = (v) => (Math.abs(v) < 1e-3 ? v.toExponential(3) : String(Number(v.toPrecision(4))));
  const proj = JSON.parse(readFileSync(join(here, "..", "e2e-fixtures", "stage", "interpolation.json"), "utf8"));
  proj.sheets.find((s) => s.kind === "results").options.interpolateUnknowns = false;
  const file = join(mkdtempSync(join(tmpdir(), "opendose-interp-")), "bca.json");
  writeFileSync(file, JSON.stringify(proj));
  const pg = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  pg.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  await pg.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  await pg.keyboard.press("Escape");
  await pg.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', file);
  await pg.waitForFunction(() => /Second order polynomial/.test(
    document.querySelector('.pane-results[data-live="true"]')?.textContent ?? ""), null, { timeout: 120000 });
  expect("P-22 off by default: no unknowns table",
    await pg.locator(".interpolation-table").count() === 0);
  const adv = pg.locator(".pane-controls details.advanced").first();
  if (!(await adv.evaluate((e) => e.open))) await adv.locator("summary").click();
  await pg.getByRole("checkbox", { name: "Y values in rows with no X are unknowns" }).check();
  const table = pg.locator('.pane-results[data-live="true"] .interpolation-table');
  expect("P-22 ticking the option shows the interpolated unknowns", await appears(table, 120000));
  const rowText = async (i) => (await table.locator("tbody tr").nth(i).innerText()).replace(/\s+/g, " ").trim();
  const want = REF.bca.results.slice(0, 3).map((u, i) => `Lysate ${i + 1} ${u.y} ${sig4(u.x)} `
    + `${sig4(u.ci[0])} to ${sig4(u.ci[1])} ${sig4(u.pi[0])} to ${sig4(u.pi[1])} None`);
  const got = [await rowText(0), await rowText(1), await rowText(2)];
  expect(`P-22 acceptance: each unknown's X with its 95% CI (${want.join(" | ")})`,
    got.every((g, i) => g === want[i]), got.join(" | "));
  const plotted = await pg.evaluate(() => {
    const t = (document.querySelector(".plot-card .plot")?.data ?? [])
      .find((d) => String(d.name ?? "").endsWith("(unknowns)"));
    return t ? { x: [...t.x], y: [...t.y] } : null;
  });
  expect("P-22 acceptance: three markers on the curve, at each unknown's X and Y",
    plotted?.x.length === 3 && plotted.x.every((x, i) => Math.abs(x / REF.bca.results[i].x - 1) < 1e-6)
    && plotted.y.every((y, i) => y === REF.bca.results[i].y), JSON.stringify(plotted));
  // typed Y values beyond the standards: flagged, never a plain number
  const typed = pg.getByRole("textbox", { name: "Interpolate unknowns from the curve" });
  await typed.fill(REF.bca.edges.join(", "));
  await pg.waitForFunction(() => document.querySelectorAll(
    '.pane-results[data-live="true"] .interpolation-table tbody tr').length === 6, null, { timeout: 60000 }).catch(() => {});
  const [up, down, none] = [await rowText(3), await rowText(4), await rowText(5)];
  const [ru, rd] = REF.bca.results.slice(3);
  expect(`P-22 Y above the top standard: X ${sig4(ru.x)} flagged extrapolated`,
    up.startsWith(`Typed Y 1 1.55 ${sig4(ru.x)} ${sig4(ru.ci[0])} to ${sig4(ru.ci[1])}`)
    && up.includes("Extrapolated: X lies outside the standards (0 to 2000)"), up);
  expect(`P-22 Y below the blank: X ${sig4(rd.x)} flagged extrapolated`,
    down.startsWith(`Typed Y 2 0.05 ${sig4(rd.x)}`) && down.includes("Extrapolated:"), down);
  expect("P-22 a Y the curve never reaches has no X",
    none === "Typed Y 3 3 — — — Not reached: Y is above every value the curve takes, so it has no X.", none);
  await pg.close();
}

// --- P-46: quasi-Poisson for overdispersed counts --------------------------
{
  // engine/tests/reference/quasi_poisson.py (statsmodels GLM Poisson,
  // scale="X2", use_t=True): Ames TA98 revertants (Margolin et al. 1981),
  // phi = 3.085 on 15 df; SE of log(Dose + 10) 0.05700 (Poisson) grows to
  // 0.1001, P 0.006030; F(2, 15) = 5.615, P 0.01512
  const ref = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/quasi_poisson.json"), "utf8"));
  await pastedTable("multivariable", "Ames TA98", "Dose\tlog(Dose + 10)\tRevertants\n"
    + ref.data.dose.map((d, i) => `${d}\t${ref.data.log_dose_plus_10[i]}\t${ref.data.revertants[i]}`).join("\n")
    + "\n");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Poisson regression/ }).click();
  await liveResults(/Poisson regression of Revertants/);
  const row = async (label) => (await page.locator(".pane-results tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const before = await row("log(Dose + 10)");
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: "Check: Counts are overdispersed (φ = 3.085)" });
  expect("P-46 acceptance: the Checks chip says the counts are overdispersed (φ = 3.085)", await appears(chip));
  await chip.click();
  await page.locator(".pane-answer").getByRole("button", { name: "Use quasi-Poisson standard errors" }).click();
  await liveResults(/Quasi-Poisson regression of Revertants/);
  const after = await row("log(Dose + 10)");
  const seOf = (text) => Number(text.split(" ")[5]);
  expect("P-46 acceptance: the SE of log(Dose + 10) grows by √φ = 1.756 (0.057 to 0.1001), |t| 3.195, P 0.00603",
    /^β2: log\(Dose \+ 10\) 0\.3198 0\.057 /.test(before)
      && after === "β2: log(Dose + 10) 0.3198 0.1001 0.1064 to 0.5332 3.195 0.00603 ** 1.377 1.112 to 1.704",
    `${before} → ${after} (ratio ${(seOf(after) / seOf(before)).toFixed(3)})`);
  const fTest = (await page.locator(".pane-results .mv-kv", { hasText: "F test (vs intercept only)" }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  expect("P-46 the overall test is F(2, 15) = 5.615, P 0.01512 (no AICc under quasi-Poisson)",
    fTest === "F test (vs intercept only) F 5.615 Degrees of freedom 2, 15 P value 0.01512 *"
      && !(await page.locator(".pane-results").innerText()).includes("AICc, this model"), fTest);
  const methods = await page.locator(".methods-text p").first().innerText().catch(() => "");
  expect("P-46 acceptance: the methods name quasi-Poisson and φ = 3.085",
    /modeled by quasi-Poisson regression/.test(methods) && /φ = Pearson χ² \/ df = 3\.085/.test(methods)
      && /F\(2, 15\) = 5\.615/.test(methods), methods.slice(0, 200));
  // P-69: "What this means" puts the rate ratio and its CI in words, the
  // numbers of the coefficient's row, with the extra variance said
  const meaningText = (await page.locator(".pane-answer .meaning-sentence").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  const mm = /multiplies the rate of Revertants by (\S+) \(rate ratio \1, 95% CI (\S+) to (\S+)\)(?:, holding .+? constant)?; the CI and P allow for a variance 3\.085 times the Poisson variance \(quasi-likelihood\)/.exec(meaningText);
  const tableText = (await page.locator(".pane-results").innerText()).replace(/\s+/g, " ");
  expect("P-69 acceptance: the meaning reports the rate ratio with its CI in words, as its row shows them",
    !!mm && tableText.includes(`${mm[1]} ${mm[2]} to ${mm[3]}`), meaningText);
  const okChip = page.locator(".pane-answer").getByRole("button", { name: "OK: Quasi-Poisson SEs (φ = 3.085)" });
  expect("P-46 the chip now says quasi-Poisson is in use and offers the way back", await appears(okChip));
}

// --- P-48: partial correlation and comparing two correlations -------------
{
  // engine/tests/reference/partial_compare_corr.py: pingouin.partial_corr
  // (controlling for Age), Fisher z by hand, Steiger (1980) Z by hand
  const ref = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/partial_compare_corr.json"), "utf8"));
  const sig = (v) => String(Number(v.toPrecision(4)));
  const t = ref.table;
  const vars = ["Age", "SBP", "BMI", "Cholesterol"];
  await pastedTable("multivariable", "Four variables", `${vars.join("\t")}\n`
    + t.Age.map((_, i) => vars.map((v) => t[v][i]).join("\t")).join("\n") + "\n");
  const controls = page.locator(".pane-controls");
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Correlation matrix/ }).click();
  await liveResults(/Correlation matrix \(Pearson r\)/);
  await controls.getByRole("group", { name: "Partial correlation: control for" }).getByLabel("Age").check();
  await liveResults(/Partial correlation matrix \(Pearson r, controlling for Age\)/);
  const row = async (label) => (await page.locator(".pane-results .mv-grid tbody tr", { hasText: label }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const pc = ref.partial_control_age;
  const want = `SBP 1 ${sig(pc["SBP|BMI"].pearson.r)} ${sig(pc["SBP|Cholesterol"].pearson.r)}`;
  const sbp = await row("SBP");
  const head = (await page.locator(".pane-results .mv-grid thead").first().innerText()).replace(/\s+/g, " ").trim();
  expect(`P-48 acceptance: "Partial (control for Age)" gives the matrix of partial r (${want}), Age left out`,
    sbp === want && head === "SBP BMI Cholesterol", `${head} | ${sbp}`);
  const methods = await page.locator(".methods-text p").first().innerText().catch(() => "");
  expect("P-48 the methods name partial Pearson correlation controlling for Age",
    /^Partial Pearson correlation coefficients controlling for Age/.test(methods), methods.slice(0, 120));

  // comparing two correlations: the XY tables of the stage fixture
  // (e2e-fixtures/stage/derived-numbers.json), X against two Y data sets
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "../e2e-fixtures/stage/derived-numbers.json"));
  const cmpRow = async (label) => (await page.locator(".pane-results .compare-corr tr").allInnerTexts())
    .map((x) => x.replace(/\s+/g, " ").trim()).find((x) => x.startsWith(`${label} `)) ?? "";
  const openSheet = (name) => page.getByRole("treeitem", { name, exact: true }).first()
    .locator(":scope > .nav-row").click();
  await openSheet("Correlation of Two samples");
  await liveResults(/Comparing the two correlations/, 180000);
  const fz = [await cmpRow("Test"), await cmpRow("z"), await cmpRow("P value (two-tailed)")];
  expect(`P-48 acceptance: two XY data sets in different rows: Fisher z = ${sig(ref.independent.z)}, P ${sig(ref.independent.p)}`,
    fz[0] === "Test Fisher's z test, independent samples" && fz[1] === `z ${sig(ref.independent.z)}`
      && fz[2] === `P value (two-tailed) ${sig(ref.independent.p)} ns`, fz.join(" | "));
  await openSheet("Correlation of Same subjects");
  await liveResults(/Steiger's Z test/);
  const st = ref.dependent.overlapping_age;
  const sz = [await cmpRow("Test"), await cmpRow("z"), await cmpRow("P value (two-tailed)")];
  expect(`P-48 the same rows: Steiger's Z = ${sig(st.z)}, P ${sig(st.p)}`,
    sz[0] === "Test Steiger's Z test, the same subjects, one variable in common" && sz[1] === `z ${sig(st.z)}`
      && sz[2] === `P value (two-tailed) ${sig(st.p)} **`, sz.join(" | "));
  // stated as different subjects instead: Fisher's z on the same numbers
  await controls.getByLabel("Measured on").selectOption("independent");
  expect("P-48 'Measured on: different subjects' switches the test to Fisher's z",
    await liveResults(/Fisher's z test, independent samples/));
}

// --- P-28: difference in survival at a chosen time ------------------------
{
  // engine/tests/reference/survival_difference.py: survival::lung by sex at
  // 365 days, female minus male 19.04 points (4.563 to 33.51), Greenwood SE
  // 7.385 points, cloglog test P = 0.01273 (Klein et al. 2007)
  const ref = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/survival_difference.json"), "utf8"));
  await page.getByRole("treeitem", { name: "Survival of Lung cancer by sex", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await liveResults(/Survival at day 365/, 180000);
  const block = page.locator('section[aria-label="Survival at a chosen time"]');
  const diff = (await block.locator(".surv-at-diff tbody tr").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ").trim();
  const d = ref.difference;
  const want = `Female minus Male ${Number((d.difference * 100).toPrecision(4))} points `
    + `${Number((d.ci[0] * 100).toPrecision(4))} to ${Number((d.ci[1] * 100).toPrecision(4))} points `
    + `${Number((d.se * 100).toPrecision(4))} points ${Number(d.p.toPrecision(4))}`;
  expect(`P-28 acceptance: under the survival-at-365-days table, the difference row "${want}"`, diff === want, diff);
  expect("P-28 the results say the time must be chosen before looking at the curves",
    /Choose the time before looking at the curves/.test(await block.innerText()));
}

// --- P-57: the references behind a Normalize -------------------------------
{
  // hand derivation (engine/tests/test_normalize_references.py): WT row
  // means 21, 57.67, 99.67; KO 31.33, 68, 99.67: 0% the smallest mean (row
  // "10 nM"), 100% the vehicle row's mean
  await page.getByRole("treeitem", { name: "Normalize of Viability", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const refs = page.getByRole("region", { name: "References used" });
  await refs.waitFor({ timeout: 180000 }).catch(() => {});
  const rows = (await refs.locator("tbody tr").allInnerTexts().catch(() => [])).map((x) => x.replace(/\s+/g, " ").trim());
  expect("P-57 acceptance: per data set, 0% = the smallest mean and 100% = the vehicle mean",
    rows[0] === "WT 21, the smallest mean (“10 nM”) 99.67, the mean of the last row (“vehicle”)"
      && rows[1] === "KO 31.33, the smallest mean (“10 nM”) 99.67, the mean of the last row (“vehicle”)",
    rows.join(" | "));
}

// --- P-87: the general linear mixed model on a long table -------------------
{
  // engine/tests/reference/lmm_long.py: statsmodels MixedLM plus the
  // published lme4 / lmerTest output for sleepstudy and Pastes; the df from
  // an independent dense Satterthwaite / Kenward-Roger implementation.
  const fix = (name) => readFileSync(join(here, "..", "..", "engine", "tests", "fixtures", name), "utf8")
    .trim().split("\n").map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")));
  const tsv = (rows, cols) => [cols.map((c) => rows[0][c]).join("\t"),
    ...rows.slice(1).map((r) => cols.map((c) => r[c]).join("\t"))].join("\n");
  const lmmRow = async (term) => (await page.locator(".lmm-results section[aria-label='Fixed effects'] tbody tr", {
    has: page.locator("th", { hasText: new RegExp(`^${term.replace(/[()]/g, "\\$&")}$`) }) }).first()
    .innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  const sleep = fix("lme4_sleepstudy.csv");
  await pastedTable("multivariable", "Sleep study", tsv(sleep, [1, 2, 3]));
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /Mixed model with a grouping column/ }).click();
  const controls = page.locator(".pane-controls");
  await controls.getByLabel("Grouping column (random)").selectOption("Subject");
  await controls.getByRole("checkbox", { name: "Days", exact: true }).check();
  await controls.getByLabel("Degrees of freedom (mixed model)").selectOption("satterthwaite");
  const fitted = await liveResults(/lme4: Reaction ~ Days \+ \(1 \| Subject\)/, 90000);
  // lmerTest (published): (Intercept) 251.4051 SE 9.7467 df 22.81; Days
  // 10.4673 SE 0.8042 df 161
  const icpt = await lmmRow("(Intercept)");
  const days = await lmmRow("Days");
  expect("P-87 acceptance: sleepstudy, random intercept, fixed effects and SEs as lme4, Satterthwaite df as lmerTest",
    fitted && /^\(Intercept\) 251\.4 9\.747 22\.81 /.test(icpt) && /^Days 10\.47 0\.8042 161 13\.02 /.test(days),
    `${icpt} / ${days}`);
  expect("P-87 the design note counts 18 subjects, not 180 values",
    await liveResults(/df come from the 18 Subject groups, not from the 180 values: Satterthwaite df/));
  // random slope: (Intercept) SE 6.825, Days SE 1.546, df 17; variances
  // 612.1 / 35.07, correlation 0.066, residual 654.9
  await controls.getByRole("checkbox", { name: "Random slope of Days by Subject" }).check();
  const slope = await liveResults(/lme4: Reaction ~ Days \+ \(1 \+ Days \| Subject\)/, 90000);
  const days2 = await lmmRow("Days");
  const re = (await page.locator(".lmm-results section[aria-label='Random effects']").innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  expect("P-87 random slope: Days SE 1.546 on 17 df; variances 612.1 and 35.07, r = 0.0656, residual 654.9",
    slope && /^Days 10\.47 1\.546 17 6\.771 /.test(days2) && re.includes("Subject (Intercept) 612.1 24.74")
      && re.includes("Subject Days 35.07 5.922") && re.includes("Residual 654.9 25.59")
      && re.includes("Correlation of (Intercept) and Days by Subject: 0.0656"), `${days2} / ${re.slice(0, 300)}`);
  const methods = await page.locator(".methods-text").first().innerText().catch(() => "");
  expect("P-87 methods text: random slope correlated with the intercept, Satterthwaite as lmerTest",
    methods.includes("a random intercept for each Subject with a random slope of Days (correlated with the intercept)")
      && methods.includes("Satterthwaite's method (as in lmerTest"), methods.slice(0, 300));

  // Pastes: strength ~ 1 + (1 | batch) + (1 | batch:cask); lme4: intercept
  // 60.0533 (SE 0.6769), batch variance 1.657, residual 0.678
  const pastes = fix("lme4_pastes.csv");
  await pastedTable("multivariable", "Pastes", tsv(pastes, [1, 2, 3]));
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /Mixed model with a grouping column/ }).click();
  await controls.getByLabel("Grouping column (random)").selectOption("batch");
  await controls.getByLabel("Nested level (random)").selectOption("cask");
  await controls.getByLabel("Factor", { exact: true }).selectOption("");
  const nestedOk = await liveResults(/lme4: strength ~ 1 \+ \(1 \| batch\) \+ \(1 \| batch:cask\)/, 90000);
  const ic = await lmmRow("(Intercept)");
  const re2 = (await page.locator(".lmm-results section[aria-label='Random effects']").innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  expect("P-87 acceptance: Pastes, two nested levels: intercept 60.05 (SE 0.6769, 9 df), batch 1.657, cask 8.434, residual 0.678",
    nestedOk && /^\(Intercept\) 60\.05 0\.6769 9 88\.72 /.test(ic) && re2.includes("batch (Intercept) 1.657")
      && re2.includes("cask (Intercept) 8.434") && re2.includes("Residual 0.678"), `${ic} / ${re2.slice(0, 300)}`);
  expect("P-87 nested: the design note counts batches and casks within them",
    await liveResults(/df come from the 10 batch groups \(30 cask groups within them\), not from the 60 values/));
  const axe = await page.evaluate(async (src) => {
    // eslint-disable-next-line no-eval
    if (!window.axe) (0, eval)(src);
    // eslint-disable-next-line no-undef
    const r = await axe.run(document.querySelector(".pane-controls"), { runOnly: { type: "rule",
      values: ["select-name", "label", "aria-input-field-name", "button-name"] } });
    return r.violations.map((v) => v.id);
  }, readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"));
  expect("P-87 axe: the mixed model controls have names", axe.length === 0, axe.join(", "));
}

// --- P-83: interaction contrasts in RM designs, custom contrasts -----------
{
  // engine/tests/reference/rm_contrasts.py: the 2 x 2 difference of
  // differences equals the pooled t test of the per-mouse drug effects
  // (scipy) and t^2 the mixed ANOVA's interaction F (pingouin); custom
  // contrasts from statsmodels OLS t_test, Scheffe's P from scipy
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/rm_contrasts.json"), "utf8"));
  const sig4 = (v) => String(Number(v.toPrecision(4)));
  await page.keyboard.press("Escape");
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "contrasts.json"));
  const block = page.locator(".pane-results .interaction-block").first();
  const shown = await appears(block.locator(".interaction-dod"), 180000);
  const mx = REF.mixed_2x2;
  const dod = (await block.locator(".interaction-dod").innerText().catch(() => "")).replace(/\s+/g, " ");
  expect("P-83 acceptance: RM 2 x 2, the drug effect in KO minus the drug effect in WT with its CI "
    + "(the t test of the per-mouse drug effects)",
    shown && dod.includes(`is ${sig4(mx.effect_wt)} in WT and ${sig4(mx.effect_ko)} in KO: the difference between `
      + `these effects is ${sig4(mx.difference)} (95% CI ${sig4(mx.ci[0])} to ${sig4(mx.ci[1])}), P = ${sig4(mx.p)}.`), dod);
  const test = (await block.locator(".interaction-test").innerText().catch(() => "")).replace(/\s+/g, " ");
  expect("P-83 its t^2 is the RM ANOVA's interaction F(1, 10) = 6.642 (pingouin)",
    test.includes(`F(1, 10) = ${sig4(mx.interaction_F_pingouin)}`), test);
  const simple = (await block.getByRole("table", { name: "Simple effects: Drug within each Genotype" })
    .innerText().catch(() => "")).replace(/\s+/g, " ");
  const ko = mx.drug_within_genotype.KO;
  expect("P-83 simple effects: the drug effect within KO on the mice's own differences",
    simple.includes(`KO Drug − Vehicle ${sig4(ko.difference)}`), simple);
  expect("P-83 the block says the contrasts need no sphericity",
    /tested on the subjects' contrast scores, variance pooled across the 2 groups/.test(await block.innerText()));

  // one-way ANOVA: a planned and a post hoc contrast
  await page.getByRole("treeitem", { name: "One-way ANOVA of Three groups", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const cc = page.locator(".pane-results .custom-contrasts-results").first();
  await appears(cc, 120000);
  const rows = async () => (await cc.locator("tbody tr").allInnerTexts().catch(() => []))
    .map((t) => t.replace(/\s+/g, " ").trim());
  const [c1, c2] = REF.oneway_custom.contrasts;
  const got = await rows();
  expect("P-83 planned contrast: −2 × Vehicle + Drug A + Drug B, estimate, SE and t interval as statsmodels",
    got[0]?.startsWith(`Drugs vs vehicle: −2 × Vehicle + Drug A + Drug B planned ${sig4(c1.estimate)} ${sig4(c1.se)} `
      + `${sig4(c1.ci_planned[0])} to ${sig4(c1.ci_planned[1])}`) && got[0].endsWith("none (planned)"), got[0]);
  expect("P-83 post hoc contrast: Scheffé's simultaneous interval and P on (2, 15) df",
    got[1]?.startsWith(`A vs B: Drug A − Drug B post hoc ${sig4(c2.estimate)} ${sig4(c2.se)} `
      + `${sig4(c2.ci_scheffe[0])} to ${sig4(c2.ci_scheffe[1])}`) && got[1].endsWith("Scheffé (2, 15 df)"), got[1]);
  // type a new contrast in the dialog
  const controls = page.locator(".pane-controls");
  await controls.getByRole("button", { name: "Custom contrast…" }).click();
  const dlg = page.getByRole("dialog", { name: "Custom contrast" });
  await dlg.getByLabel("Name").fill("Drug A vs vehicle");
  await dlg.getByLabel("Coefficient: Vehicle").fill("-1");
  await dlg.getByLabel("Coefficient: Drug A").fill("2");
  await dlg.getByRole("button", { name: "Add contrast" }).click();
  expect("P-83 coefficients that do not add up to 0 are refused with what to do",
    /Make the coefficients add up to 0 \(they add up to 1\)/.test(await dlg.locator('.contrast-status[role="status"]').innerText()));
  await dlg.getByLabel("Coefficient: Drug A").fill("1");
  await dlg.getByRole("button", { name: "Add contrast" }).click();
  await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  const g = REF.oneway_custom.groups;
  const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
  await page.waitForFunction(() => document.querySelectorAll(".custom-contrasts-results tbody tr").length === 3,
    null, { timeout: 60000 }).catch(() => {});
  const third = (await rows())[2] ?? "";
  expect("P-83 the typed contrast is added as planned: Drug A − Vehicle",
    third.startsWith(`Drug A vs vehicle: −Vehicle + Drug A planned ${sig4(mean(g["Drug A"]) - mean(g.Vehicle))} `), third);

  // two-way ANOVA: a post hoc contrast over the cells
  await page.getByRole("treeitem", { name: "Two-way ANOVA of Genotype by drug", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const cc2 = page.locator(".pane-results .custom-contrasts-results").first();
  await appears(cc2, 120000);
  const tw = REF.twoway_custom;
  const row2 = ((await cc2.locator("tbody tr").first().innerText().catch(() => "")).replace(/\s+/g, " ")).trim();
  expect("P-83 two-way: WT / Vehicle − WT / Drug − KO / Vehicle + KO / Drug, Scheffé on (3, 12) df",
    row2.startsWith(`Difference of differences: WT / Vehicle − WT / Drug − KO / Vehicle + KO / Drug post hoc `
      + `${sig4(tw.estimate)} ${sig4(tw.se)} ${sig4(tw.ci_scheffe[0])} to ${sig4(tw.ci_scheffe[1])}`)
      && row2.endsWith("Scheffé (3, 12 df)"), row2);
}

// --- P-99: compare fits of global-only models ------------------------------
{
  // nlstools' vmkmki (engine/tests/reference/compare_global_models.json):
  // X = substrate, one data set per inhibitor concentration (its title),
  // each substrate twice (duplicate rows); competitive vs mixed-model
  // inhibition, each fitted to all six data sets at once
  const cg = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "reference",
    "compare_global_models.json"), "utf8"));
  const vm = cg.vmkmki;
  const levels = [...new Set(vm.I)].sort((a, b) => a - b);
  const subs = [200, 200, 100, 100, 50, 50, 25, 25, 12.5, 12.5, 0, 0];
  const lines = subs.map((s, r) => [s, ...levels.map((lev) => {
    const vals = vm.v.filter((_, k) => vm.S[k] === s && vm.I[k] === lev);
    return vals[r % 2];
  })].join("\t"));
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="xy"]').check();
  await nd.getByLabel("Table name").fill("Inhibition (vmkmki)");
  await nd.locator(".field-num input").nth(1).fill("1");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp = page.locator(".import-dialog");
  await imp.getByLabel("Pasted text").check();
  await imp.getByLabel("Text to import").fill(`S\t${levels.join("\t")}\n${lines.join("\n")}\n`);
  const titles = imp.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp.getByRole("tab", { name: "Placement" }).click();
  await imp.getByLabel(/In place of the table/).check();
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 30000 });
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Compare fits/ }).click();
  await page.getByLabel(/^Model 1/).selectOption({ label: "Competitive inhibition (global)" });
  await page.getByLabel(/^Model 2/).selectOption({ label: "Mixed model inhibition (global)" });
  const ref = vm.comparisons["competitive_inhibition|mixed_model_inhibition"];
  const sig = (v) => String(Number(v.toPrecision(4)));
  const shown = await liveResults(new RegExp(`F \\(1, 68\\) = ${sig(ref.F).replace(".", "\\.")}`), 120000);
  const card = (await page.locator(".pane-results .result-card").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  expect(`P-99 acceptance: competitive vs mixed on vmkmki, F (1, 68) = ${sig(ref.F)}, P < 0.0001`,
    shown && card.includes(`F (1, 68) = ${sig(ref.F)}`) && /P value < 0\.0001/.test(card), card.slice(0, 300));
  expect(`P-99 acceptance: AICc ${sig(ref.aicc_1)} and ${sig(ref.aicc_2)}, difference ${sig(ref.delta)}`,
    card.includes(`1. Competitive inhibition 177.3 69 3 ${sig(ref.aicc_1)}`)
      && card.includes(`2. Mixed model inhibition 42.11 68 4 ${sig(ref.aicc_2)}`)
      && card.includes(`Difference in AICc (2 − 1) ${sig(ref.delta)}`), card.slice(0, 400));
  const pane = (await page.locator(".pane-results").first().innerText()).replace(/\s+/g, " ");
  expect("P-99 the results say the models are nested, so the F test applies",
    /Nested: competitive inhibition is the limit of mixed-model inhibition as Alpha grows very large, so the F test applies/.test(pane));
  expect("P-99 I of each data set is read from the titles",
    pane.includes("I of each data set, read from its title: 0, 6.25, 12.5, 25, 50, 100."));
  // a pair that is not nested: AICc only, said next to the number
  await page.getByLabel(/^Model 1/).selectOption({ label: "Uncompetitive inhibition (global)" });
  await page.getByLabel(/^Model 2/).selectOption({ label: "Noncompetitive inhibition (global)" });
  const nn = await liveResults(/Not nested: uncompetitive and noncompetitive inhibition are not nested\. The F test does not apply/, 120000);
  const card2 = (await page.locator(".pane-results .result-card").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  expect("P-99 uncompetitive vs noncompetitive: not nested, AICc only (no F)",
    nn && card2.includes("not nested (same degrees of freedom)") && !/F \(\d/.test(card2), card2.slice(0, 300));
}

// --- P-100: relative potency from parallel curves, with equivalence --------
{
  // drc's S.alba (engine/tests/fixtures/s_alba.json), bentazone the
  // reference and glyphosate the test sample; reference values from
  // engine/tests/reference/relative_potency.json (scipy, drc's LL.4)
  const sa = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "fixtures",
    "s_alba.json"), "utf8"));
  const rp = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "reference",
    "relative_potency.json"), "utf8"));
  const doses = [...new Set(sa.Bentazone.dose)];
  const lines = [];
  for (const d of doses) {
    const b = sa.Bentazone.drymatter.filter((_, k) => sa.Bentazone.dose[k] === d);
    const g = sa.Glyphosate.drymatter.filter((_, k) => sa.Glyphosate.dose[k] === d);
    b.forEach((v, k) => lines.push(`${d}\t${v}\t${g[k] ?? ""}`));
  }
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="xy"]').check();
  await nd.getByLabel("Table name").fill("S. alba");
  await nd.locator(".field-num input").nth(1).fill("1");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp = page.locator(".import-dialog");
  await imp.getByLabel("Pasted text").check();
  await imp.getByLabel("Text to import").fill(`Dose\tBentazone\tGlyphosate\n${lines.join("\n")}\n`);
  const titles = imp.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp.getByRole("tab", { name: "Placement" }).click();
  await imp.getByLabel(/In place of the table/).check();
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 30000 });
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Compare fits/ }).click();
  await page.getByLabel(/^Relative potency: a test sample against a reference/).check();
  await page.getByLabel(/^Model/).first().selectOption({ label: "Log-logistic (four parameters), X is concentration" });
  const sig = (v) => String(Number(v.toPrecision(4)));
  const p = rp.potency_jtj, f = rp.parallelism_f;
  const want = `Relative potency ${sig(p.ratio)} (95% CI ${sig(p.fieller_ci[0])} to ${sig(p.fieller_ci[1])})`;
  const shown = await liveResults(new RegExp(want.replace(/[().]/g, "\\$&")), 120000);
  const card = (await page.locator(".pane-results .relative-potency").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  expect(`P-100 acceptance: S.alba, glyphosate against bentazone, "${want}" (Fieller, as EDcomp)`, shown, card.slice(0, 200));
  expect(`P-100 acceptance: parallelism F (3, 60) = ${sig(f.F)}, P = 0.0507`,
    card.includes(`F test for parallelism F (3, 60) = ${sig(f.F)}, P = 0.0507`), card.slice(0, 600));
  expect("P-100 the delta-method SE as EDcomp prints it", card.includes(`SE (delta method) ${sig(p.se_delta)}`));
  expect("P-100 without margins the results ask for them",
    /Set equivalence margins to show parallelism\./.test(card));
  // margins set before the data are seen: the slope ratio misses 0.8 to 1.25
  const slope = page.getByRole("group", { name: "HillSlope ratio" });
  await slope.getByLabel("From").fill("0.8");
  await slope.getByLabel("To").fill("1.25");
  const eq = rp.equivalence_90.HillSlope;
  const row = `HillSlope ratio (test / reference) ${sig(eq.ratio)} ${sig(eq.ci[0])} to ${sig(eq.ci[1])} 0.8 to 1.25 No`;
  const judged = await liveResults(/Equivalence is not shown for HillSlope/, 120000);
  const card2 = (await page.locator(".pane-results .relative-potency").first().innerText().catch(() => ""))
    .replace(/\s+/g, " ");
  expect(`P-100 acceptance: equivalence, "${row}"`, judged && card2.includes(row), card2.slice(0, 900));
  expect("P-100 the potency is demoted under the reason when parallelism is not shown",
    await page.locator(".pane-results .compare-headline.potency-unsupported").count() === 1);
}

// --- P-90: competing risks: cumulative incidence and Gray's test ----------
{
  // engine/tests/reference/competing_risks.py: tidycmprsk's trial data
  // (Drug A / Drug B, months; codes 1 = death from cancer, 2 = other
  // death). Published cmprsk::cuminc output (tidycmprsk reference page):
  // Gray's test 1.99 (p 0.16) and 0.089 (p 0.77); at month 20 Drug A
  // 0.173 (0.106 to 0.255), Drug B 0.255 (0.175 to 0.343) for cancer.
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/competing_risks.json"), "utf8"));
  const sig4 = (v) => String(Number(v.toPrecision(4)));
  const pub = REF.trial.published;
  await page.keyboard.press("Escape");
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "survival-models.json"));
  const gray = page.getByRole("group", { name: "Gray's test per kind of event" });
  await appears(gray, 180000);
  // the acceptance test: code 1 named "Tumour" from the results sheet
  const name1 = page.getByRole("textbox", { name: "Name of event code 1" });
  await name1.fill("Tumour");
  await name1.press("Enter");
  await liveResults(/Tumour/);
  const rows = async (loc) => (await loc.locator("tbody tr").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
  const g = await rows(gray);
  const [c1, , p1] = g[0]?.split(" ").slice(-3) ?? [];
  const [c2, , p2] = g[1]?.split(" ").slice(-3) ?? [];
  expect(`P-90 acceptance: Gray's P for each kind of event, as cmprsk publishes (1.99, p 0.16; 0.089, p 0.77)`,
    g[0]?.startsWith("Tumour ") && g[1]?.startsWith("Other death ")
      && Number(c1).toFixed(2) === "1.99" && Number(p1).toFixed(2) === String(pub.gray["1"].p)
      && Number(c2).toFixed(3) === String(pub.gray["2"].stat) && Number(p2).toFixed(2) === String(pub.gray["2"].p),
    g.join(" | "));
  const at = await rows(page.getByRole("group", { name: "Cumulative incidence at month 20" }));
  const cif = REF.trial.cif;
  const want = [["Drug A", "Tumour", cif["Drug A"]["1"][3]], ["Drug B", "Tumour", cif["Drug B"]["1"][3]],
    ["Drug A", "Other death", cif["Drug A"]["2"][3]], ["Drug B", "Other death", cif["Drug B"]["2"][3]]];
  expect("P-90 cumulative incidence at month 20 (Aalen-Johansen, the reference's product-integral)",
    want.every(([gr, kind, v], i) => at[i]?.startsWith(`${gr} ${kind} ${sig4(v)} `)), at.join(" | "));
  const ciA = at[0]?.match(/ (\S+) to (\S+) (\S+)$/);
  expect("P-90 Drug A's CI and SE at month 20 round to cmprsk's published 0.106 to 0.255, SE 0.039",
    !!ciA && Number(ciA[1]).toFixed(3) === "0.106" && Number(ciA[2]).toFixed(3) === "0.255"
      && Number(ciA[3]).toFixed(3) === "0.039", at[0]);
  expect("P-90 the methods say 1 − Kaplan-Meier was not used",
    /1 − Kaplan-Meier was not used/.test(await page.locator(".methods-text").first().innerText().catch(() => "")));
  // the graph: one kind of event at a time, named in the Y title
  await page.getByRole("treeitem", { name: "Cumulative incidence of Trial by drug", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const plot = page.locator(".plot-card .js-plotly-plot").first();
  await appears(plot, 120000);
  const yTitle = () => page.locator(".plot-card .ytitle").first().textContent().catch(() => "");
  await page.waitForFunction(() => /Tumour/.test(document.querySelector(".plot-card .ytitle")?.textContent ?? ""),
    null, { timeout: 30000 }).catch(() => {});
  // each group's curve at month 20, as drawn (percent)
  const at20 = () => plot.evaluate((el) => (el.data ?? []).filter((t) => t.meta?.odTag?.role === "line")
    .map((t) => { let y = null; t.x.forEach((x, i) => { if (x <= 20) y = t.y[i]; }); return y; }));
  const ys = await at20();
  const near = (got, code) => got.length === 2 && ["Drug A", "Drug B"]
    .every((gr, i) => Math.abs(got[i] - 100 * REF.trial.cif[gr][code][3]) < 1e-9);
  expect("P-90 acceptance: a cumulative incidence graph of Tumour, Y title naming it",
    (await yTitle()) === "Cumulative incidence of Tumour (%)" && near(ys, "1"), `${await yTitle()} ${ys}`);
  await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Graph settings" }).getByLabel("Kind of event").selectOption({ label: "Other death" });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => /Other death/.test(document.querySelector(".plot-card .ytitle")?.textContent ?? ""),
    null, { timeout: 30000 }).catch(() => {});
  const ys2 = await at20();
  expect("P-90 the graph switches to the other kind of event (a graph per cause)",
    (await yTitle()) === "Cumulative incidence of Other death (%)" && near(ys2, "2"), `${await yTitle()} ${ys2}`);
}

// --- P-91: parametric survival models (AFT) --------------------------------
{
  // engine/tests/reference/parametric_survival.py: R's ovarian data by
  // treatment (rx 1, rx 2), Weibull AFT: rx coefficient 0.5593 (SE
  // 0.5292), scale 0.8857, medians 665.1 and 1163 days (independent MLE,
  // lifelines 0.30.3); exponential medians = log 2 x total time / events
  const REF = JSON.parse(readFileSync(join(here, "../../engine/tests/reference/parametric_survival.json"), "utf8"));
  const sig4 = (v) => String(Number(v.toPrecision(4)));
  // the fixture of the P-90 step is open: the ovarian table is in it
  await page.getByRole("treeitem", { name: "Parametric survival of Ovarian by treatment", exact: true }).first()
    .locator(":scope > .nav-row").click();
  const coefs = page.getByRole("group", { name: "Coefficients", exact: true });
  await appears(coefs, 180000);
  const rows = async (loc) => (await loc.locator("tbody tr").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
  const w = REF.ovarian.weibull;
  const c = await rows(coefs);
  const scale = await rows(page.getByRole("group", { name: "Scale", exact: true }));
  const pcts = await rows(page.getByRole("group", { name: "Percentile survival times" }));
  const med = (g) => pcts.find((r) => r.startsWith(`${g} Median (50%) `)) ?? "";
  expect(`P-91 acceptance: Weibull AFT on ovarian by treatment: coefficient ${sig4(w.coef[1])} (SE ${sig4(w.se[1])}), `
    + `scale ${sig4(w.scale)}, medians ${sig4(w.percentiles["rx 1"]["0.5"].time)} and ${sig4(w.percentiles["rx 2"]["0.5"].time)}`,
  c[1]?.startsWith(`Group: rx 2 ${sig4(w.coef[1])} ${sig4(w.se[1])} `)
      && scale[0]?.startsWith(`Scale σ ${sig4(w.scale)} `)
      && med("rx 1").startsWith(`rx 1 Median (50%) ${sig4(w.percentiles["rx 1"]["0.5"].time)} `)
      && med("rx 2").startsWith(`rx 2 Median (50%) ${sig4(w.percentiles["rx 2"]["0.5"].time)} `),
  `${c[1]} | ${scale[0]} | ${med("rx 1")} | ${med("rx 2")}`);
  const ciTxt = (ci) => `${sig4(ci[0])} to ${sig4(ci[1])}`;
  expect("P-91 the median's delta-method CI (rx 1)",
    med("rx 1").includes(ciTxt(w.percentiles["rx 1"]["0.5"].ci)), med("rx 1"));
  expect("P-91 the time ratio is the headline, with its CI",
    await answerText(new RegExp(`Time ratio \\(Weibull AFT\\)\\s*${sig4(w.time_ratio).replace(".", "\\.")}`)));
  // rx 2's 75% time (2150 days) is past its last follow-up (1227): flagged
  const p75 = pcts.find((r) => r.startsWith("rx 2 75% ")) ?? "";
  expect("P-91 extrapolation beyond follow-up is flagged next to the number",
    p75.startsWith(`rx 2 75% Extrapolated ${sig4(w.percentiles["rx 2"]["0.75"].time)} `), p75);
  const block = page.locator('section[aria-label="Percentile survival times"]');
  await block.getByRole("button", { name: "Extrapolated" }).first().click();
  expect("P-91 the Extrapolated badge opens its explanation",
    // the first badge is rx 1's 75% time (1229 days; rx 1 was followed to 1106)
    new RegExp(`rx 1, 75%: ${sig4(w.percentiles["rx 1"]["0.75"].time)} is later than the last follow-up \\(1106\\)`)
      .test(await block.innerText()));
  // the exponential model: its medians are the closed form
  await page.getByRole("group", { name: "Model" }).getByLabel("Distribution").selectOption("exponential");
  await liveResults(/Exponential accelerated failure time model/);
  const cf = REF.ovarian.exponential_closed_form.median;
  const pe = await rows(page.getByRole("group", { name: "Percentile survival times" }));
  expect(`P-91 exponential medians = log 2 x total time / events (${sig4(cf["rx 1"])}, ${sig4(cf["rx 2"])})`,
    pe.some((r) => r.startsWith(`rx 1 Median (50%) ${sig4(cf["rx 1"])} `))
      // rx 2's exponential median (1229 days) is one day past its last follow-up (1227)
      && pe.some((r) => r.startsWith(`rx 2 Median (50%) Extrapolated ${sig4(cf["rx 2"])} `)), pe.join(" | "));
}

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
expect("no page errors", errors.length === 0, `${errors.length}`);
console.log(fail.length ? `\nFAILURES (${fail.length}):\n${fail.join("\n")}` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
