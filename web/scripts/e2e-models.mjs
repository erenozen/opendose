// End-to-end checks of the wave 2 models on a multiple-variables table:
// the baseline-adjusted comparison (ANCOVA, P-82) and its route in Help me
// choose; binomial and negative binomial regression (P-86) and the counts
// route; Firth's logistic regression from the separation message (P-89);
// ordinal (proportional-odds) regression and the ordinal-scores route (P-88).
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

// --- P-86: binomial regression of positives out of counted ------------------
{
  // engine/tests/reference/count_glms.py (statsmodels GLM Binomial with the
  // profile likelihood by refitting): 3 experiments x 2 groups; odds ratio
  // Treated vs Control 3.196 (95% CI 2.127 to 4.881), experiment as a block
  // (LR test of the term), dispersion φ = 0.02723 on 2 df
  const r = ref("count_glms").dishes;
  await pastedTable("multivariable", "Dishes", tsv(["Positive", "Counted", "Group", "Experiment"],
    [r.data.positive, r.data.counted, r.data.group, r.data.experiment]));
  await analyze(/^Binomial regression \(positives out of counted\)/);
  await liveResults(/Binomial regression of Positive out of Counted/);
  const answer = await text(page.locator(".pane-answer .answer-items"));
  expect("P-86 acceptance: the answer is the odds ratio for group, 3.196 (95% CI 2.127 to 4.881)",
    answer === "Group: Treated vs. Control Odds ratio 3.196 95% CI 2.127 to 4.881 P < 0.0001 · "
      + "binomial regression, 6 rows", answer);
  const or = await row("β1: Group[Treated]");
  expect("P-86 the table prints the same odds ratio with its profile CI",
    / 3\.196 2\.127 to 4\.881$/.test(or), or);
  const block = await text(page.locator(".pane-results table", { has: page.locator("caption", { hasText: "Tests of each term" }) })
    .locator("tbody tr", { hasText: "Experiment" }));
  expect("P-86 acceptance: the experiment enters as a block, with its own likelihood ratio test on 2 df",
    /^Experiment 2 /.test(block), block);
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: "Note: Dispersion φ = 0.02723 on 2 df" });
  expect("P-86 acceptance: the Checks row has the dispersion check (φ = 0.02723 on 2 df)", await appears(chip));
  const methods = await text(page.locator(".methods-text p"));
  expect("P-86 the methods text names the binomial model and the odds ratio",
    /out of the number counted \(Counted\) was modeled by binomial regression/.test(methods)
      && /Group\[Treated\]: odds ratio 3\.196 \(95% CI 2\.127 to 4\.881\)/.test(methods), methods.slice(0, 220));
}

// --- P-86: overdispersed dishes switch to quasi-binomial from the chip ------
{
  // the same reference: 3 experiments x 2 groups x 3 dishes, φ = 4.772 on
  // 14 df; quasi-binomial SE of Group[Treated] = binomial SE x √φ
  const r = ref("count_glms").dishes_overdispersed;
  await pastedTable("multivariable", "More dishes", tsv(["Positive", "Counted", "Group", "Experiment"],
    [r.data.positive, r.data.counted, r.data.group, r.data.experiment]));
  await analyze(/^Binomial regression \(positives out of counted\)/);
  await liveResults(/Binomial regression of Positive out of Counted/);
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: "Check: Proportions are overdispersed (φ = 4.772)" });
  expect("P-86 overdispersed dishes get a warning chip (φ = 4.772)", await appears(chip));
  await chip.click();
  await page.locator(".pane-answer").getByRole("button", { name: "Use quasi-binomial standard errors" }).click();
  await liveResults(/Quasi-binomial regression of Positive out of Counted/);
  const se = Number((await row("β1: Group[Treated]")).split(" ")[3]);
  const want = r.quasi.se[1];
  expect(`P-86 quasi-binomial: the SE of Group[Treated] is ${want.toPrecision(4)} (binomial SE × √φ)`,
    Math.abs(se - want) / want < 5e-4, String(se));
}

