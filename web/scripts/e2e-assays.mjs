// End-to-end check of the assay modules (src/sheets/assays): each one is
// started from New data table › Start from an assay, its wizard is run,
// and the numbers on its results sheet and in its linked tables are
// compared with values computed natively by the Python engine on the same
// data (see each module's sample.ts):
// - plate reader: example plate Z′ 0.8491, the linked XY fit of Drug A
//   LogIC50 −0.2703 (µM), a reading edit flowing into the linked table,
//   two pasted plates as one XY table per plate;
// - standard curve: LLOQ 15.63 pg/mL (the 7.81 standard fails on CV),
//   S1 at 95.26 pg/mL after the 1:2 dilution, parallelism P 0.659, the
//   concentrations table, refitting without a standard;
// - qPCR: the reference check flags ACTB (shifts 1.4 cycles, P = 0.0044;
//   geNorm M 0.592), "Use GAPDH only" gives IL6 11.88; IL6 fold change
//   LPS vs Control 11.71 with both references, and Livak & Schmittgen
//   (2001) Table 1 pasted as a Cq export: kidney vs brain ΔCq 4.365,
//   fold change 5.6;
// - flow cytometry: a FlowJo table of 3 donors × 4 conditions pasted,
//   the linked per-donor table (3 rows × 4 conditions), RM one-way ANOVA
//   on the donor values F(3, 6) = 474.1, "n = 3 donors" in the legend,
//   the graph a SuperPlot;
// - densitometry: the example's ratio 2.427 (P = 0.000755), and the
//   GraphPad ratio paired t test example pasted as an export: ratio
//   2.015, 95% CI 1.881 to 2.158, P = 0.0005;
// - time course: the GTT example's mixed model (Group, Time, Group × Time),
//   the AIC comparison of four covariance structures, the group-means
//   graph, AUC per mouse and a 60-120 min window summary.
// Usage: node scripts/e2e-assays.mjs http://localhost:5196/
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// The header's File menu (DECISIONS 5): open it, pick an item.
const fileMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};

// ?example=1 opens the example project directly (no start screen, no tour).
const url = (() => {
  const u = new URL(process.argv[2] ?? "http://localhost:5173/");
  u.searchParams.set("example", "1");
  return u.toString();
})();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
const navRow = (name) => page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .nav-row");
const card = (sel) => page.locator(sel).first();
const textOf = async (sel) => (await card(sel).innerText()).replace(/\s+/g, " ");
const waitText = (sel, text, timeout = 60000) => page.waitForFunction(([s, t]) =>
  document.querySelector(s)?.textContent?.includes(t), [sel, text], { timeout })
  .then(() => true, () => false);
