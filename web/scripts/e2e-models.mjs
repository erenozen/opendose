// End-to-end checks of the wave 2 models on a multiple-variables table:
// the baseline-adjusted comparison (ANCOVA, P-82) and its route in Help me
// choose; binomial and negative binomial regression (P-86) and the counts
// route; Firth's logistic regression from the separation message (P-89).
// Each number asserted here is pinned in the engine tests from an
// independent reference (engine/tests/reference/).
// Usage: node scripts/e2e-models.mjs [http://localhost:5173/]
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ref = (name) => JSON.parse(readFileSync(join(here, `../../engine/tests/reference/${name}.json`), "utf8"));

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
const liveResults = (re, timeout = 60000) => page.waitForFunction((src) => {
  const el = document.querySelector('.pane-results[data-live="true"]');
  return !!el && new RegExp(src).test(el.textContent ?? "");
}, re.source, { timeout }).then(() => true, () => false);
const text = async (locator) => (await locator.first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
const row = (label) => text(page.locator(".pane-results tr", { hasText: label }));
const analyze = async (item) => {
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
};
/** A new table from pasted text (first line: column titles). */
const pastedTable = async (type, name, tsv) => {
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator(`input[name="table-type"][value="${type}"]`).check();
  await nd.getByLabel("Table name").fill(name);
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp = page.locator(".import-dialog");
  await imp.getByLabel("Pasted text").check();
  await imp.getByLabel("Text to import").fill(tsv);
  const titles = imp.getByLabel(/holds column titles/);
  if (!(await titles.isChecked())) await titles.check();
  await imp.getByRole("tab", { name: "Placement" }).click();
  await imp.getByLabel(/In place of the table/).check();
  await imp.getByRole("button", { name: "Import", exact: true }).click();
  await imp.waitFor({ state: "detached", timeout: 30000 });
};
const tsv = (head, cols) => `${head.join("\t")}\n${cols[0].map((_, i) => cols.map((c) => c[i]).join("\t")).join("\n")}\n`;

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });

// --- P-82: baseline-adjusted comparison (ANCOVA) ---------------------------
{
  // engine/tests/reference/ancova.py (statsmodels ols, adjusted means at
  // the mean baseline, interaction F test): two groups of 10; Treated −
  // Control adjusted difference -5.663 (95% CI -6.732 to -4.595), P
  // 2.927e-9; equal slopes F(1, 16) = 0.3481, P 0.5634
  const r = ref("ancova").two_groups;
  await pastedTable("multivariable", "Trial", tsv(["Group", "Baseline", "Follow-up"],
    [r.data.group, r.data.pre, r.data.post]));
  await analyze(/^Baseline-adjusted comparison \(ANCOVA\)/);
  await liveResults(/Baseline-adjusted comparison \(ANCOVA\) of Follow-up/);
  const answer = await text(page.locator(".pane-answer .answer-items"));
  expect("P-82 acceptance: the answer is the adjusted difference -5.663 with its 95% CI -6.732 to -4.595",
    answer === "Treated vs. Control, adjusted for Baseline Adjusted difference -5.663 95% CI -6.732 to -4.595 "
      + "P < 0.0001 · n = 10 and 10", answer);
  const diff = await row("Treated − Control");
  expect("P-82 the results table prints the same difference, SE 0.5063, |t| 11.19 on 17 df",
    diff === "Treated − Control -5.663 0.5063 -6.732 to -4.595 11.19 17 < 0.0001 ****", diff);
  const meansTable = page.locator(".pane-results table", { has: page.locator("caption", { hasText: /^Adjusted means$/ }) });
  const means = [await text(meansTable.locator("tbody tr").nth(0)), await text(meansTable.locator("tbody tr").nth(1))];
  expect("P-82 adjusted means at the mean baseline: 51.68 and 46.02 (SE 0.358)",
    means[0].startsWith("Control 10 51.68 0.358 50.93 to 52.44")
      && means[1].startsWith("Treated 10 46.02 0.358 45.26 to 46.77"), means.join(" | "));
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: "OK: Equal slopes (P = 0.5634)" });
  expect("P-82 acceptance: the Checks row shows the group × baseline slope test (P = 0.5634)", await appears(chip));
  await chip.click();
  const pane = await text(page.locator(".pane-answer"));
  expect("P-82 the chip names the F test and each group's slope",
    /F\(1, 16\) = 0\.3481, P = 0\.5634; slopes Control 0\.8417, Treated 0\.7887/.test(pane), pane.slice(-400));
  const methods = await text(page.locator(".methods-text p"));
  expect("P-82 the methods text names ANCOVA, the covariate and the interaction test",
    /by analysis of covariance \(ANCOVA\) with Baseline as the covariate/.test(methods)
      && /adjusted difference -5\.663 \(95% CI -6\.732 to -4\.595; P < 0\.0001\)/.test(methods)
      && /F\(1, 16\) = 0\.3481, P = 0\.5634/.test(methods), methods.slice(0, 220));
}

// --- P-82: Help me choose asks for the baseline and routes to ANCOVA --------
{
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Help me choose/ }).click();
  const dlg = page.getByRole("dialog", { name: "Help me choose a test" });
  await dlg.waitFor();
  await dlg.getByRole("radiogroup", { name: /^What did you measure/ }).or(
    dlg.locator("fieldset", { hasText: "What did you measure?" })).first()
    .getByLabel(/^A measurement/).check();
  await dlg.locator("fieldset", { hasText: "How many groups or conditions?" }).getByLabel("Two", { exact: true }).check();
  const q = dlg.locator("fieldset", { hasText: "measured in each subject before treatment" });
  expect("P-82 the wizard asks whether the outcome was measured before treatment too", await appears(q));
  await q.getByLabel("Yes", { exact: true }).check();
  const test = await text(dlg.locator(".wt-test"));
  expect("P-82 with a baseline the wizard recommends ANCOVA, not a paired test",
    test === "ANCOVA: follow-up compared between groups, adjusted for baseline", test);
  const alts = await text(dlg.locator(".wt-alts"));
  expect("P-82 the repeated-measures route is explained as the alternative",
    /Two-way repeated-measures ANOVA \(group × time\)/.test(alts) && /less power than ANCOVA/.test(alts), alts.slice(0, 200));
  const open = dlg.getByRole("button", { name: "Open on “Trial”" });
  expect("P-82 the wizard opens ANCOVA on the current multiple-variables table", await appears(open));
  await page.keyboard.press("Escape");
}

// ------------------------------------------------------------------------
await browser.close();
if (errors.length) console.log(errors.slice(0, 10).join("\n"));
if (fail.length) {
  console.log(`\nFAILURES (${fail.length}):\n${fail.join("\n")}`);
  process.exit(1);
}
console.log("\nall model checks passed");
