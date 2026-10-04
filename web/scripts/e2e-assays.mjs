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
// - qPCR: IL6 fold change LPS vs Control 11.71, and Livak & Schmittgen
//   (2001) Table 1 pasted as a Cq export: kidney vs brain ΔCq 4.365,
//   fold change 5.6;
// - densitometry: the example's ratio 2.427 (P = 0.000755), and the
//   GraphPad ratio paired t test example pasted as an export: ratio
//   2.015, 95% CI 1.881 to 2.158, P = 0.0005.
// Usage: node scripts/e2e-assays.mjs http://localhost:5196/
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
// Skip the start screen the way the other scripts do.
const exampleUrl = url + (url.includes("?") ? "&" : "?") + "example=1";
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

await page.goto(exampleUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".results-table", { timeout: 180000 });

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
await startAssay("qPCR (ΔCq / ΔΔCq)");
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

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "errors: none");
await browser.close();
if (fail.length || errors.length) {
  console.log(`e2e-assays FAILED (${fail.length} checks)`);
  process.exit(1);
}
console.log("e2e-assays OK");