// --- P-86: negative binomial regression of overdispersed counts ------------
{
  // engine/tests/reference/count_glms.py (statsmodels NegativeBinomial nb2,
  // GLM NB SEs) and Kenne Pagui et al. 2020 Table 2: Ames TA98, θ = 20.51,
  // log(Dose + 10) 0.3125 (SE 0.08790)
  const r = ref("count_glms").ames;
  await pastedTable("multivariable", "Ames NB", tsv(["Dose", "log(Dose + 10)", "Revertants"],
    [r.data.dose, r.data.log_dose_plus_10, r.data.revertants]));
  await analyze(/^Negative binomial regression/);
  await liveResults(/Negative binomial regression of Revertants/);
  const coef = await row("β2: log(Dose + 10)");
  expect("P-86 negative binomial: log(Dose + 10) 0.3125, SE 0.0879 (the published ML fit)",
    /^β2: log\(Dose \+ 10\) 0\.3125 0\.0879 /.test(coef), coef);
  const theta = await row("θ (shape)");
  expect("P-86 negative binomial: θ = 20.51", theta === "θ (shape) 20.51", theta);
}

// --- P-89: Firth's correction from the separation message -------------------
{
  // engine/tests/reference/firth_logistic.py (an independent penalized
  // likelihood fit): every treated animal responds; Firth's odds ratio 45
  // = (10.5 x 7.5) / (0.5 x 3.5), profile penalized-likelihood CI 3.845 to
  // 6439, penalized LR P = 0.000905
  const r = ref("firth_logistic").dose_study;
  await pastedTable("multivariable", "Dose study", tsv(["Response", "Group"], [r.data.response, r.data.group]));
  await analyze(/^Logistic regression/);
  const refused = await appears(page.locator(".pane-answer .answer-failed", { hasText: /separation/ }), 60000);
  const offer = page.locator(".pane-answer").getByRole("button", { name: "Fit with Firth's correction" });
  expect("P-89 acceptance: the separation message offers Firth's correction", refused && await appears(offer),
    await text(page.locator(".pane-answer")));
  await offer.click();
  await liveResults(/Firth logistic regression of Response/);
  const answer = await text(page.locator(".pane-answer .answer-items"));
  expect("P-89 acceptance: a finite odds ratio, 45 (95% CI 3.845 to 6439), with the shrinkage said next to it",
    answer === "Group: Treated vs. Control Odds ratio 45 95% CI 3.845 to 6439 P = 9.050e-4 (penalized likelihood "
      + "ratio) · Firth's correction: shrunk toward no effect", answer);
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: "Note: Firth's correction: estimates shrunk" });
  expect("P-89 the Checks row explains that the estimate is shrunk", await appears(chip));
  const methods = await text(page.locator(".methods-text p"));
  expect("P-89 the methods text names Firth's penalized likelihood and the separation",
    /with Firth's penalized likelihood \(Firth 1993; Heinze & Schemper 2002\), because the predictors separated/
      .test(methods), methods.slice(0, 220));
}