const cell = (label) => page.locator(`.data-table input[aria-label="${label}"]`);
const waitCell = (label, test, timeout = 20000) => page.waitForFunction(([l, src]) => {
  const v = document.querySelector(`.data-table input[aria-label="${l}"]`)?.value;
  return v !== undefined && new Function("v", `return ${src}`)(v);
}, [label, test], { timeout }).then(() => true, () => false);
// The Notes strip's "Analysed" line under the results (P-16), found by its
// region's name; waits until it holds `text` (a substring), then returns it.
const notesRegion = () => page.getByRole("region", { name: "Notes on the data analysed" });
const analysedLine = async (text, timeout = 60000) => {
  const line = notesRegion().locator(".analysed-line").filter({ hasText: text }).first();
  if (!(await line.waitFor({ timeout }).then(() => true, () => false))) {
    return notesRegion().locator(".analysed-line").first().innerText().catch(() => "no Analysed line");
  }
  return (await line.innerText()).replace(/\s+/g, " ").trim();
};
// axe-core (WCAG 2 A/AA, contrast included) on parts of the page.
const axeViolations = async (selectors) => {
  await page.evaluate(readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8")).catch(() => {});
  return page.evaluate(async (sels) => {
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

const wizard = () => page.locator("dialog.assay-wizard");
async function startAssay(label, { sample = true, name } = {}) {
  await fileMenu(page, "New data table…");
  const dlg = page.locator(".new-table-dialog");
  await dlg.getByRole("radio", { name: "Start from an assay" }).check();
  const re = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  await dlg.getByRole("radio", { name: re }).check();
  if (name) await dlg.getByLabel("Assay table name").fill(name);
  if (!sample) await dlg.getByText("An empty layout").click();
  await dlg.getByRole("button", { name: "Start assay" }).click();
  await wizard().waitFor({ timeout: 30000 });
}
async function nextStep() {
  await wizard().getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(250);
}
async function finishWizard() {
  for (let i = 0; i < 8; i++) {
    const next = wizard().getByRole("button", { name: "Next", exact: true });
    if (!(await next.count())) break;
    if (await next.isDisabled()) {
      throw new Error(`wizard blocked: ${await wizard().locator(".wizard-blocker").innerText().catch(() => "?")}`);
    }
    await next.click();
    await page.waitForTimeout(250);
  }
  await wizard().locator(".modal-actions .wizard-next").click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });

// --- the Analyze menu offers assays on existing tables ---
await page.getByRole("button", { name: "Analyze", exact: true }).click();
expect("Analyze on an XY table lists the standard-curve assay",
  await page.getByRole("menuitem", { name: /^Assay: Standard curve/ }).count() === 1);
await page.keyboard.press("Escape");

// --- plate reader → dose-response ---
await startAssay("Plate reader → dose-response");
expect("the plate wizard opens with the example plate map (72 compound wells)",
  (await wizard().innerText()).includes("Plate readings"));
await nextStep();
expect("plate map step shows the three compounds",
  (await wizard().locator(".plate-legend").innerText()).includes("Drug C: 18 wells"));
await nextStep();
expect("QC preview in the wizard: Z′ 0.849", await waitText("dialog.assay-wizard .results-table", "0.849", 30000));
await finishWizard();
await page.waitForSelector(".plate-results .assay-stat", { timeout: 60000 });
const plateQc = await textOf(".plate-results");
expect("plate QC: Z′ 0.849 (excellent), plate passes", plateQc.includes("Z′ 0.849 excellent")
  && plateQc.includes("Plate passes QC"), plateQc.slice(0, 160));
expect("plate QC: robust Z′ 0.864 and S/B 12.7", plateQc.includes("0.864") && plateQc.includes("12.7"));
// P-16: the Analysed line counts the mapped wells read (engine plate_qc wells)
const plateLine = await analysedLine("mapped wells read");
expect("P-16 plate: Analysed: 96 of 96 mapped wells read (72 sample, 24 control).",
  plateLine === "Analysed: 96 of 96 mapped wells read (72 sample, 24 control).", plateLine);
await page.locator(".plate-results").getByRole("button", { name: "Open “Dose-response of Plate”" }).click();
await page.waitForSelector(".results-table tr:has-text('LogIC50')", { timeout: 60000 });
await page.waitForTimeout(800);
const drugA = (await page.locator(".result-card", { hasText: "Drug A" }).locator("tr", { hasText: "LogIC50" })
  .first().innerText()).replace(/\s+/g, " ");
expect("linked XY fit of Drug A: LogIC50 −0.2703 (µM)", drugA.includes("-0.2703"), drugA);
expect("linked dose-response table is read-only and linked",
  await page.locator(".origin-note").count() === 1
  && await cell("Drug A, Y1, row 1").getAttribute("readonly") !== null);
const firstY = await cell("Drug A, Y1, row 1").inputValue();
// A11: (1.277 − 0.04975) / (1.242625 − 0.04975) × 100
expect("lowest Drug A dose (A11): 102.88% of control", firstY.startsWith("102.88"), firstY);
await navRow("Plate").click();
await cell("11, row 1").fill("1.24262");
await page.waitForTimeout(400);
await navRow("Dose-response of Plate (linked)").click();
expect("editing a reading flows into the linked table (≈ 100% of control)",
  await waitCell("Drug A, Y1, row 1", "Math.abs(Number(v) - 100) < 0.01"));
// P-16: a cleared reading is named by its well and why
await navRow("Plate").click();
await cell("4, row 1").fill("");
await page.keyboard.press("Tab");
const plateDrop = await analysedLine("1 well left out");
expect("P-16 plate: a blank well is left out by name (A4, blank)",
  plateDrop === "Analysed: 95 of 96 mapped wells read (71 sample, 24 control); 1 well left out: A4 (blank).", plateDrop);

// two plates pasted, one XY table per plate
await navRow("Plate").click();
await page.getByRole("button", { name: "Open setup wizard…" }).click();
await wizard().waitFor();
const plateRows = [
  [0.046, 1.216, 0.154, 0.251, 0.454, 0.777, 1.007, 1.152, 1.138, 1.224, 1.277, 0.086],
  [0.054, 1.186, 0.16, 0.261, 0.479, 0.829, 1.109, 1.162, 1.269, 1.249, 1.233, 0.103],
  [0.05, 1.275, 0.159, 0.263, 0.478, 0.741, 1.005, 1.166, 1.23, 1.253, 1.293, 0.112],
  [0.047, 1.246, 0.196, 0.485, 0.865, 1.099, 1.238, 1.246, 1.29, 1.264, 1.205, 0.095],
  [0.054, 1.338, 0.21, 0.474, 0.92, 1.099, 1.275, 1.266, 1.208, 1.316, 1.218, 0.105],
  [0.055, 1.242, 0.206, 0.501, 0.909, 1.191, 1.296, 1.162, 1.262, 1.275, 1.184, 0.084],
  [0.042, 1.239, 0.123, 0.162, 0.261, 0.414, 0.606, 0.833, 1.084, 1.153, 1.174, 0.094],
  [0.05, 1.199, 0.126, 0.176, 0.248, 0.394, 0.658, 0.938, 1.091, 1.066, 1.188, 0.104],
];
const block = (k) => ["\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12",
  ...plateRows.map((r, i) => `${"ABCDEFGH"[i]}\t${r.map((v) => +(v * k).toFixed(4)).join("\t")}`)].join("\n");
await wizard().getByLabel("Paste plate grid").fill(`Reader export\n${block(1)}\n\nPlate 2\n${block(2)}`);
await wizard().getByRole("button", { name: "Read pasted plates" }).click();
expect("two pasted plates are read", (await wizard().innerText()).includes("Read 2 plates of 96 wells"));
await nextStep(); await nextStep(); await nextStep();
await wizard().getByText("One XY table per plate").click();
await finishWizard();
expect("per-plate output: a second linked XY table",
  await navRow("Dose-response of Plate, plate 2 (linked)").count() === 1);
await waitText(".plate-results", "2 plates of 96 wells");
const two = await textOf(".plate-results");
expect("two-plate QC summary: Z′ 0.849 on both plates (Z′ is scale-free)",
  (two.match(/Plate \d 0\.849/g) ?? []).length === 2, two.slice(0, 220));

// a labelled 384-well export (rows A–P, columns 1–24) is read whole, not
// as its 96-well top-left corner; the same grid without labels too
await page.getByRole("button", { name: "Open setup wizard…" }).click();
await wizard().waitFor();
const well384 = (r, c) => (0.05 + 1.1 / (1 + 10 ** ((12 - c) * 0.4)) + 0.002 * r).toFixed(4);
const grid384 = Array.from({ length: 16 }, (_, r) => Array.from({ length: 24 }, (_, c) => well384(r, c)));
const labelled384 = ["\t" + Array.from({ length: 24 }, (_, c) => c + 1).join("\t"),
  ...grid384.map((row, r) => `${"ABCDEFGHIJKLMNOP"[r]}\t${row.join("\t")}`)].join("\n");
await wizard().getByLabel("Plate format").selectOption("384");
await wizard().getByLabel("Paste plate grid").fill(`Reader export\n${labelled384}`);
await wizard().getByRole("button", { name: "Read pasted plates" }).click();
const read384 = (await wizard().locator("[role=status]").allInnerTexts()).join(" ");
expect("a labelled 16 × 24 grid is read as 384 wells", /Read 1 plate of 384 wells\./.test(read384)
  && !/Not read/.test(read384), read384);
await wizard().getByLabel("Paste plate grid").fill(grid384.map((r) => r.join("\t")).join("\n"));
await wizard().getByRole("button", { name: "Read pasted plates" }).click();
const bare384 = (await wizard().locator("[role=status]").allInnerTexts()).join(" ");
expect("the same grid without labels: 384 wells", /Read 1 plate of 384 wells/.test(bare384), bare384);
await wizard().getByRole("button", { name: "Cancel" }).click();
await wizard().waitFor({ state: "detached", timeout: 10000 });

// --- standard curve / ELISA ---
await startAssay("Standard curve / ELISA");
await finishWizard();
await page.waitForSelector(".std-results .assay-stat", { timeout: 60000 });
const std = await textOf(".std-results");
expect("standard curve: run accepted, LLOQ 15.63 and ULOQ 1000 pg/mL",
  std.includes("Run accepted") && std.includes("LLOQ (pg/mL) 15.63") && std.includes("ULOQ (pg/mL) 1000"), std.slice(0, 200));
const s1 = (await page.locator(".std-unknowns tr", { hasText: /^S1/ }).first().innerText()).replace(/\s+/g, " ");
expect("S1: 47.63 interpolated, 95.26 pg/mL after the 1:2 dilution", s1.includes("47.63") && s1.includes("95.26"), s1);
const s7 = (await page.locator(".std-unknowns tr", { hasText: /^S7/ }).first().innerText()).replace(/\s+/g, " ");
expect("S7 is reported as > ULOQ and flagged extrapolated, not as a number",
  s7.includes(">ULOQ") && s7.includes("extrapolated") && !s7.includes("2499"), s7);
expect("parallelism of the QC pool: CV 3.24%, F test P 0.659, parallel",
  std.includes("3.24%") && std.includes("P = 0.659") && std.includes("parallel"));
// P-16: replicates in the fit (engine standards), reportable unknowns and
// the ones out of range by name and row
const stdLine = await analysedLine("replicates at 8 levels");
expect("P-16 standard curve: 16 replicates at 8 levels, 10 of 12 dilutions reportable, S8 < LLOQ and S7 > ULOQ by row",
  stdLine === "Analysed: standards: 16 replicates at 8 levels in the fit, blank subtracted (2 replicates); unknowns: "
    + "10 of 12 dilutions reportable, 1 below the LLOQ (S8 1:2, row 21), 1 above the ULOQ (S7 1:2, row 20).", stdLine);
await page.locator(".std-results").getByRole("button", { name: "Open “Concentrations of ELISA”" }).click();
expect("concentrations table: Control S1 mean 95.27 pg/mL",
  await waitCell("Control, row 1", "v.startsWith('95.266')"), await cell("Control, row 1").inputValue());
expect("concentrations table has Control and Treated columns (QC pool left out)",
  await cell("Treated, row 3").count() === 1 && await page.locator(".data-table input[aria-label^='QC pool']").count() === 0);
await navRow("ELISA").click();
await page.waitForSelector(".std-results", { timeout: 30000 });
await page.getByLabel("Use the 7.81 standard in the fit").uncheck();
expect("leaving out the failing standard refits: 7 of 7 levels pass",
  await waitText(".std-results", "7 / 7"));
expect("P-16 standard curve: the standard left out is said, with its rows; 14 replicates at 7 levels",
  (await analysedLine("14 replicates at 7 levels")).startsWith("Analysed: standards: 14 replicates at 7 levels in the fit")
  && await notesRegion().getByText("The 7.81 pg/mL standard was left out of the fit: excluded by the user (row 8).")
    .waitFor({ timeout: 30000 }).then(() => true, () => false));
// P-103 acceptance: the kit prescribes "Cubic spline (no CI)": unknowns are
// read off the natural cubic spline through the level means on log10
// concentration (engine/tests/reference/smoothing.py, kit_elisa: S1 47.60,
// 95.20 pg/mL after 1:2, by a tridiagonal solve and bisection) and the
// results say no model CI exists
{
  const kit = JSON.parse(readFileSync(new URL("../../engine/tests/reference/smoothing.json", import.meta.url), "utf8"))
    .kit_elisa;
  const sig4 = (v) => String(Number(v.toPrecision(4)));
  await page.getByLabel("Standard curve model").first().selectOption({ label: "Cubic spline (no CI)" });
  const s1Want = `${sig4(kit.S1.spline[0])}`;
  const s1Row = () => page.locator(".std-unknowns tr", { hasText: /^S1/ }).first().innerText()
    .then((t) => t.replace(/\s+/g, " "), () => "");
  const spl = await page.waitForFunction((w) => [...document.querySelectorAll(".std-unknowns tr")]
    .some((tr) => /^S1/.test(tr.innerText) && tr.innerText.includes(w) && /no model CI/.test(tr.innerText)),
  s1Want, { timeout: 60000 }).then(() => true, () => false);
  const row = await s1Row();
  expect(`P-103 acceptance: cubic spline (no CI): S1 ${s1Want} pg/mL, ${sig4(2 * kit.S1.spline[0])} after 1:2, "no model CI"`,
    spl && row.includes(sig4(2 * kit.S1.spline[0])), row);
  const plate = await textOf(".std-results");
  expect("P-103 the spline curve has no parameters, R² or weighting, and no F test of parallelism",
    plate.includes("an interpolating curve: no parameters, no R², no model CI")
    && plate.includes("an interpolating curve has no parameters"), plate.slice(0, 300));
  await page.getByLabel("Standard curve model").first().selectOption({ label: "Point to point (no CI)" });
  const p2p = sig4(kit.S1.point_to_point[0]);
  expect(`P-103 point to point (no CI): S1 ${p2p} pg/mL`, await page.waitForFunction((w) =>
    [...document.querySelectorAll(".std-unknowns tr")].some((tr) => /^S1/.test(tr.innerText) && tr.innerText.includes(w)
      && /no model CI/.test(tr.innerText)), p2p, { timeout: 60000 }).then(() => true, () => false), await s1Row());
  const methods = await page.locator(".methods-text").first().innerText().catch(() => "");
  expect("P-103 the methods say interpolated concentrations have no model-based CI",
    /no model-based confidence interval and none is reported/.test(methods), methods.slice(0, 200));
  await page.getByLabel("Standard curve model").first().selectOption({ label: "Four-parameter logistic (4PL), X = log(concentration)" });
  await page.waitForFunction(() => /95% CI|\d to \d/.test(document.querySelector(".std-unknowns")?.textContent ?? ""),
    null, { timeout: 60000 }).catch(() => {});
}

// --- qPCR ---
// The example's ACTB is 1.4 cycles higher in LPS + inhibitor (engine
// qpcr_reference_check: one-way ANOVA P = 0.0044, geNorm M 0.592 for
// both references), so the reference check flags it before any fold
// change; GAPDH alone gives IL6 LPS vs Control 11.88 (6.889 to 20.47).
const ACTB_CHIP = "ACTB shifts with treatment by 1.4 Cq (P = 0.0044): do not normalise to it";
await startAssay("qPCR (ΔCq / ΔΔCq)");
await wizard().getByRole("button", { name: /Reference check/ }).click();
expect("qPCR wizard: the Reference check step flags ACTB before any fold change",
  await waitText("dialog.assay-wizard .qpcr-refs", ACTB_CHIP, 60000)
  && (await textOf("dialog.assay-wizard .qpcr-refs")).includes("GAPDH stable (M = 0.59)"),
  await textOf("dialog.assay-wizard .wizard-body").catch(() => ""));
await finishWizard();
await page.waitForSelector(".qpcr-results .qpcr-target", { timeout: 60000 });
const il6 = (await page.locator(".qpcr-target", { hasText: "IL6" }).locator("tr", { hasText: /^LPS vs\. Control/ })
  .first().innerText()).replace(/\s+/g, " ");
expect("qPCR: IL6 fold change LPS vs Control 11.71 (CI 8.218 to 16.69)",
  il6.includes("11.71") && il6.includes("8.218 to 16.69"), il6);
// P-69: "What this means" of the qPCR module: the fold change and CI of the
// sheet's LPS vs. Control row in words
const qMeaning = (await page.locator(".pane-answer .meaning-sentence").first().innerText().catch(() => ""))
  .replace(/\s+/g, " ");
expect("P-69 qPCR meaning: IL6 11.71-fold higher in LPS than in Control (95% CI 8.218 to 16.69), as the row shows",
  qMeaning.includes("IL6 expression in LPS was 11.71-fold higher than in Control (fold change 11.71, 95% CI 8.218 to 16.69)")
  && il6.includes("11.71") && il6.includes("8.218 to 16.69"), qMeaning);
const qLine = await analysedLine("sample wells used");
expect("P-16 qPCR: 108 of 108 sample wells used, 3 samples per group",
  qLine === "Analysed: 108 of 108 sample wells used; samples per group: Control 3, LPS 3, LPS + inhibitor 3.", qLine);
expect("qPCR: MIQE 2.0 note on statistics on ΔCq",
  (await textOf(".qpcr-results")).includes("Statistics are computed on ΔCq"));
expect("qPCR: the flagged ACTB replicate set of CON-1 is listed",
  (await textOf(".qpcr-results")).includes("replicates spread"));
const refBlock = await textOf(".qpcr-results .qpcr-refs");
const mOf = async (gene) => (await page.locator(".qpcr-ref-table tr", { hasText: new RegExp(`^${gene}`) })
  .first().locator("td").nth(4).innerText()).trim();
expect("qPCR reference genes: shown above the fold changes, geNorm M for each reference",
  await page.locator(".qpcr-results .qpcr-refs ~ .qpcr-target").count() === 2
  && await mOf("GAPDH") === "0.592" && await mOf("ACTB") === "0.592", `${await mOf("GAPDH")} / ${await mOf("ACTB")}`);
expect("qPCR reference genes: ACTB shifts with treatment (chip), GAPDH stable, ACTB in use is warned",
  refBlock.includes(ACTB_CHIP) && refBlock.includes("GAPDH stable (M = 0.59)")
  && refBlock.includes("ACTB is in use but shifts with treatment") && refBlock.includes("18.42 (+1.44)"),
  refBlock.slice(0, 400));
await page.waitForTimeout(800); // let the results settle (fade-in) before measuring contrast
const axeRefs = await axeViolations([".qpcr-results .qpcr-refs"]);
expect("axe-core: the reference-gene block passes", axeRefs.length === 0, axeRefs.join(" | "));
await page.locator(".qpcr-results .qpcr-refs").getByRole("button", { name: "Use GAPDH only" }).click();
expect("one click: GAPDH only, IL6 LPS vs Control 11.88 (6.889 to 20.47), ACTB still shown as not used",
  await page.waitForFunction(() => {
    const il6Block = [...document.querySelectorAll(".qpcr-target")].find((b) => /^IL6/.test(b.querySelector("h4")?.textContent ?? ""));
    const row = [...(il6Block?.querySelectorAll("tr") ?? [])].find((r) => /^LPS vs\. Control/.test(r.textContent ?? ""));
    return /11\.88/.test(row?.textContent ?? "") && /6\.889 to 20\.47/.test(row?.textContent ?? "");
  }, null, { timeout: 60000 }).then(() => true, () => false)
  && (await textOf(".qpcr-ref-table")).includes("ACTB")
  && (await textOf(".qpcr-results .qpcr-refs")).includes("normalised to GAPDH.")
  && await page.locator(".qpcr-target h4", { hasText: /^ACTB/ }).count() === 0);
expect("qPCR methods record which references were used and why",
  await waitText(".pane-methods", "ACTB shifted with treatment (M = 0.59; 1.4 cycles between groups, P = 0.0044) and was not used"));
const asideLine = await analysedLine("set aside");
expect("P-16 qPCR: GAPDH only, ACTB's 27 wells set aside and not counted",
  asideLine === "Analysed: 81 of 81 sample wells used; ACTB (27 wells) set aside by the reference check, not used; "
    + "samples per group: Control 3, LPS 3, LPS + inhibitor 3.", asideLine);
// an undetermined well is named by sample, target and well
await navRow("qPCR").click();
await cell("Cq, row 1").fill("Undetermined");
await page.keyboard.press("Tab");
const undet = await analysedLine("without a Cq");
expect("P-16 qPCR: an Undetermined Cq is left out by name (CON-1 GAPDH A1)",
  undet.startsWith("Analysed: 80 of 81 sample wells used; 1 well without a Cq left out: CON-1 GAPDH A1 (“Undetermined”);"), undet);

const livak = { Brain: { "c-myc": [30.72, 30.34, 30.58, 30.34, 30.50, 30.43], GAPDH: [23.70, 23.56, 23.47, 23.65, 23.69, 23.68] },
  Kidney: { "c-myc": [27.06, 27.03, 27.03, 27.10, 26.99, 26.94], GAPDH: [22.76, 22.61, 22.62, 22.60, 22.61, 22.76] } };
const csv = ["Well,Sample Name,Target Name,CT"];
let w = 0;
for (const [tissue, genes] of Object.entries(livak)) {
  for (const [gene, cts] of Object.entries(genes)) for (const c of cts) csv.push(`W${++w},${tissue},${gene},${c}`);
}
await startAssay("qPCR (ΔCq / ΔΔCq)", { sample: false, name: "Livak Table 1" });
await wizard().getByLabel("Paste Cq export").fill(csv.join("\n"));
await wizard().getByRole("button", { name: "Read pasted export" }).click();
expect("Livak Table 1 export read (24 wells)", (await wizard().innerText()).includes("Read 24 wells"));
await finishWizard();
await page.waitForSelector(".qpcr-results .qpcr-target", { timeout: 60000 });
const kid = (await page.locator(".qpcr-target tr", { hasText: /^Kidney/ }).first().innerText()).replace(/\s+/g, " ");
const fold = Number(kid.split(" ").find((x) => Number(x) > 5 && Number(x) < 6));
expect("Livak & Schmittgen Table 1: kidney ΔCq 4.365, fold change 5.6",
  kid.includes("4.365") && fold.toFixed(1) === "5.6", kid);

// The same table with the paper's own headers (tissue, replicate, target,
// Ct): no column is called a sample, so the wizard asks which column is
// which (prefilled: tissue, target, Ct) instead of refusing the export.
const paperCsv = ["tissue,replicate,target,Ct", ...csv.slice(1).map((l) => {
  const [, tissue, gene, ct] = l.split(",");
  return `${tissue},1,${gene},${ct}`;
})];
await startAssay("qPCR (ΔCq / ΔΔCq)", { sample: false, name: "Livak paper headers" });
await wizard().getByLabel("Paste Cq export").fill(paperCsv.join("\n"));
await wizard().getByRole("button", { name: "Read pasted export" }).click();
expect("qPCR export without a sample header: the mapping step is shown, prefilled",
  await wizard().getByLabel("Sample column").inputValue() === "0"
  && await wizard().getByLabel("Target (gene) column").inputValue() === "2"
  && await wizard().getByLabel("Cq / Ct column").inputValue() === "3"
  && !(await wizard().innerText()).includes("No Cq table found"));
await wizard().getByRole("button", { name: "Use these columns" }).click();
expect("the mapped export is read (24 wells)", (await wizard().innerText()).includes("Read 24 wells"));
await finishWizard();
await page.waitForSelector(".qpcr-results .qpcr-target", { timeout: 60000 });
const kid2 = (await page.locator(".qpcr-target tr", { hasText: /^Kidney/ }).first().innerText()).replace(/\s+/g, " ");
expect("mapped columns give the same kidney ΔCq 4.365", kid2.includes("4.365"), kid2);

// --- Flow cytometry summary (flow-stats-to-tests) ---
// The module's example (src/sheets/assays/flow/sample.ts) pasted as a
// FlowJo table: % CD69+ of 3 donors × 4 conditions. Engine: flow_summary
// gives one value per donor and condition; repeated-measures one-way
// ANOVA on them, F(3, 6) = 474.1 (donor as the block).
{
  const conds = ["Unstim", "aCD3", "aCD3+aCD28", "PMA+Iono"];
  const freq = [[2.1, 3.4, 1.6], [18.5, 24.2, 14.8], [35.2, 41.7, 29.9], [78.4, 85.1, 71.6]];
  const median = [[412, 455, 389], [1830, 2210, 1540], [3120, 3650, 2780], [8950, 9840, 8120]];
  const lines = [",Lymphocytes/Single Cells/Live/CD4+/CD69+ | Freq. of Parent,"
    + "Lymphocytes/Single Cells/Live/CD4+/CD69+ | Median (BV421-A)"];
  let tube = 0;
  for (let dn = 0; dn < 3; dn++) {
    conds.forEach((c, j) => lines.push(`D${dn + 1}_${c}_${String(++tube).padStart(3, "0")}.fcs,${freq[j][dn]},${median[j][dn]}`));
  }
  lines.push("Mean,34.4,3775", "SD,29.6,3392");
  await startAssay("Flow cytometry", { sample: false, name: "CD69 flow" });
  await wizard().getByLabel("Paste FlowJo table").fill(lines.join("\n"));
  await wizard().getByRole("button", { name: "Read pasted table" }).click();
  expect("flow: the pasted FlowJo table is read (12 samples, summary rows dropped)",
    (await wizard().innerText()).includes("Read 12 samples and 2 statistic columns"));
  await nextStep();
  expect("flow: % CD69+ (Freq. of Parent) is the statistic by default",
    (await wizard().getByRole("combobox", { name: /^Statistic/ }).inputValue()).endsWith("CD69+ | Freq. of Parent"));
  await nextStep();
  expect("flow: names split into 3 donors × 4 conditions",
    (await wizard().innerText()).includes("3 donors (D1, D2, D3) × 4 conditions (Unstim, aCD3, aCD3+aCD28, PMA+Iono)"));
  await nextStep();
  await nextStep();
  expect("flow preview: % CD69+ per donor and the planned RM ANOVA",
    await waitText("dialog.assay-wizard .flow-values", "85.1")
    && (await wizard().innerText()).includes("repeated-measures one-way ANOVA (4 conditions, donor as the block)"));
  await finishWizard();
  await page.waitForSelector(".flow-results .flow-values", { timeout: 60000 });
  await page.waitForTimeout(800);
  const axeFlow = await axeViolations([".flow-results"]);
  expect("axe-core: the flow results pass", axeFlow.length === 0, axeFlow.join(" | "));
  // P-31 (ruling 10, methods wording pinned): the full FlowJo gate path,
  // not the last gate; before: "Gate statistics (CD69+ · Freq. of Parent)"
  expect("P-31: the methods name the full gate path, CD69+ of Lymphocytes/Single Cells/Live/CD4+",
    await waitText(".pane-methods", "Gate statistics (CD69+ of Lymphocytes/Single Cells/Live/CD4+, Freq. of Parent) "
      + "were exported from FlowJo and summarised to one value per donor and condition"),
    await textOf(".pane-methods").catch(() => ""));
  const flowLine = await analysedLine("rows:");
  expect("P-16 flow: 12 of 12 rows, 3 donors × 4 conditions",
    flowLine === "Analysed: 12 of 12 rows: 3 donors × 4 conditions, one value per donor and condition.", flowLine);
  expect("P-31: the results line names the full gate path too",
    (await textOf(".flow-results .model-line")).startsWith("CD69+ of Lymphocytes/Single Cells/Live/CD4+, Freq. of Parent: one value per donor"));
  const linkedBtn = page.locator(".flow-results").getByRole("button", { name: "Open “Per donor of CD69 flow”" });
  await linkedBtn.waitFor({ timeout: 60000 });
  await linkedBtn.click();
  await page.waitForSelector(".data-table", { timeout: 30000 });
  expect("flow: the linked table has 3 donor rows × 4 condition data sets (plus the donor column)",
    await cell("PMA+Iono, row 3").count() === 1 && await cell("PMA+Iono, row 4").count() === 0
    && await cell("Unstim, row 1").count() === 1 && await cell("Donor, row 2").count() === 1
    && await page.locator(".data-table input[aria-label^='aCD3+aCD28, row']").count() === 3,
    await page.locator(".data-table thead").innerText().catch(() => ""));
  expect("flow: the linked table holds donor 2's PMA+Iono value 85.1",
    await cell("PMA+Iono, row 2").inputValue() === "85.1");
  await navRow("RM one-way ANOVA of Per donor of CD69 flow").click();
  expect("flow: the linked results are an RM one-way ANOVA on donor means, F(3, 6) = 474.1",
    await page.waitForFunction(() => /474\.1/.test(document.querySelector(".pane-results")?.textContent ?? "")
      && /[Rr]epeated[- ]measures/.test(document.querySelector(".pane-results")?.textContent ?? ""),
    null, { timeout: 60000 }).then(() => true, () => false),
    (await textOf(".pane-results")).slice(0, 300));
  const legend = await page.locator(".report-legend p").innerText().catch(() => "");
  expect("flow: the legend counts n = 3 donors", legend.includes("n = 3 donors per group."), legend);
  // P-31 follow-up (ruling 10, legend wording pinned): the legend names the
  // statistic with its full gate path, as the methods do; before, it named
  // no statistic ("… large symbols the mean of each experiment. n = 3
  // donors per group. …")
  const valuesAre = "Values are the FlowJo gate statistic CD69+ of Lymphocytes/Single Cells/Live/CD4+, "
    + "Freq. of Parent. n = 3 donors per group.";
  expect("P-31: the linked results' legend names the statistic and the full gate path",
    legend.includes(valuesAre), legend);
  await navRow("Graph of Per donor of CD69 flow").click();
  const figLegend = page.locator(".figure-legend");
  await figLegend.waitFor({ timeout: 30000 });
  if (!(await figLegend.evaluate((e) => e.open))) await figLegend.locator("summary").click();
  const figText = await page.locator(".figure-legend-text").innerText().catch(() => "");
  expect("P-31: the linked graph's figure legend names the statistic and the full gate path",
    figText.includes(valuesAre), figText);
  await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Graph settings" });
  expect("flow: the graph is a SuperPlot (donor-coloured points, donor means joined)",
    await settings.getByLabel("Colour every point by experiment (SuperPlot)").isChecked()
    && await settings.getByLabel("Join each experiment's means across groups").isChecked());
  await page.keyboard.press("Escape");
}

// --- Western blot densitometry ---
await startAssay("Western blot densitometry");
await finishWizard();
await page.waitForSelector(".dens-results h4", { timeout: 60000 });
const dens = await textOf(".dens-results");
expect("densitometry example: ratio paired t test, ratio 2.427, P 7.552e-4",
  dens.includes("Ratio paired t test") && dens.includes("2.427") && dens.includes("7.552e-4"), dens.slice(0, 300));
expect("the ratio t test is explained", dens.includes("consistently different from 1"));
const densLine = await analysedLine("lanes on");
expect("P-16 densitometry: 16 of 16 lanes on 4 blots, n = 4 blots",
  densLine === "Analysed: 16 of 16 lanes on 4 blots in the ratios; n = 4 blots.", densLine);

const gp = ["Blot,Lane,Group,Target,Reference",
  "B1,1,Control,4.2,1", "B1,2,Treated,8.7,1", "B2,1,Control,2.5,1", "B2,2,Treated,4.9,1",
  "B3,1,Control,6.5,1", "B3,2,Treated,13.1,1"].join("\n");
await startAssay("Western blot densitometry", { sample: false, name: "Ratio t example" });
await wizard().getByLabel("Paste densitometry export").fill(gp);
await wizard().getByRole("button", { name: "Read pasted export" }).click();
await wizard().getByRole("button", { name: "Use these columns" }).click();
await finishWizard();
await page.waitForSelector(".dens-results h4", { timeout: 60000 });
const gpText = await textOf(".dens-results");
const pMatch = /P value \(two-tailed\) ([0-9.e-]+)/.exec(gpText);
expect("GraphPad ratio t example: ratio 2.015, CI 1.881 to 2.158, P = 0.0005",
  gpText.includes("2.015") && gpText.includes("1.881 to 2.158") && pMatch && Number(pMatch[1]).toFixed(4) === "0.0005",
  pMatch?.[0] ?? gpText.slice(0, 200));
await page.locator(".dens-results").getByRole("button", { name: "Open “Normalised bands of Ratio t example”" }).click();
expect("the linked matched table opens with the column ratio paired t test (Treated / Control 2.015)",
  await waitText(".result-card", "Ratio paired t test: Treated / Control")
  && (await textOf(".result-card")).includes("2.015"));

// --- one registry: the modules without a wizard start from the picker too ---
// GTT example, one subcolumn per mouse: trapezoid areas (numpy) chow
// 20602.5, 19290, 21952.5, 20092.5 (mean 20484.375), high-fat diet mean
// 33110.625; unpaired t test t(6) = 10.15, P = 5.31e-5 (scipy).
await fileMenu(page, "New data table…");
const pick = page.locator(".new-table-dialog");
await pick.getByRole("radio", { name: "Start from an assay" }).check();
// The sixteen modules of the registry (sheets/assays/index.ts ASSAYS), in
// display order: the first twelve plus luciferase, wound healing, MIC and
// kinetic reads.
const moduleNames = await pick.locator('label:has(input[name="assay-module"]) .type-option-name').allInnerTexts();
const expectedModules = [
  "Plate reader → dose-response", "Standard curve / ELISA", "qPCR (ΔCq / ΔΔCq)",
  "Western blot densitometry", "Dual-luciferase reporter",
  "Flow cytometry (FlowJo statistics → per-donor tests)", "Growth curves (OD600, counts)",
  "Wound healing (scratch assay)", "MIC (broth microdilution)", "Kinetic plate reads (initial rates)",
  "Tumour growth and longitudinal studies", "Time course (the same subjects measured over time)",
  "Drug combination synergy", "Area under the curve", "Volcano plot from a table", "Clustered heat map",
];
expect("Start from an assay lists all sixteen modules, in registry order",
  await pick.locator('input[name="assay-module"]').count() === 16
  && JSON.stringify(moduleNames) === JSON.stringify(expectedModules), moduleNames.join(" | "));
await pick.getByRole("radio", { name: /^Area under the curve/ }).check();
expect("a module without a wizard says so", !(await pick.locator(".field-note").innerText()).includes("wizard"));
await pick.getByRole("button", { name: "Start assay" }).click();
await page.waitForSelector(".results-table", { timeout: 60000 });
expect("the AUC module opens no wizard", (await wizard().count()) === 0);
expect("AUC example: one area per mouse, chow 20480 (SD 1118), high-fat diet 33110 (SD 2221)",
  await waitText(".pane-results", "Area per experiment")
  && (await textOf(".pane-results")).includes("Chow 20480 1118 559 18710 to 22260 4 20600, 19290, 21950, 20090")
  && (await textOf(".pane-results")).includes("High-fat diet 33110 2221"),
  (await textOf(".pane-results")).slice(0, 400));
expect("AUC example: areas compared by the unpaired t test, t(6) = -10.15",
  (await textOf(".pane-results")).includes("t(6) = -10.15"));
await page.getByRole("button", { name: "Analyze", exact: true }).click();
const assayGroup = page.getByRole("menu", { name: "Add an analysis" })
  .getByRole("group", { name: "Assays" });
expect("the Analyze menu has one Assays group",
  await assayGroup.count() === 1);
expect("both halves' assays are listed under it on an XY table",
  await assayGroup.getByRole("menuitem", { name: /^Assay: Standard curve/ }).count() === 1
  && await assayGroup.getByRole("menuitem", { name: /^Assay: Growth curves/ }).count() === 1
  && await assayGroup.getByRole("menuitem", { name: /^Assay: Area under the curve/ }).count() === 1);
await page.keyboard.press("Escape");

// --- time course (need time-course-models): the GTT example with six mice
// per diet. Native engine mixed_timecourse (compound symmetry, REML):
// Group F(1, 10), Time F(5, 50), Group × Time F(5, 50) = 99.85; AIC of the
// four covariance structures unstructured 421.45 (best), CS 445.52, AR(1)
// 446.90, random slope 448.80. Areas (numpy trapezoid): chow mean 20494,
// high-fat diet 32915, unpaired t(10) = -15.60 (scipy); mean of 60-120 min
// per mouse: t(10) = -16.65 (scipy).
{
  await fileMenu(page, "New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.getByRole("radio", { name: "Start from an assay" }).check();
  await nd.getByRole("radio", { name: /^Time course/ }).check();
  await nd.getByRole("button", { name: "Start assay" }).click();
  expect("time course opens no wizard and fits the mixed model",
    await waitText('.pane-results[data-live="true"]', "Group × Time", 90000) && (await wizard().count()) === 0);
  const rows = await page.locator(".mixed-anova tbody tr").allInnerTexts();
  expect("time course ANOVA: Group, Time and Group × Time rows with F, df and P",
    rows.length === 3 && /^Group\s+F\(1, 10\) = 223\.5\s+< 0\.0001/.test(rows[0])
    && /^Time\s+F\(5, 50\) = 1950\s/.test(rows[1]) && /^Group × Time\s+F\(5, 50\) = 99\.85\s+< 0\.0001/.test(rows[2]),
    rows.join(" | ").replace(/\s+/g, " "));
  // New sheets default to Kenward-Roger df (Prism 11.2's default for mixed
  // models); between-within stays available in the controls and is what
  // sheets saved before the setting existed keep.
  expect("time course: the df note names the Kenward-Roger method (the default)",
    (await textOf(".pane-results")).includes("Denominator df by the Kenward-Roger method, computed from the "
      + "fitted covariance: each test and comparison has its own df, and the standard errors are adjusted for small samples."));
  await page.getByLabel("Degrees of freedom", { exact: true }).selectOption("between_within");
  expect("time course: the df note names the between-within method when it is chosen",
    await waitText('.pane-results[data-live="true"]', "Denominator df by the between-within method: Group is tested "
      + "on 10 df between subjects (12 subjects − 2 groups), Time and Group × Time on 50 df within subjects", 90000));
  await page.getByLabel("Degrees of freedom", { exact: true }).selectOption("kenward_roger");
  expect("time course: back to Kenward-Roger",
    await waitText('.pane-results[data-live="true"]', "Denominator df by the Kenward-Roger method", 90000));
  await page.getByRole("button", { name: "Compare covariance structures (AIC)" }).click();
  expect("covariance comparison: four structures listed",
    await page.waitForFunction(() => document.querySelectorAll(".mixed-aic tbody tr").length === 4, null,
      { timeout: 90000 }).then(() => true, () => false));
  const aic = await page.locator(".mixed-aic tbody tr").allInnerTexts();
  expect("covariance comparison: one best (unstructured, AIC 421.4), compound symmetry AIC 445.5",
    aic.filter((r) => r.includes("Best (lowest AIC)")).length === 1 && /^Unstructured[^]*421\.[45][^]*Best/.test(aic[0])
    && aic.some((r) => /^Compound symmetry[^]*445\.5/.test(r)), aic.join(" | ").replace(/\s+/g, " "));
  expect("the covariance choice cites Littell 2006 and Pinheiro & Bates 2000",
    /Littell et al\. 2006[^]*Pinheiro & Bates 2000/.test(await textOf(".pane-results")));
  const traces = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.meta?.odTag?.role === "points").map((t) => ({ mode: t.mode, err: !!t.error_y?.visible, n: t.x.length })));
  expect("group-means graph: 2 line traces with CI error bars at 6 times",
    traces.length === 2 && traces.every((t) => t.mode === "lines+markers" && t.err && t.n === 6), JSON.stringify(traces));
  expect("group differences at each time: family header adjusted for 6 comparisons (Šídák)",
    (await textOf(".pane-results")).includes("P values adjusted for 6 comparisons (Šídák)"));
  // P-105: stars at each time point on the group-means graph, from the
  // model's own comparisons: each equals the Summary of that time's row in
  // the results (the engine's adjusted P in the project's style)
  {
    await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
    await page.getByRole("dialog", { name: "Graph settings" })
      .getByRole("button", { name: "Pairwise comparisons…" }).click();
    const cd = page.locator("dialog.fmt-dialog");
    await cd.getByLabel("Show stars at each time point").check();
    await cd.getByRole("button", { name: "Apply and close" }).click();
    await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
      .filter((a) => a.name === "time-star").length === 6, null, { timeout: 30000 }).catch(() => {});
    const got = await page.evaluate(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
      .filter((a) => a.name === "time-star").map((a) => [String(a.x), a.text]));
    const want = await page.evaluate(() => {
      const t = [...document.querySelectorAll(".pane-results table.results-table")]
        .find((x) => ["Summary", "P (adjusted)"].every((name) =>
          [...x.querySelectorAll("thead th")].some((h) => h.textContent.trim() === name)));
      return t ? [...t.tBodies[0].rows].map((r) => [r.cells[0].textContent.trim(),
        r.cells[r.cells.length - 1].textContent.trim()]) : [];
    });
    expect("P-105 time course: a star at each of the 6 times, each the Summary of the model's adjusted P",
      got.length === 6 && JSON.stringify(got) === JSON.stringify(want), `${JSON.stringify(got)} / ${JSON.stringify(want)}`);
    const legend = await page.locator(".plot-card .figure-legend-text").textContent().catch(() => "") ?? "";
    expect("P-105 time course: the legend points to the model's Group × Time test and states the star scale",
      legend.includes("They are not a test of the curves: the mixed model's Group × Time test asks whether the "
        + "curves differ in shape") && /\* P ≤ 0\.05/.test(legend), legend);
  }
  // AUC per mouse from the same table, then the summary over 60-120 min
  await page.getByRole("button", { name: "Add: Area under each subject's curve" }).click();
  expect("AUC per mouse: 12 mice compared by the unpaired t test, t(10) = -15.6",
    await waitText(".pane-results", "t(10) = -15.6", 60000));
  expect("AUC per mouse: the per-subject table lists 12 mice",
    await page.locator(".result-card", { hasText: "AUC of each subject" }).locator("tbody tr").count() === 12);
  await page.getByRole("button", { name: "Add: Summary over a time window" }).click();
  await page.getByLabel("From time").fill("60");
  await page.getByLabel("To time").fill("120");
  expect("window 60 to 120 min: mean per mouse compared, t(10) = -16.65",
    await waitText(".pane-results", "t(10) = -16.65", 60000)
    && (await textOf(".pane-results")).includes("Mean of the values in the window, from 60 to 120"));
  await page.locator(".mode-switch [role=tab]", { hasText: "Subject AUC" }).click();
  await page.getByRole("button", { name: "Create the AUC column table" }).click();
  expect("the linked AUC column table opens with its t test: 6 mice per diet (12 values)",
    await waitText(".pane-results", "(n=6)", 60000)
    && (await textOf(".pane-results")).match(/\(n=6\)/g)?.length >= 2
    && await page.locator(".data-table tbody tr").count() >= 6);
}


// --- file pickers decode bytes the same way (P-07). One ImageJ results
// file ("Area (µm²)", "37 °C") as UTF-8, UTF-8 with a BOM, UTF-16LE and
// Windows-1252, and a StepOne export headed "Cт" (Cyrillic te) as UTF-16LE
// and UTF-8 (e2e-fixtures/encodings/make_fixtures.py): the densitometry
// picker, the qPCR picker and the Import dialog read identical tables with
// the symbols intact; a .xls and a .ods workbook are read by the
// densitometry picker (P-34; before, a .xls was refused).
{
  const ENC = new URL("../e2e-fixtures/encodings/", import.meta.url).pathname;
  // the picker's own status line (the step's blocker is another status)
  const status = async () => (await wizard().locator(".assay-setup [role=status]").first().innerText()).trim();
  await startAssay("Western blot densitometry", { sample: false, name: "Encodings" });
  const densRead = [];
  for (const enc of ["utf16le", "cp1252", "utf8-bom", "utf8"]) {
    await wizard().locator('input[aria-label="Densitometry export"]').setInputFiles(`${ENC}imagej-results.${enc}.csv`);
    await page.waitForFunction(() => /rows read/.test(document.querySelector("dialog.assay-wizard")?.textContent ?? ""),
      null, { timeout: 10000 }).catch(() => {});
    const opts = await wizard().locator(".column-picker select").first().locator("option").allInnerTexts();
    densRead.push({ enc, st: await status(), opts: opts.join("|") });
  }
  expect("densitometry picker: the ImageJ file reads the same in UTF-16LE, cp1252, UTF-8 with and without BOM, µm² intact",
    densRead.every((r) => r.st === "6 rows read: check the columns, then use them." && r.opts === densRead[0].opts)
    && densRead[0].opts.includes("Area (µm²)"), JSON.stringify(densRead));
  // P-34: .xls and .ods workbooks are read (one sheet saved by LibreOffice
  // in both, e2e-fixtures/import/make_workbooks.py: 8 rows under a header)
  const IMPF = new URL("../e2e-fixtures/import/", import.meta.url).pathname;
  const wbRead = [];
  const statusIs = (re) => page.waitForFunction((src) => new RegExp(src).test(
    document.querySelector("dialog.assay-wizard .assay-setup [role=status]")?.textContent ?? ""), re.source,
  { timeout: 120000 }).catch(() => {});
  for (const fmt of ["xls", "ods"]) {
    // from a known status (the 6-row CSV), so the workbook's own is the one read
    await wizard().locator('input[aria-label="Densitometry export"]').setInputFiles(`${ENC}imagej-results.utf8.csv`);
    await statusIs(/^6 rows read/);
    await wizard().locator('input[aria-label="Densitometry export"]').setInputFiles(`${IMPF}workbook.${fmt}`);
    await statusIs(/^8 rows read|Could not/);
    wbRead.push(await status());
  }
  expect("densitometry picker: a .xls and a .ods workbook are read (8 rows each), not refused or read as text",
    wbRead.every((s) => s === "8 rows read: check the columns, then use them."), wbRead.join(" | "));
  // P-06 in the pickers: the .ods above has row 7 hidden by hand, kept and
  // reported; the AutoFilter workbook (e2e-fixtures/xlsx/filter-hidden.xlsx,
  // rows 4 to 6 hidden, expected.json) reads its 6 visible rows by default,
  // as the Import dialog does, and 9 after one click on the report; with
  // the columns in use, the click changes the table too.
  const pickerReport = wizard().locator(".workbook-report");
  const reportNow = async () => ((await pickerReport.waitFor({ timeout: 5000 }).then(() => true, () => false))
    ? (await pickerReport.innerText()).replace(/\s+/g, " ") : "");
  const odsReport = await reportNow();
  expect("P-06 picker: the .ods's row hidden by hand is reported and kept (8 rows read)",
    /“Assay”: 1 row is hidden in the workbook \(row 7\): imported/.test(odsReport) && wbRead[1].startsWith("8 rows"), odsReport);
  const XLF = new URL("../e2e-fixtures/xlsx/", import.meta.url).pathname;
  const xlRef = JSON.parse(readFileSync(`${XLF}expected.json`, "utf8"))["filter-hidden.xlsx"].filtered;
  const nVisible = xlRef.rows.length - 1 - xlRef.hiddenRows.length;
  await wizard().locator('input[aria-label="Densitometry export"]').setInputFiles(`${XLF}filter-hidden.xlsx`);
  await page.waitForFunction(() => /hidden by a filter/.test(document.querySelector("dialog.assay-wizard .workbook-report")?.textContent ?? ""),
    null, { timeout: 120000 }).catch(() => {});
  const filtRep = await reportNow();
  const filtSt = await status();
  expect(`P-06 picker: filter-hidden.xlsx reads its ${nVisible} visible rows and says 3 rows are hidden by a filter (rows 4, 5, 6), left out`,
    filtSt === `${nVisible} rows read: check the columns, then use them.`
    && /“filtered”: 3 rows are hidden by a filter in the workbook \(rows 4, 5, 6\): left out, as copying the filtered range in Excel or LibreOffice Calc leaves them out/.test(filtRep),
    `${filtSt} | ${filtRep}`);
  await pickerReport.getByRole("button", { name: "Keep the filtered rows" }).click();
  await statusIs(/^9 rows read/);
  const keptSt = await status();
  expect("P-06 picker: one click keeps the 3 filtered rows (9 rows read) and the report says they are imported",
    keptSt === "9 rows read: check the columns, then use them." && /rows 4, 5, 6\): imported/.test(await reportNow()), keptSt);
  await wizard().getByRole("button", { name: "Use these columns" }).click();
  await statusIs(/^Using 9 lanes/);
  await pickerReport.getByRole("button", { name: "Leave out the filtered rows" }).click();
  await statusIs(/^Using 6 lanes/);
  expect("P-06 picker: with the columns in use, leaving the filtered rows out again puts 6 lanes in the table",
    await status() === "Using 6 lanes.", await status());
  const accept = await wizard().locator('input[aria-label="Densitometry export"]').getAttribute("accept");
  expect("densitometry picker offers .xls and .ods", /\.xls(,|$)/.test(accept ?? "") && /\.ods(,|$)/.test(accept ?? ""), accept);
  await wizard().getByRole("button", { name: "Cancel" }).click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });

  await startAssay("qPCR (ΔCq / ΔΔCq)", { sample: false, name: "StepOne encodings" });
  const qRead = [];
  for (const enc of ["utf16le", "utf8"]) {
    await wizard().locator('input[aria-label="Cq export file"]').setInputFiles(`${ENC}stepone-cq.${enc}.txt`);
    await page.waitForFunction(() => /Read \d+ wells/.test(document.querySelector("dialog.assay-wizard")?.textContent ?? ""),
      null, { timeout: 10000 }).catch(() => {});
    qRead.push({ enc, st: await status() });
  }
  // the header row is found by its "Cт": bytes read in the wrong encoding have none
  expect("qPCR picker: StepOne's Cт column is found in UTF-16LE and UTF-8 alike (8 wells)",
    qRead.every((r) => r.st.startsWith("Read 8 wells.")), JSON.stringify(qRead));
  await wizard().getByRole("button", { name: "Cancel" }).click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });

  // the Import dialog: detects the encoding, keeps the manual override
  await fileMenu(page, "New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByLabel("Table name").fill("Encoded import");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  const imp = page.locator(".import-dialog");
  const impRead = [];
  for (const enc of ["utf16le", "cp1252"]) {
    await imp.locator('input[aria-label="File to import"]').setInputFiles(`${ENC}imagej-results.${enc}.csv`);
    await page.waitForFunction(() => document.querySelectorAll(".import-preview tbody tr").length > 0, null, { timeout: 10000 }).catch(() => {});
    const heads = await imp.locator(".import-preview thead tr:nth-child(2) th").allInnerTexts();
    const detected = await imp.getByLabel("Text encoding").locator("option:checked").innerText();
    impRead.push({ enc, detected, heads: heads.join("|"), rows: await imp.locator(".import-preview tbody tr").count() });
  }
  expect("Import dialog: UTF-16LE and cp1252 detected, identical columns with Area (µm²)",
    impRead[0].detected === "Detect (UTF-16)" && impRead[1].detected === "Detect (Windows-1252)"
    && impRead[0].heads === impRead[1].heads && impRead[0].heads.includes("Area (µm²)") && impRead[0].rows === 6,
    JSON.stringify(impRead));
  await imp.getByLabel("Text encoding").selectOption("utf-8");
  const forced = (await imp.locator(".import-preview thead tr:nth-child(2) th").allInnerTexts()).join("|");
  expect("Import dialog: the manual encoding still overrides (cp1252 read as UTF-8 loses µ²)",
    !forced.includes("µm²") && forced.includes("�"), forced);
  await imp.getByRole("button", { name: "Cancel" }).click();
}

