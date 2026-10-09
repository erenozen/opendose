// Visual smoke pass of the 0.4.0 entry points: drives each feature of the
// user-needs release into view and screenshots it at 1400 px and 390 px,
// light and dark, then runs axe-core (WCAG 2 A / AA, contrast included)
// on what is on screen in both themes. Not an assertion suite: look at
// the pictures (OUT/<scene>-<width>-<theme>.png) and read OUT/axe.json.
//
// Usage: node scripts/smoke-0.4.0.mjs http://localhost:5214/ [OUT] [scene,scene]
// (OUT defaults to a temporary folder; the scene list to all scenes).
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { strToU8, zipSync } from "fflate";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const baseUrl = process.argv[2] ?? "http://localhost:5214/";
const OUT = process.argv[3] ?? mkdtempSync(join(tmpdir(), "opendose-smoke-"));
const ONLY = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
mkdirSync(OUT, { recursive: true });
const exampleUrl = (() => { const u = new URL(baseUrl); u.searchParams.set("example", "1"); return u.toString(); })();
const WIDE = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };

const browser = await chromium.launch();
const errors = [];
const axeFound = [];
const shots = [];
let page;
let context;

async function fresh(withExample = true, viewport = WIDE) {
  await context?.close().catch(() => {});
  context = await browser.newContext({ viewport, colorScheme: "light" });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto(withExample ? exampleUrl : baseUrl, { waitUntil: "domcontentloaded" });
  if (withExample) {
    await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  }
}

