// End-to-end checks of the results honesty features (FEATURE-PLAN wave 1):
// residual plots for curve fits and ANOVA models in the Checks row (P-11),
// the smallest P a rank test can reach (P-15), the "Analysed" line of
// regression, Cox and contingency results (P-16) and the ratio to control
// with its Fieller CI (P-18). Each number asserted here is pinned in the
// engine tests from an independent reference (engine/tests/reference/).
// Usage: node scripts/e2e-results.mjs [http://localhost:5173/]
import { chromium } from "playwright";

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

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
expect("no page errors", errors.length === 0, `${errors.length}`);
console.log(fail.length ? `\nFAILURES (${fail.length}):\n${fail.join("\n")}` : "\nall checks passed");
process.exit(fail.length ? 1 : 0);