// --- P-29: limits of blank, detection and quantification. The plan's
// acceptance data (e2e-fixtures/stage/detection-limits.json): an ELISA
// curve, 20 blank wells and 20 low-sample wells. Reference
// (engine/tests/reference/detection_limits.py, statistics module and an
// independent scipy 4PL): LoB = 0.06115 + 1.645 × 0.005743 = 0.07060
// (2.005 pg/mL), LoD = LoB + 1.645 × 0.005899 = 0.08030 (2.972 pg/mL),
// LoQ 6.674 pg/mL (CV 8.26%).
const STAGE = new URL("../e2e-fixtures/stage/", import.meta.url).pathname;
const OPEN_INPUT = 'input[aria-label="Open an OpenDose project or a Prism file"]';
{
  await page.setInputFiles(OPEN_INPUT, `${STAGE}detection-limits.json`);
  await page.waitForSelector(".std-results .std-limits", { timeout: 120000 });
  const lim = (name) => page.locator(".std-limits-table tr", { hasText: new RegExp(`^${name}`) }).first()
    .innerText().then((t) => t.replace(/\s+/g, " "));
  const lob = await lim("LoB");
  const lod = await lim("LoD");
  const loq = await lim("LoQ");
  expect("P-29: LoB = mean_blank + 1.645 SD_blank in signal (0.0706) and concentration (2.005 pg/mL)",
    lob.includes("0.0706 2.005") && lob.includes("20 blank replicates: mean 0.06115 + 1.645 × SD 0.005743"), lob);
  expect("P-29: LoD = LoB + 1.645 SD_low in signal (0.0803) and concentration (2.972 pg/mL)",
    lod.includes("0.0803 2.972") && lod.includes("LoB + 1.645 × pooled SD 0.005899 of 20 low-sample replicates"), lod);
  expect("P-29: LoQ 6.674 pg/mL, below the lowest standard and said so", loq.includes("6.674")
    && loq.includes("below the lowest standard"), loq);
  const tiles = await textOf(".std-results .plate-qc-grid");
  expect("P-29: LoB, LoD and LoQ next to the LLOQ and ULOQ",
    tiles.includes("LLOQ (pg/mL) 7.81") && tiles.includes("LoB (pg/mL) 2.005") && tiles.includes("LoD (pg/mL) 2.972")
    && tiles.includes("LoQ (pg/mL) 6.674"), tiles);
  expect("P-29: the method (parametric) and the replicates CLSI asks for sit next to the result",
    (await textOf(".std-limits")).includes("Method: parametric, CLSI EP17-A2")
    && (await textOf(".std-limits")).includes("at least 60 blank and 60 low-sample replicates"));
  expect("P-29: the methods text states LoB and LoD with their source",
    await waitText(".pane-methods", "LoB = mean + 1.645 SD of 20 blank replicates (signal 0.0706, 2.005 pg/mL)"));
  await page.getByRole("button", { name: "Open setup wizard…" }).click();
  await wizard().waitFor();
  await wizard().getByRole("button", { name: /Blanks and low samples/ }).click();
  expect("P-29 wizard: the Blanks and low samples step counts 20 + 20 replicates and previews the limits",
    (await wizard().innerText()).includes("Read 20 blank and 20 low-level replicates (1 sample).")
    && await waitText("dialog.assay-wizard .assay-preview", "LoB 2.005 pg/mL, LoD 2.972 pg/mL", 60000));
  await wizard().getByLabel(/LoD multiplier/).check();
  // reference: c_beta = 1.645 / (1 - 1/76) = 1.6669, LoD 0.08043 (2.985 pg/mL)
  expect("P-29 wizard: the c_beta multiplier (EP17-A2) moves the LoD to 2.985 pg/mL",
    await waitText("dialog.assay-wizard .assay-preview", "LoD 2.985 pg/mL", 60000),
    await textOf("dialog.assay-wizard .assay-preview").catch(() => ""));
  await wizard().getByRole("button", { name: "Cancel" }).click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });
}

