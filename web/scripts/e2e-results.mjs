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
// with their CIs (P-22).
// Each number asserted here is pinned in the engine tests from an
// independent reference (engine/tests/reference/).
// Usage: node scripts/e2e-results.mjs [http://localhost:5173/]
import { chromium } from "playwright";
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

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
expect("no page errors", errors.length === 0, `${errors.length}`);
console.log(fail.length ? `\nFAILURES (${fail.length}):\n${fail.join("\n")}` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
