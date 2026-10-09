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
import { createRequire } from "node:module";

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
// axe-core (WCAG 2 A/AA, contrast included) on parts of the page.
const axeViolations = async (selectors) => {
  await page.addScriptTag({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") }).catch(() => {});
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
  await page.getByRole("button", { name: "New data table" }).click();
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
  await wizard().locator(".modal-actions .btn-primary").click();
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
  await navRow("Graph of Per donor of CD69 flow").click();
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
await page.getByRole("button", { name: "New data table" }).click();
const pick = page.locator(".new-table-dialog");
await pick.getByRole("radio", { name: "Start from an assay" }).check();
const nModules = await pick.locator('input[name="assay-module"]').count();
expect("Start from an assay lists all twelve modules", nModules === 12, String(nModules));
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
expect("the Analyze menu has one Assays divider",
  await page.locator('.analyze-menu [role=separator][aria-label="Assays"]').count() === 1);
expect("both halves' assays are listed under it on an XY table",
  await page.getByRole("menuitem", { name: /^Assay: Standard curve/ }).count() === 1
  && await page.getByRole("menuitem", { name: /^Assay: Growth curves/ }).count() === 1
  && await page.getByRole("menuitem", { name: /^Assay: Area under the curve/ }).count() === 1);
await page.keyboard.press("Escape");

// --- time course (need time-course-models): the GTT example with six mice
// per diet. Native engine mixed_timecourse (compound symmetry, REML):
// Group F(1, 10), Time F(5, 50), Group × Time F(5, 50) = 99.85; AIC of the
// four covariance structures unstructured 421.45 (best), CS 445.52, AR(1)
// 446.90, random slope 448.80. Areas (numpy trapezoid): chow mean 20494,
// high-fat diet 32915, unpaired t(10) = -15.60 (scipy); mean of 60-120 min
// per mouse: t(10) = -16.65 (scipy).
{
  await page.getByRole("button", { name: "New data table" }).click();
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
  expect("time course: the df note names the between-within method",
    (await textOf(".pane-results")).includes("Denominator df by the between-within method: Group is tested on 10 df between subjects (12 subjects − 2 groups)"));
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

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "errors: none");
await browser.close();
if (fail.length || errors.length) {
  console.log(`e2e-assays FAILED (${fail.length} checks)`);
  process.exit(1);
}
console.log("e2e-assays OK");