// --- P-29, qPCR: a labelled LoD95 from a hit-rate dilution series
// (e2e-fixtures/stage/qpcr-lod.json: IL6 at 8 quantities × 12 wells).
// Reference (engine/tests/reference/lod95_probit.py, statsmodels GLM
// probit and Fieller by hand): LoD95 26.17, 95% CI 15.00 to 76.60.
{
  await page.setInputFiles(OPEN_INPUT, `${STAGE}qpcr-lod.json`);
  await page.waitForSelector(".qpcr-results .qpcr-lod", { timeout: 120000 });
  const row = (await page.locator(".qpcr-lod-table tr", { hasText: /^IL6/ }).first().innerText()).replace(/\s+/g, " ");
  expect("P-29 qPCR: LoD95 26.17 (95% CI 15 to 76.6, Fieller) from the IL6 hit rates",
    row.includes("26.17 15 to 76.6") && row.includes("5: 6/12") && row.includes("within the series"), row);
  expect("P-29 qPCR: the method and its source are stated",
    (await textOf(".qpcr-lod")).includes("Forootan et al. (2017, Biomol Detect Quantif 12:1)")
    && await waitText(".pane-methods", "IL6 26.17 (95% CI 15 to 76.6)"));
}

// --- P-30: NTC and no-RT control checks (e2e-fixtures/stage/
// qpcr-controls.json, engine/tests/test_qpcr_controls.py): one NTC well
// for GAPDH at Cq 34 (the other undetermined), an undetermined NTC for
// IL6, and "CON-1 no-RT" for GAPDH at Cq 21. Hand: GAPDH sample means
// 18.0, 17.1, 18.1, 17.5, so the NTC is 16.0, 16.9, 15.9, 16.5 cycles
// later (clear of 5); the no-RT is 3 cycles after CON-1 (affected).
{
  await page.setInputFiles(OPEN_INPUT, `${STAGE}qpcr-controls.json`);
  await page.waitForSelector(".qpcr-results .qpcr-target", { timeout: 120000 });
  await page.getByRole("button", { name: "Open setup wizard…" }).click();
  await wizard().waitFor();
  await wizard().getByRole("button", { name: /QC and statistics/ }).click();
  const ctl = "dialog.assay-wizard .qpcr-controls";
  expect("P-30: the QC step shows the chip “NTC amplified for GAPDH (Cq 34)”",
    await waitText(ctl, "NTC amplified for GAPDH (Cq 34)", 60000), await textOf(ctl).catch(() => ""));
  const ntcRows = await page.locator(`${ctl} table`, { hasText: "GAPDH samples against NTC amplified" })
    .locator("tbody tr").allInnerTexts();
  expect("P-30: the QC step lists the four GAPDH samples with their cycles to the NTC",
    ntcRows.length === 4 && /^CON-1\s+CON\s+18\s+16\s+clear/.test(ntcRows[0]) && /^LPS-2\s+LPS\s+17\.5\s+16\.5\s+clear/.test(ntcRows[3]),
    ntcRows.join(" | ").replace(/\s+/g, " "));
  expect("P-30: the no-RT well of CON-1 flags CON-1 (3 cycles, within 5) and the IL6 NTC is clean",
    (await textOf(ctl)).includes("No-RT control “CON-1 no-RT” amplified for GAPDH (Cq 21)")
    && (await textOf(ctl)).includes("CON-1 CON 18 3 within 5 cycles")
    && (await textOf(ctl)).includes("NTC clean for IL6"));
  expect("P-30: the rule cites MIQE (Bustin et al. 2009)",
    (await textOf(ctl)).includes("MIQE (Bustin et al. 2009, Clin Chem 55:611)"));
  // the thresholds are editable: counting only Cq below 33 clears the NTC
  await wizard().getByLabel("Count control amplification below Cq").fill("33");
  expect("P-30: a Cq limit of 33 no longer counts the NTC at 34",
    await page.waitForFunction((sel) => {
      const t = document.querySelector(sel)?.textContent ?? "";
      return t.includes("NTC clean for GAPDH") && !t.includes("NTC amplified for GAPDH");
    }, ctl, { timeout: 60000 }).then(() => true, () => false), await textOf(ctl).catch(() => ""));
  await wizard().getByRole("button", { name: "Cancel" }).click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });
  const res = await textOf(".qpcr-results .qpcr-controls");
  expect("P-30: the results sheet shows the same checks before the fold changes",
    res.includes("NTC amplified for GAPDH (Cq 34)")
    && await page.locator(".qpcr-results .qpcr-controls ~ .qpcr-target").count() === 1, res.slice(0, 200));
  const groupsShown = await page.locator(".qpcr-results .qpcr-target tbody th").allInnerTexts();
  expect("P-30: the controls are not a group: IL6 rows are CON and LPS only",
    groupsShown.slice(0, 2).join("|") === "CON (calibrator)|LPS" && !groupsShown.some((g) => /NTC|no-RT/.test(g)),
    groupsShown.join(" | "));
}