const live = (re, timeout = 90000) => page.waitForFunction((src) =>
  new RegExp(src).test(document.querySelector('.pane-results[data-live="true"]')?.textContent ?? ""),
re.source, { timeout }).then(() => true, () => false);
const appears = (loc, timeout = 15000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

async function axeRun(label, selector) {
  await page.addScriptTag({ path: AXE }).catch(() => {});
  const v = await page.evaluate(async (sel) => {
    const roots = [...document.querySelectorAll(sel)];
    if (!roots.length) return [];
    const out = [];
    for (const el of roots) {
      // eslint-disable-next-line no-undef
      const r = await axe.run({ include: [el], exclude: [...el.querySelectorAll(".js-plotly-plot, .plot")] },
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
      out.push(...r.violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.html.slice(0, 110)}`
        + (x.id === "color-contrast" ? ` (${(n.any[0]?.message ?? "").slice(0, 120)})` : ""))));
    }
    return [...new Set(out)];
  }, selector).catch((e) => [`axe failed: ${e.message}`]);
  for (const x of v) axeFound.push(`${label}: ${x}`);
}

/** Screenshots of the current state in four configurations. `target`: a
 *  selector to capture (whole element) or "viewport". `axe`: selector(s)
 *  to audit in both themes at 1400 px. */
async function shoot(name, { target = ".pane-results", axe = "main, dialog[open], [role=dialog], [role=menu]",
  phone = true } = {}) {
  const sizes = phone ? [WIDE, PHONE] : [WIDE];
  for (const vp of sizes) {
    await page.setViewportSize(vp);
    for (const theme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForTimeout(500);
      const file = join(OUT, `${name}-${vp.width}-${theme}.png`);
      try {
        const loc = target === "viewport" || target === "full" ? null : page.locator(target).first();
        if (loc && await loc.count()) {
          await loc.scrollIntoViewIfNeeded().catch(() => {});
          // a sticky header would cover a tall element's capture
          await loc.screenshot({ path: file, timeout: 15000,
            style: "header, .app-header { position: static !important; }" });
        } else {
          await page.screenshot({ path: file, fullPage: target === "full" });
        }
        shots.push(file);
      } catch (e) {
        errors.push(`screenshot ${name} ${vp.width} ${theme}: ${e.message.split("\n")[0]}`);
        await page.screenshot({ path: file }).catch(() => {});
      }
      if (vp === WIDE && axe) await axeRun(`${name} (${theme})`, axe);
      // horizontal overflow at phone width
      if (vp === PHONE && theme === "light") {
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) errors.push(`${name}: page scrolls sideways by ${over}px at 390 px`);
      }
    }
  }
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
}

// ------------------------------------------------------------ helpers

async function newTable(type, name, fields = {}, example = false) {
  await page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.locator(`input[name="table-type"][value="${type}"]`).check();
  if (name) await dlg.getByLabel("Table name").fill(name);
  for (const [label, v] of Object.entries(fields)) await dlg.getByLabel(label, { exact: true }).fill(String(v));
  if (example) await dlg.getByLabel("Example data").check();
  await dlg.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.waitForTimeout(400);
}
async function importCsv(csv) {
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
}
const pasteAt = (label, text) => page.evaluate(([l, t]) => {
  const el = document.querySelector(`.data-table input[aria-label='${l}']`);
  const dt = new DataTransfer();
  dt.setData("text/plain", t);
  el.focus();
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, [label, text]);
const ctl = () => page.locator(".pane-controls");
const labelled = (text) => ctl().locator("label.check-row", { has: page.locator(`span:text-is("${text}")`) })
  .locator("select");
async function column(name, csv, analysis = "ttest") {
  await newTable("column", name);
  await importCsv(csv);
  await ctl().locator("select.analysis-select").selectOption(analysis);
  await page.waitForSelector('.pane-results[data-live="true"]', { timeout: 120000 });
  await page.waitForTimeout(1200);
}
const wizard = () => page.locator("dialog.assay-wizard");
async function startAssay(label, { sample = true } = {}) {
  await page.getByRole("button", { name: "New data table" }).first().click();
  const dlg = page.locator(".new-table-dialog");
  await dlg.getByRole("radio", { name: "Start from an assay" }).check();
  await dlg.getByRole("radio", { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).check();
  if (!sample) await dlg.getByText("An empty layout").click();
  await dlg.getByRole("button", { name: "Start assay" }).click();
}
async function finishWizard() {
  for (let i = 0; i < 8; i++) {
    const next = wizard().getByRole("button", { name: "Next", exact: true });
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(250);
  }
  await wizard().locator(".modal-actions .btn-primary").click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });
}
const PILOT = "Control,Treated\n10.2,13.4\n11.5,14.1\n9.8,12.8\n12.1,15.0\n10.9,13.9\n11.3,14.6";
const write = (name, text) => { const p = join(OUT, name); writeFileSync(p, text); return p; };

// ------------------------------------------------------------ scenes

const scenes = {
  async start() {
    await fresh(false);
    await page.locator(".start-screen").waitFor({ timeout: 60000 });
    await shoot("start", { target: "full" });
    await page.getByRole("button", { name: /Describe your experiment/ }).first().click();
    await appears(page.locator(".design-dialog"));
    await shoot("start-describe", { target: "viewport" });
    await page.keyboard.press("Escape");
    // several CSVs dropped: the recipe dialog stacks them
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      for (const n of ["ctrl_rep1_img01.csv", "drug_rep1_img01.csv"]) {
        d.items.add(new File([" ,Area\n1,10\n2,12\n"], n, { type: "text/csv" }));
      }
      return d;
    });
    await page.dispatchEvent("main.start-screen", "dragover", { dataTransfer: dt });
    await page.dispatchEvent("main.start-screen", "drop", { dataTransfer: dt });
    await appears(page.getByRole("dialog", { name: "Import with a recipe" }), 60000);
    await shoot("start-multifile", { target: "viewport" });
  },

  async analyze() {
    await fresh();
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await shoot("analyze-menu", { target: "viewport", axe: ".analyze-menu" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Help me choose/ }).click();
    await appears(page.getByRole("dialog", { name: "Help me choose a test" }));
    await shoot("help-me-choose", { target: "viewport" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Plan an experiment/ }).click();
    await appears(page.getByRole("dialog", { name: "Plan an experiment" }));
    await shoot("plan-experiment", { target: "viewport" });
  },

  async ttest() {
    await fresh();
    await column("Pilot", PILOT);
    await shoot("ttest");
    await page.getByRole("button", { name: /Residuals: QQ plot/ }).click();
    await page.waitForTimeout(1500);
    await shoot("ttest-residuals", { target: ".residuals-card" });
    // Ctrl+E: the reason prompt, then the Exclusions block
    await page.locator('.data-table input[aria-label="Treated, row 3"]').click();
    await page.keyboard.press("Control+e");
    await appears(page.getByRole("region", { name: "Exclusion reason" }));
    await shoot("exclusion-prompt", { target: "viewport" });
    await page.getByRole("region", { name: "Exclusion reason" }).getByLabel("Other reason for excluding").fill("tumour ulceration");
    await page.getByRole("button", { name: "Save reason" }).click();
    await page.waitForTimeout(2500);
    const card = page.getByRole("region", { name: "Exclusions" });
    await card.getByRole("button", { name: "Show results with excluded values included" }).click().catch(() => {});
    await page.waitForTimeout(2500);
    await shoot("exclusions");
    // Sample size for the next experiment, How this is validated
    await page.getByRole("button", { name: /next experiment…/ }).click();
    await appears(page.locator("dialog.power-dialog"));
    await page.locator("dialog.power-dialog").getByLabel("Difference to detect").fill("1");
    await page.waitForTimeout(2500);
    await shoot("sample-size", { target: "viewport" });
    await page.locator("dialog.power-dialog").getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "How this is validated" }).click();
    await appears(page.getByRole("dialog", { name: "How OpenDose is validated" }));
    await page.waitForTimeout(800);
    await shoot("validation", { target: "viewport" });
    await page.getByRole("dialog", { name: "How OpenDose is validated" }).getByRole("button", { name: "Close" }).click();
  },

  async unit() {
    await fresh();
    await newTable("column", "Wells");
    await pasteAt("Group A, row 1", "10\t12\n11\t13\n12\t14\n20\t23\n21\t24\n22\t25\n30\t33\n31\t34\n32\t35\n");
    const imp = page.locator(".import-dialog");
    if (await appears(imp, 5000)) {
      await imp.getByRole("button", { name: "Import", exact: true }).click();
      await imp.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    }
    await ctl().locator("select.analysis-select").selectOption("ttest");
    await live(/P value/);
    await page.waitForTimeout(1000);
    await shoot("unit-question");
  },

  async smalln() {
    await fresh();
    await column("One value", "Control,Treated\n10,14", "ttest");
    await page.waitForFunction(() => document.querySelector('[data-banner="p-withheld"]')?.textContent?.includes("to detect"),
      null, { timeout: 60000 }).catch(() => {});
    await shoot("small-n");
  },

  async logscale() {
    await fresh();
    await column("Cytokine IL-6", "Control,Treated\n12,30\n18,55\n9,24\n25,80\n15,41\n11,33");
    await labelled("Group A").selectOption({ label: "Treated" });
    await labelled("Group B").selectOption({ label: "Control" });
    await live(/SD grows with the mean/);
    await shoot("log-chip");
    await page.locator('.pane-results .log-chip[data-chip="scale-check"]').getByRole("button", { name: "Analyse on the log scale" }).click();
    await live(/-fold/);
    await page.waitForTimeout(1500);
    await shoot("log-ratio");
  },

  async multiplicity() {
    await fresh();
    await column("Three vs control", "Control,A,B,C\n10,12,11,13\n11,13,12,15\n12,14,13,14\n10.5,12.5,14,16\n11.5,13.5,10,12\n12.5,11,12,14");
    for (const [i, b] of [1, 2, 3].entries()) {
      if (i > 0) {
        await page.getByRole("button", { name: "Analyze", exact: true }).click();
        await page.getByRole("menuitem", { name: /Column analyses/ }).click();
        await page.waitForTimeout(800);
        await ctl().locator("select.analysis-select").selectOption("ttest");
      }
      await ctl().getByLabel("Group B").selectOption(String(b));
      await page.waitForTimeout(1000);
    }
    const chip = page.locator(".guide-chip", { hasText: "t tests on this table" });
    if (await appears(chip, 30000)) await chip.click();
    await page.waitForTimeout(800);
    await shoot("multiplicity");
  },

  async anova() {
    await fresh();
    await column("Four groups", "Control,Dose 1,Dose 2,Dose 3\n23.1,28.4,35.2,24.2\n25.4,30.2,33.9,26.4\n21.8,27.1,37.4,22.8\n24.9,31.5,34.1,25.9\n22.6,29.0,36.6,23.6\n26.0,28.8,35.8,27.0", "anova");
    await labelled("Multiple comparisons").selectOption("sidak");
    await ctl().getByLabel("Comparisons", { exact: true }).selectOption("pairs");
    await ctl().getByRole("checkbox", { name: "Control vs. Dose 1" }).check();
    await ctl().getByRole("checkbox", { name: "Control vs. Dose 3" }).check();
    await live(/planned comparisons/);
    await shoot("anova-planned");
    await shoot("anova-controls", { target: ".pane-controls", phone: false });
  },

  async rm() {
    await fresh();
    await column("Mice over time", "Baseline,Day 7,Day 14\n10,14,18\n12,15,16\n9,12,15\n11,16,19\n13,17,20\n10,13,17", "rm_anova");
    await ctl().getByLabel("Multiple comparisons", { exact: true }).selectOption("tukey");
    await live(/comparisons \(Tukey\)/);
    await page.waitForTimeout(1000);
    await shoot("rm-anova");
  },

  async interaction() {
    await fresh();
    await page.getByRole("button", { name: "New data table" }).first().click();
    const dlg = page.locator(".new-table-dialog");
    await dlg.locator('input[name="table-type"][value="grouped"]').check();
    await dlg.getByLabel("Table name").fill("Drug by genotype");
    const nums = dlg.locator(".field-num input");
    for (const [i, v] of [2, 3, 2].entries()) await nums.nth(i).fill(String(v));
    await dlg.getByRole("button", { name: "Create table" }).click();
    await page.waitForSelector(".grid-toolbar");
    await pasteAt("Row 1 title", "Vehicle\t9\t10\t11\t9\t10\t11\nDrug\t12\t13\t14\t16\t17\t18\n");
    await page.locator('input[aria-label="Dataset 1 title"]').fill("WT");
    await page.locator('input[aria-label="Dataset 2 title"]').fill("KO");
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Help me choose…/ }).click();
    const hw = page.getByRole("dialog", { name: "Help me choose a test" });
    await hw.getByRole("group", { name: "Are you asking whether the treatment effect differs between groups?" })
      .getByRole("radio", { name: /^Yes/ }).check();
    await hw.getByRole("button", { name: /^Open on/ }).click();
    await live(/F\(1, 8\)/);
    await page.waitForTimeout(2000);
    await shoot("interaction");
  },

  async nested() {
    await fresh();
    const DATA = [["WT", "Vehicle", "WV1", [11.4, 11.3, 9.5, 9.7]], ["WT", "Vehicle", "WV2", [9.9, 9.3, 10.1, 7.5]],
      ["WT", "Vehicle", "WV3", [11.8, 12.6, 11.7, 11.5]], ["WT", "Drug", "WD1", [12.2, 11.2, 11.2, 12.0]],
      ["WT", "Drug", "WD2", [8.2, 10.2, 9.1, 7.8]], ["WT", "Drug", "WD3", [9.4, 8.6, 8.3, 9.9]],
      ["KO", "Vehicle", "KV1", [12.3, 11.8, 13.0, 13.3]], ["KO", "Vehicle", "KV2", [11.7, 12.2, 10.9, 10.3]],
      ["KO", "Vehicle", "KV3", [12.2, 13.0, 10.6, 11.3]], ["KO", "Drug", "KD1", [10.6, 12.4, 12.8, 11.6]],
      ["KO", "Drug", "KD2", [15.8, 15.6, 15.4, 15.9]], ["KO", "Drug", "KD3", [12.3, 12.3, 9.9, 12.0]]];
    const LONG = "Mouse\tGenotype\tTreatment\tSoma area\n"
      + DATA.flatMap(([a, b, u, v]) => v.map((x) => `${u}\t${a}\t${b}\t${x}`)).join("\n");
    await newTable("grouped", "Soma nested");
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await page.getByRole("menuitem", { name: /Nested two-way ANOVA/ }).click();
    await page.getByRole("button", { name: "From long table…" }).click();
    const ld = page.getByRole("dialog", { name: "Nested two-factor data from a long table" });
    await ld.getByLabel("Long table text").fill(LONG);
    await ld.getByRole("button", { name: "Fill the table" }).click();
    await live(/df come from 12 mice/);
    await page.waitForTimeout(2000);
    await shoot("nested-two-way");
  },

  async xy() {
    await fresh();
    await newTable("xy", "Weak inhibitor", { "Y datasets": 1, "Replicates per X": 3, "Rows (X values)": 6 });
    await importCsv("Concentration (µM),Drug,Drug,Drug\n0.1,100.8,98.9,100.4\n0.3,98.4,100.2,98.7\n"
      + "1,99.0,97.6,98.7\n3,93.7,95.5,95.9\n10,85.6,84.2,86.1\n30,61.5,62.9,61.0");
    await live(/not reached in the range tested/, 120000);
    await page.waitForTimeout(1500);
    await shoot("xy-range");
    // two curves: the Compare fits links and Compare a parameter
    await newTable("xy", "Potency shift", { "Replicates per X": 1 });
    const pX = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
    const pA = [99.6, 97.6, 92.1, 80.4, 50.3, 23.9, 8.9, 3.2, 1.2];
    const pB = [100.8, 99.1, 97.3, 91.0, 79.2, 52.4, 24.8, 9.6, 2.9];
    await importCsv(["Dose,Control,Treated", ...pX.map((x, i) => `${x},${pA[i]},${pB[i]}`)].join("\n"));
    await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await shoot("xy-links");
    await page.getByRole("button", { name: "Compare a parameter (EC50 ratio)…" }).click();
    await page.locator(".controls").getByRole("combobox", { name: /^Model/ }).selectOption("log_inhibitor_vs_response_4pl");
    await page.waitForFunction(() => /F\(1, 10\)/.test(document.querySelector(".compare-parameter")?.textContent ?? ""),
      null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await shoot("compare-parameter");
  },

  async survival() {
    await fresh();
    await newTable("survival", "Mouse survival", { Groups: 2, "Rows (subjects)": 3 });
    await page.getByRole("button", { name: "Survival data from…" }).click();
    const dlg = page.getByRole("dialog", { name: "Survival data from counts or dates" });
    await dlg.getByLabel("Pasted table").fill("Day\tVehicle\tDrug\n0\t5\t5\n4\t4\t5\n12\t2\t5\n20\t1\t4\n30\t1\t4");
    await page.waitForTimeout(800);
    await shoot("survival-from", { target: "viewport" });
    await dlg.getByRole("button", { name: "Fill the table" }).click();
    await live(/not reached/);
    await page.getByLabel("Survival at time").fill("12");
    await page.getByLabel("Survival at time").press("Enter");
    await live(/Survival at day 12/);
    await page.waitForTimeout(1500);
    await shoot("survival-two");
    await newTable("survival", "Dose groups", { Groups: 4, "Rows (subjects)": 3 });
    await page.getByRole("button", { name: "Survival data from…" }).click();
    const d4 = page.getByRole("dialog", { name: "Survival data from counts or dates" });
    await d4.getByLabel("Pasted table").fill("Day\tVehicle\tLow\tMid\tHigh\n0\t8\t8\t8\t8\n5\t6\t8\t8\t8\n10\t4\t6\t7\t8\n"
      + "15\t2\t5\t6\t7\n20\t1\t3\t5\t7\n30\t0\t2\t4\t6");
    await d4.getByRole("button", { name: "Fill the table" }).click();
    await live(/Holm-Šídák/);
    await page.getByLabel("Groups are ordered (e.g. doses): log-rank test for trend").check();
    await live(/test for trend/);
    await page.waitForTimeout(1500);
    await shoot("survival-pairwise");
  },

  async qpcr() {
    await fresh();
    await startAssay("qPCR (ΔCq / ΔΔCq)");
    await wizard().waitFor({ timeout: 30000 });
    await wizard().getByRole("button", { name: /Reference check/ }).click();
    await page.waitForFunction(() => /Cq/.test(document.querySelector("dialog.assay-wizard .qpcr-refs")?.textContent ?? ""),
      null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shoot("qpcr-refs", { target: "viewport", axe: "dialog[open]" });
  },

  async flow() {
    await fresh();
    await startAssay("Flow cytometry");
    await wizard().waitFor({ timeout: 30000 });
    await shoot("flow-wizard", { target: "viewport", axe: "dialog[open]" });
    await finishWizard();
    await page.waitForSelector(".flow-results", { timeout: 60000 });
    await page.waitForTimeout(2000);
    await shoot("flow-results");
  },

  async timecourse() {
    await fresh();
    await startAssay("Time course");
    await live(/Group × Time/);
    await page.getByRole("button", { name: "Compare covariance structures (AIC)" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".mixed-aic tbody tr").length === 4, null, { timeout: 90000 }).catch(() => {});
    await page.getByRole("button", { name: "Add: Area under each subject's curve" }).click();
    await live(/AUC of each subject/);
    await page.waitForTimeout(1500);
    await shoot("timecourse");
  },

  async convert() {
    await fresh();
    await column("Paired mice", "A,B\n1,1.5\n2,2.4\n3,3.6\n,4.1\n5,5.2", "ttest");
    await shoot("notes-analysed");
    await page.getByRole("button", { name: "Convert table to…" }).click();
    await page.locator(".convert-type-dialog").getByLabel("Grouped table, same rows").check();
    await shoot("convert", { target: "viewport" });
  },

  async save() {
    await fresh();
    await page.getByRole("button", { name: "More ways to save and share" }).click();
    await shoot("save-menu", { target: "viewport", axe: "[role=menu]" });
    await page.getByRole("menuitem", { name: "Export graphs to PowerPoint (.pptx)…" }).click();
    await appears(page.getByRole("dialog", { name: "Export graphs to PowerPoint" }));
    await shoot("pptx", { target: "viewport", axe: "dialog[open]" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "More ways to save and share" }).click();
    await page.getByRole("menuitem", { name: "Apply to new data…" }).click();
    const rp = page.getByRole("dialog", { name: "Apply to new data" });
    await rp.getByLabel("New data file").setInputFiles({ name: "Contingency example.csv", mimeType: "text/csv",
      buffer: Buffer.from(",Event,No event\nExposed,25,85\nNot exposed,5,95\n") });
    await page.waitForTimeout(1500);
    await shoot("apply-new-data", { target: "viewport", axe: "dialog[open]" });
  },

  async plan() {
    await fresh();
    await column("Planned mice", "Control,Treated\n10.1,13.9\n11.4,15.2\n9.6,12.8\n10.8,14.4\n11.9,13.1\n10.2,15.8\n9.9,14.0\n11.0,13.6");
    await page.getByRole("button", { name: "Make this the plan" }).click();
    await page.waitForTimeout(800);
    await ctl().getByLabel("Test", { exact: true }).selectOption("paired");
    await live(/Planned:/);
    await page.waitForTimeout(800);
    await shoot("plan-deviation");
    await page.locator(".plan-chip").first().click().catch(() => {});
    await page.getByRole("button", { name: "Open the analysis plan" }).click().catch(() => {});
    await appears(page.locator(".plan-sheet"));
    await shoot("plan-sheet", { target: ".plan-sheet" });
  },

  async reproduce() {
    await fresh();
    let saved = null;
    for (let i = 0; i < 20 && !saved; i++) {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }),
        page.getByRole("button", { name: "Save project" }).click()]);
      const f = join(OUT, "reproduce.json");
      await dl.saveAs(f);
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (j.sheets.filter((s) => s.kind === "results").every((s) => s.cachedKey)) saved = j;
      else await page.waitForTimeout(1500);
    }
    const older = { ...saved, savedWith: { ...saved.savedWith, app: "0.3.0" } };
    const ct = older.sheets.find((s) => s.kind === "results" && s.cached?.analysis === "contingency");
    if (ct) ct.cached.chi_square.p = 0.0234;
    await page.setInputFiles('.load-btn input[type="file"]', write("saved-0.3.0.json", JSON.stringify(older)));
    await page.waitForFunction(() => /reproduced with|changed with/.test(
      document.querySelector(".reproduce-strip .rs-headline")?.textContent ?? ""), null, { timeout: 180000 }).catch(() => {});
    await shoot("reproduce", { target: ".reproduce-strip" });
  },

  async recipes() {
    await fresh();
    const openRecipes = async () => {
      await page.getByRole("button", { name: "Import…" }).click();
      await page.getByRole("tab", { name: "Recipes" }).click();
      const d = page.getByRole("dialog", { name: "Import with a recipe" });
      await d.waitFor({ timeout: 10000 });
      return d;
    };
    const INCU = write("incucyte.txt", ["Vessel Name: HeLa scratch", "Metric: Phase Object Confluence (Percent)", "",
      "Date Time\tElapsed\tB2\tB3\tC2", "01/03/2024 10:00:00\t0\t5.1\t4.8\t6.0", "01/03/2024 12:00:00\t2\t7.9\t7.2\t9.5"].join("\n"));
    let d = await openRecipes();
    await d.getByLabel("Export file to import").setInputFiles(INCU);
    await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
    await d.getByRole("button", { name: "Save as recipe…" }).click();
    await d.getByLabel("Recipe name").fill("Incucyte confluence");
    await d.getByRole("button", { name: "Save recipe" }).click();
    await shoot("recipe-incucyte", { target: "viewport", axe: "dialog[open]" });
    await d.getByRole("button", { name: "Create table" }).click();
    await page.waitForTimeout(800);
    const LAB = write("labchart.txt", ["Interval=\t0.5 s", "TimeFormat=\tStartOfBlock", "ChannelTitle=\tPressure\tFlow",
      "UnitName=\tmmHg\tml/min", "0\t98.1\t1.20", "0.5\t98.3\t1.21", "1\t99.0\t1.25\t#* Drug added", "1.5\t99.4\t1.30"].join("\n"));
    d = await openRecipes();
    await d.getByLabel("Export file to import").setInputFiles(LAB);
    await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
    await shoot("recipe-labchart", { target: "viewport", axe: "dialog[open]" });
    await page.keyboard.press("Escape");
    const block = (label, f) => [label, "\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12",
      ..."ABCDEFGH".split("").map((row, r) => [row, ...Array.from({ length: 12 }, (_, c) => f(r, c).toFixed(3))].join("\t")), ""].join("\n");
    const READS = write("multiread.txt", ["Plate: run 1", "", block("Read 1:450", (r, c) => 0.1 + r * 0.01 + c * 0.001),
      block("Read 2:620", (r) => 0.05 + r * 0.001)].join("\n"));
    d = await openRecipes();
    await d.getByLabel("Export file to import").setInputFiles(READS);
    await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
    await d.getByRole("tab", { name: "Columns" }).click();
    await shoot("recipe-multiread", { target: "viewport", axe: "dialog[open]" });
    await page.keyboard.press("Escape");
    const files = {};
    ["ctrl", "drug"].forEach((cond, ci) => [1, 2, 3].forEach((rep) => {
      files[`${cond}_rep${rep}_img03.csv`] = strToU8([" ,Area,Mean", ...[0, 1, 2].map((i) => `${i + 1},${10 + ci * 5 + rep + 2 * i},${100 + i}`)].join("\n"));
    }));
    const ZIP = join(OUT, "per-image.zip");
    writeFileSync(ZIP, zipSync(files));
    await page.getByRole("button", { name: "Import…" }).click();
    await page.getByRole("dialog", { name: "Import data" }).getByLabel("File to import").setInputFiles(ZIP);
    d = page.getByRole("dialog", { name: "Import with a recipe" });
    await d.getByLabel("Files stacked").waitFor({ timeout: 10000 });
    await d.getByRole("tab", { name: "Columns" }).click();
    await shoot("recipe-many-files", { target: "viewport", axe: "dialog[open]" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Import…" }).click();
    await shoot("recipe-saved", { target: "viewport", axe: "dialog[open]" });
    await page.keyboard.press("Escape");
  },

  async big() {
    await fresh();
    await newTable("column", "Hundred thousand");
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const big = Array.from({ length: 100000 }, () => `${(10 + 3 * rnd()).toFixed(3)}\t${(10.4 + 3 * rnd()).toFixed(3)}`).join("\n");
    await pasteAt("Group A, row 1", big);
    const imp = page.locator(".import-dialog");
    await imp.waitFor({ timeout: 60000 });
    await imp.getByRole("tab", { name: "Placement" }).click();
    await imp.getByLabel(/In place of the table/).check();
    await imp.getByRole("button", { name: "Import", exact: true }).click();
    await imp.waitFor({ state: "detached", timeout: 120000 });
    await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?._fullData ?? [])
      .some((t) => t.type === "scattergl"), null, { timeout: 120000 }).catch(() => {});
    await page.evaluate(() => { const w = document.querySelector(".data-table"); w.scrollTop = Math.round(w.scrollHeight / 2); });
    await page.waitForTimeout(1500);
    await shoot("big-grid", { target: "viewport", axe: "main" });
  },
};

for (const [name, run] of Object.entries(scenes)) {
  if (ONLY && !ONLY.has(name)) continue;
  const t0 = Date.now();
  try {
    await run();
    console.log(`ok   ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    console.log(`FAIL ${name}: ${e.message.split("\n")[0]}`);
    errors.push(`${name}: ${e.message.split("\n")[0]}`);
    await page?.screenshot({ path: join(OUT, `${name}-FAILED.png`) }).catch(() => {});
  }
}
await browser.close();
writeFileSync(join(OUT, "axe.json"), JSON.stringify([...new Set(axeFound)], null, 1));
console.log(`\n${shots.length} screenshots in ${OUT}`);
console.log(`axe-core: ${new Set(axeFound).size} violations${axeFound.length ? ":" : ""}`);
for (const v of new Set(axeFound)) console.log(`  ${v}`);
console.log(`errors: ${errors.length ? "" : "none"}`);
for (const e of errors) console.log(`  ${e}`);