// --- P-88: ordinal (proportional-odds) regression: the wine acceptance test --
{
  // engine/tests/test_ordinal_regression.py: ordinal::clm's printed fit of
  // rating ~ temp + contact on the wine data (Christensen, clm vignette
  // 4.1), also statsmodels OrderedModel: tempwarm 2.5031 (SE 0.5287),
  // contactyes 1.5278 (SE 0.4766), thresholds -1.3444 1.2508 3.4669 5.0064,
  // profile CI 1.5097627 to 3.595225, nominal_test P 0.3654 and 0.9040
  const rows = readFileSync(join(here, "../../engine/tests/fixtures/wine.csv"), "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(","));
  await pastedTable("multivariable", "Wine", tsv(["rating", "temp", "contact"],
    [rows.map((r) => r[1]), rows.map((r) => r[2]), rows.map((r) => r[3])]));
  await analyze(/^Ordinal regression/);
  await liveResults(/Ordinal regression \(proportional odds\) of rating/);
  const answer = await text(page.locator(".pane-answer .answer-items"));
  expect("P-88 the answer is the odds ratio of a higher rating for temp, 12.22 (95% CI 4.526 to 36.42)",
    answer === "temp: warm vs. cold Odds ratio of a higher score 12.22 95% CI 4.526 to 36.42 P < 0.0001 · "
      + "ordinal (proportional odds) regression, 72 rows", answer);
  const temp = await row("β1: temp[warm]");
  const contact = await row("β2: contact[yes]");
  expect("P-88 acceptance: temp[warm] 2.503 (SE 0.5287) and contact[yes] 1.528 (SE 0.4766) as clm prints them",
    /^β1: temp\[warm\] 2\.503 0\.5287 1\.51 to 3\.595 4\.735 /.test(temp)
      && /^β2: contact\[yes\] 1\.528 0\.4766 0\.6158 to 2\.492 3\.205 /.test(contact), `${temp} | ${contact}`);
  const cuts = page.locator(".pane-results table", { has: page.locator("caption", { hasText: /^Thresholds$/ }) });
  const th = [];
  for (let i = 0; i < 4; i++) th.push(await text(cuts.locator("tbody tr").nth(i)));
  expect("P-88 acceptance: the thresholds -1.344, 1.251, 3.467, 5.006 (SE 0.5171 to 0.7309)",
    th.join(" | ") === "1|2 -1.344 0.5171 -2.6 | 2|3 1.251 0.4379 2.857 | 3|4 3.467 0.5978 5.8 | 4|5 5.006 0.7309 6.85",
    th.join(" | "));
  const drop = await text(page.locator(".pane-results table", { has: page.locator("caption", { hasText: "Tests of each term" }) })
    .locator("tbody tr", { hasText: "temp" }));
  expect("P-88 the likelihood ratio test of temp is clm's drop1 LRT, 26.93 on 1 df", /^temp 1 26\.93 /.test(drop), drop);
  await openChecks();
  const chip = page.locator(".pane-answer").getByRole("button", { name: "OK: Proportional odds not rejected" });
  expect("P-88 acceptance: the Checks row has the proportional-odds check", await appears(chip));
  await chip.click();
  const pane = await text(page.locator(".pane-answer"));
  expect("P-88 the check names each term's test (nominal_test: temp χ² 3.175, P 0.3654; contact 0.5667, P 0.904)",
    /temp: χ² = 3\.175 on 3 df, P = 0\.3654; contact: χ² = 0\.5667 on 3 df, P = 0\.904/.test(pane), pane.slice(-500));
  const methods = await text(page.locator(".methods-text p"));
  expect("P-88 the methods text names the cumulative logit model and the odds ratios",
    /was modeled by ordinal logistic regression \(cumulative logit, proportional odds; McCullagh 1980\)/.test(methods)
      && /temp\[warm\]: odds ratio 12\.22 \(95% CI 4\.526 to 36\.42\)/.test(methods), methods.slice(0, 260));
}

// --- P-88: histology scores with the experiment as a block -------------------
{
  // engine/tests/reference/ordinal_regression.py (OrderedModel, profile CI
  // by refitting with an offset): Drug vs Vehicle odds ratio 0.01825
  // (95% CI 0.002086 to 0.1006), experiment as a block on 2 df
  // (the score first: an import reads a leading text column as row titles)
  const r = ref("ordinal_regression").histology;
  await pastedTable("multivariable", "Histology", tsv(["Score", "Group", "Experiment"],
    [r.data.score, r.data.group, r.data.experiment]));
  await analyze(/^Ordinal regression/);
  await liveResults(/Ordinal regression \(proportional odds\) of Score/);
  const answer = await text(page.locator(".pane-answer .answer-items"));
  expect("P-88 histology: the odds ratio of a higher score, Drug vs Vehicle, 0.01825 (0.002086 to 0.1006)",
    answer === "Group: Drug vs. Vehicle Odds ratio of a higher score 0.01825 95% CI 0.002086 to 0.1006 "
      + "P < 0.0001 · ordinal (proportional odds) regression, 36 rows", answer);
  const block = await text(page.locator(".pane-results table", { has: page.locator("caption", { hasText: "Tests of each term" }) })
    .locator("tbody tr", { hasText: "Experiment" }));
  expect("P-88 the experiment enters as a block with its likelihood ratio test on 2 df", /^Experiment 2 /.test(block), block);
}

// --- P-88: Help me choose routes ordinal scores here -------------------------
{
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Help me choose/ }).click();
  const dlg = page.getByRole("dialog", { name: "Help me choose a test" });
  await dlg.waitFor();
  await dlg.locator("fieldset", { hasText: "What did you measure?" }).getByLabel(/^Scores on an ordered scale/).check();
  await dlg.locator("fieldset", { hasText: "How many groups or conditions?" }).getByLabel("Two", { exact: true }).check();
  const test = await text(dlg.locator(".wt-test"));
  expect("P-88 the wizard's ordinal-scores answer recommends ordinal regression",
    test === "Ordinal regression (proportional odds), experiment as a block", test);
  const alts = await text(dlg.locator(".wt-alts"));
  expect("P-88 the Mann-Whitney test is the simpler alternative", /Mann-Whitney test/.test(alts), alts.slice(0, 200));
  const open = dlg.getByRole("button", { name: "Open on “Histology”" });
  expect("P-88 the wizard opens ordinal regression on the current multiple-variables table", await appears(open));
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