// --- P-50: flow event counts, from the Cmd+K palette and the flow wizard.
// Reference (engine/tests/reference/flow_events.py): Roederer 2008, CV
// 1/sqrt(r): 10% CV needs 100 positive events, 100,000 in all at 0.1%;
// 120 of 50,000 = 0.24%, Wilson 95% CI 0.2008% to 0.2869% (statsmodels
// and scipy agree).
{
  const calc = page.getByRole("dialog", { name: "Flow cytometry event counts" });
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Find a command or sheet" }).fill("flow event counts");
  await page.keyboard.press("Enter");
  await calc.waitFor({ timeout: 30000 });
  const out = (i) => calc.locator(".flow-events-out").nth(i).innerText().then((t) => t.replace(/\s+/g, " "));
  expect("P-50: the palette opens the calculator; 10% CV at 0.1% needs 100 positive events, 100,000 in all",
    await page.waitForFunction(() => /Events to acquire in the parent gate\s*100,000/
      .test(document.querySelector(".flow-events .flow-events-out")?.textContent ?? ""), null, { timeout: 60000 })
      .then(() => true, () => false) && (await out(0)).includes("Positive events needed 100 "), await out(0));
  await calc.getByLabel("Positive events", { exact: true }).fill("120");
  await calc.getByLabel("Events in the parent gate").fill("50000");
  expect("P-50: 120 of 50,000 is 0.24% with its Wilson 95% CI 0.2008% to 0.2869%",
    await page.waitForFunction(() => /0\.24%[^]*95% CI \(Wilson\)\s*0\.2008% to 0\.2869%/
      .test(document.querySelectorAll(".flow-events .flow-events-out")[1]?.textContent ?? ""), null, { timeout: 60000 })
      .then(() => true, () => false), await out(1));
  await calc.getByLabel("Events in the parent gate").fill("100");
  expect("P-50: more positive events than in the parent gate says what to enter",
    await page.waitForFunction(() => /Enter the positive events as a whole number from 0 to the parent/
      .test(document.querySelectorAll(".flow-events .flow-events-out")[1]?.textContent ?? ""), null, { timeout: 60000 })
      .then(() => true, () => false), await out(1));
  await page.waitForTimeout(500);
  const axeCalc = await axeViolations([".flow-events"]);
  expect("axe-core: the calculator passes", axeCalc.length === 0, axeCalc.join(" | "));
  await calc.getByRole("button", { name: "Close" }).click();
  await calc.waitFor({ state: "detached", timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 10000 });
  // the flow wizard's Statistic step links to it
  await startAssay("Flow cytometry");
  await wizard().getByRole("button", { name: /Statistic/ }).click();
  await wizard().getByRole("button", { name: "Flow cytometry event counts…" }).click();
  await calc.waitFor({ timeout: 30000 });
  expect("P-50: the flow wizard opens the calculator above it", await calc.isVisible() && await wizard().count() === 1);
  await page.keyboard.press("Escape");
  await calc.waitFor({ state: "detached", timeout: 10000 });
  expect("P-50: closing the calculator returns to the wizard", await wizard().isVisible());
  await wizard().getByRole("button", { name: "Cancel" }).click();
}
// --- P-94: assay precision and recovery. (a) The plan's acceptance data:
// VCA's dataEP05A2_1 (CLSI EP05-A2, 20 days x 2 runs x 2 replicates) as a
// nested table: VCA's SAS-validated components (engine/tests/reference/
// assay_precision.py) give repeatability CV 5.59%, between-run 4.64%,
// between-day 0.132% and total 7.27%. (b) An ELISA validation in the
// standard-curve layout (4 plates on 2 days, QC low / mid / high): the
// Precision report from the back-calculated concentrations against the
// EP05-A3 formulas on statsmodels' mean squares.
{
  const PREF = JSON.parse(readFileSync(new URL("../../engine/tests/reference/assay_precision.json",
    import.meta.url), "utf8"));
  const sig3 = (v) => String(Number(v.toPrecision(3)));
  await page.setInputFiles(OPEN_INPUT, `${STAGE}precision.json`);
  await page.waitForSelector(".std-results .precision-report", { timeout: 180000 });
  const qcRow = async (name) => (await page.locator(".precision-report tbody tr", { hasText: new RegExp(`^${name}`) })
    .first().innerText()).replace(/\s+/g, " ").trim();
  for (const [name, r] of Object.entries(PREF.elisa.samples)) {
    const row = await qcRow(name);
    expect(`P-94 Precision report: ${name}, repeatability ${sig3(r.cv_repeatability)}%, total ${sig3(r.cv_total)}%, `
      + `recovery ${String(Number(r.recovery_percent.toPrecision(4)))}%`,
      row.startsWith(`${name} 4 (2 days) `) && row.includes(` ${sig3(r.cv_repeatability)}% `)
      && row.includes(` ${sig3(r.cv_total)}% `)
      && row.includes(` ${String(Number(r.recovery_percent.toPrecision(4)))}% `) && row.endsWith("Pass"), row);
  }
  const mid = page.locator(".precision-detail", { hasText: /^QC mid/ }).first();
  await mid.locator("summary").click();
  expect("P-94 a negative between-run variance is reported as 0 and said so",
    /The between-run variance is estimated as negative \(.+\): the runs and days differ less than the scatter within runs predicts\. It is reported as 0/
      .test(await mid.innerText()));
  expect("P-94 the methods text names EP05-A3, the VCA intervals and ICH M10's limits",
    await waitText(".pane-methods", "Precision of the 3 samples measured on two or more plates"));
  await page.getByRole("button", { name: "Open setup wizard…" }).click();
  await wizard().waitFor();
  await wizard().getByRole("button", { name: /Precision/ }).click();
  expect("P-94 wizard: the Precision step names the QC samples and previews the report",
    (await wizard().innerText()).includes("Precision samples: QC low, QC mid, QC high.")
    && await waitText("dialog.assay-wizard .precision-report", "QC mid4 (2 days)", 60000));
  await wizard().getByLabel("CV at most").fill("3");
  expect("P-94 wizard: a 3% CV limit fails QC high on its CV",
    await waitText("dialog.assay-wizard .precision-report", "Fail (CV)", 60000));
  await wizard().getByRole("button", { name: "Cancel" }).click();
  await wizard().waitFor({ state: "detached", timeout: 10000 });

  await navRow("Precision of EP05 20 x 2 x 2").click();
  await page.waitForSelector(".precision-results .precision-report tbody tr", { timeout: 120000 });
  const pub = PREF.published_vca.balanced;
  const mean = PREF.by_hand.mean;
  const cv = (v) => sig3(100 * Math.sqrt(v) / mean);
  const ep = (await page.locator(".precision-results .precision-report tbody tr").first().innerText())
    .replace(/\s+/g, " ").trim();
  expect(`P-94 acceptance: dataEP05A2_1 as a nested table, CVs from VCA's components: repeatability `
    + `${cv(pub.error)}%, between-run ${cv(pub.run)}%, between-day ${cv(pub.day)}%, total ${cv(pub.total)}%`,
    ep.startsWith("mg/dL 40 (20 days) 24.99 ") && ep.includes(` ${cv(pub.error)}% `) && ep.includes(` ${cv(pub.run)}% `)
      && ep.includes(` ${cv(pub.day)}% `) && ep.includes(` ${cv(pub.total)}% `), ep);
  const detail = page.locator(".precision-results .precision-detail").first();
  await detail.locator("summary").click();
  const totalRow = (await detail.locator("tbody tr", { hasText: /^Within laboratory/ }).innerText())
    .replace(/\s+/g, " ");
  expect("P-94 total variance 3.299 with VCA's 95% CI 2.416 to 4.777",
    totalRow.includes("3.299") && totalRow.includes("2.416 to 4.777"), totalRow);
  const axe = await axeViolations([".precision-results", ".pane-controls"]);
  expect("P-94 axe: the precision results and controls pass", axe.length === 0, axe.join(" | "));
}
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "errors: none");
await browser.close();
if (fail.length || errors.length) {
  console.log(`e2e-assays FAILED (${fail.length} checks)`);
  process.exit(1);
}
console.log("e2e-assays OK");
