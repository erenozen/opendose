// End-to-end check for sharing, interoperability and trust (src/share):
// a share link made from the example project opens in a fresh browser
// read-only with the same LogIC50, and "Make a copy" makes it editable;
// a single family can be shared; the export bundle holds the expected
// files (with provenance.json and legends.txt); the FlowJo import recipe aggregates samples by animal into a
// column table; Reshape turns a table long; "Apply to new data" replays the
// project (and the bundle's provenance.json) onto a changed contingency
// table and logs the P that changed; the validation page and the
// privacy statement are reachable from the info popover.
// Run with the dev server up: node scripts/e2e-share.mjs http://localhost:5193/
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { unzipSync, strFromU8 } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const FLOWJO = join(here, "..", "e2e-fixtures", "flowjo-table.csv");
const url = process.argv[2] ?? "http://localhost:5173/";
// The start screen is skipped the same way the other scripts do it.
const exampleUrl = url + (url.includes("?") ? "&" : "?") + "example=1";
const tmp = mkdtempSync(join(tmpdir(), "opendose-share-"));

const browser = await chromium.launch({
  args: process.env.HOST_RESOLVER ? [`--host-resolver-rules=${process.env.HOST_RESOLVER}`] : [],
});
const errors = [];
const fail = [];
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
};
const logIC50 = (page) => page.locator(".results-table tbody tr", { hasText: "LogIC50" }).first()
  .innerText().then((t) => t.replace(/\s+/g, " ").trim());

const ctx1 = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await ctx1.newPage();
watch(page, "main");
await page.goto(exampleUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
await page.locator(".results-table tbody tr", { hasText: "LogIC50" }).first().waitFor({ timeout: 60000 });
const original = await logIC50(page);
console.log("example LogIC50 row:", original);

// --- share link of the whole project
const saveMenu = page.getByRole("button", { name: "More ways to save and share" });
await saveMenu.click();
await page.getByRole("menuitem", { name: "Copy share link…" }).click();
const shareDlg = page.getByRole("dialog", { name: "Share this project" });
await shareDlg.waitFor({ timeout: 10000 });
const link = await shareDlg.getByLabel("Share link").inputValue();
expect("share link is the app URL with #p=<base64url>", /^https?:\/\/[^#]+#p=[A-Za-z0-9_-]+$/.test(link),
  `${link.length} characters`);
expect("share link stays under 64 kB", link.length < 64 * 1024);
await shareDlg.getByRole("button", { name: "Done" }).click();

// --- one family only
await page.getByRole("treeitem", { name: "Dose response", exact: true }).first()
  .locator(":scope > .nav-row").click({ button: "right" });
await page.getByRole("menuitem", { name: "Share this family…" }).click();
const famDlg = page.getByRole("dialog", { name: "Share “Dose response”" });
await famDlg.waitFor({ timeout: 10000 });
const famLink = await famDlg.getByLabel("Share link").inputValue();
expect("family link is shorter than the project link", famLink.length < link.length,
  `${famLink.length} vs ${link.length}`);
await famDlg.getByRole("button", { name: "Done" }).click();

// --- open the link in a fresh browser: read-only, same numbers
const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const shared = await ctx2.newPage();
watch(shared, "shared");
await shared.goto(link, { waitUntil: "domcontentloaded" });
const banner = shared.getByRole("region", { name: "Shared project" });
await banner.waitFor({ timeout: 30000 });
expect("read-only banner says how to edit",
  (await banner.innerText()).includes("Shared project. Make a copy to edit."));
await shared.locator(".results-table tbody tr", { hasText: "LogIC50" }).first().waitFor({ timeout: 180000 });
const sharedRow = await logIC50(shared);
expect("shared project shows the same LogIC50", sharedRow === original, sharedRow);
expect("shared project has no Import button", await shared.getByRole("button", { name: "Import…" }).count() === 0);
const cell = shared.locator(".data-table td input").first();
expect("shared table cells are read-only", await cell.getAttribute("readonly") !== null);
expect("Analyze is disabled while read-only",
  await shared.getByRole("button", { name: "Analyze" }).isDisabled());

await banner.getByRole("button", { name: "Make a copy" }).click();
await shared.getByRole("button", { name: "Import…" }).waitFor({ timeout: 10000 });
expect("after Make a copy the banner is gone", await banner.count() === 0);
expect("after Make a copy the link is gone from the address", !shared.url().includes("#p="), shared.url());
const editable = shared.locator(".data-table td input").first();
expect("after Make a copy the table is editable", await editable.getAttribute("readonly") === null);
await editable.click();
await editable.fill("12345");
await shared.waitForTimeout(300);
expect("an edit sticks in the copy", await editable.inputValue() === "12345");
await ctx2.close();

// --- export bundle
await saveMenu.click();
const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 120000 }),
  page.getByRole("menuitem", { name: "Download export bundle (.zip)" }).click(),
]);
const zipPath = join(tmp, download.suggestedFilename());
await download.saveAs(zipPath);
const entries = unzipSync(new Uint8Array(readFileSync(zipPath)));
const names = Object.keys(entries);
console.log("bundle:", download.suggestedFilename(), names.join(", "));
const has = (n) => names.includes(n);
expect("bundle has README, project file, methods and citation",
  ["README.txt", "project.json", "methods.txt", "CITATION.txt"].every(has));
expect("bundle has wide and long CSV of every data table",
  ["dose-response", "contingency-example", "survival-example"]
    .every((s) => has(`data/${s}.csv`) && has(`data/${s}.long.csv`)),
  names.filter((n) => n.startsWith("data/")).join(", "));
expect("bundle has the dose-response table", has("data/dose-response.csv") && has("data/dose-response.long.csv"));
{
  // source data: excluded values are kept and flagged, with their reason
  const longCsv = strFromU8(entries["data/dose-response.long.csv"] ?? new Uint8Array()).split(/\r?\n/);
  expect("tidy CSV has excluded and exclusion_reason columns",
    /,excluded,exclusion_reason$/.test(longCsv[0]) && /,FALSE,$/.test(longCsv[1]), longCsv[0]);
  const pj = JSON.parse(strFromU8(entries["project.json"]));
  expect("the bundle's project file records the software that saved it",
    typeof pj.savedWith?.app === "string", JSON.stringify(pj.savedWith ?? null));
}
expect("bundle has the data tables as .pzfx", has("data.pzfx")
  && (strFromU8(entries["data.pzfx"]).match(/<Table /g) ?? []).length === 3);
const resultsCsv = names.filter((n) => n.startsWith("results/"));
expect("bundle has one CSV per results sheet", resultsCsv.length === 3, resultsCsv.join(", "));
expect("results CSV holds the LogIC50 row", resultsCsv.some((n) => /LogIC50,/.test(strFromU8(entries[n]))));
const svgs = names.filter((n) => /^graphs\/.+\.svg$/.test(n));
const pngs = names.filter((n) => /^graphs\/.+\.png$/.test(n));
expect("bundle has every graph (the example has two) as SVG and PNG",
  svgs.length === 2 && pngs.length === 2 && has("graphs/graph-of-dose-response.svg"),
  `${svgs.length} SVG, ${pngs.length} PNG`);
expect("bundle PNGs are PNGs", pngs.every((n) => entries[n][0] === 0x89 && entries[n][1] === 0x50));
const readme = strFromU8(entries["README.txt"]);
expect("README names the software versions", /OpenDose \S+/.test(readme) && /SciPy \d/.test(readme));
expect("README lists every file", names.filter((n) => n !== "README.txt").every((n) => readme.includes(n)));
expect("project.json in the bundle reopens", JSON.parse(strFromU8(entries["project.json"])).opendose_project === 2);
const prov = JSON.parse(strFromU8(entries["provenance.json"] ?? new Uint8Array()) || "{}");
const steps = (prov.families ?? []).flatMap((f) => f.steps);
const analysis = steps.find((s) => s.kind === "analysis");
expect("provenance.json lists every analysis with options marked default or changed",
  prov.opendose_provenance === 1 && steps.filter((s) => s.kind === "analysis").length === 3
  && analysis && Object.values(analysis.options).every((o) => typeof o.default === "boolean")
  && /^fnv1a64:[0-9a-f]{16}$/.test(analysis.input.fingerprint) && /OpenDose/.test(prov.app),
  `${steps.length} steps`);
const legends = strFromU8(entries["legends.txt"] ?? new Uint8Array());
expect("legends.txt holds figure legends with n and the test, and results sentences",
  legends.includes("Figure legends") && legends.includes("n = 10 subjects per group")
  && legends.includes("log-rank (Mantel-Cox) test") && legends.includes("Results sentences"),
  legends.slice(0, 200).replace(/\s+/g, " "));

// --- FlowJo recipe: samples aggregated by animal into a column table
await page.getByRole("treeitem", { name: "Dose response", exact: true }).first()
  .locator(":scope > .nav-row").click();
await page.getByRole("button", { name: "Import…" }).click();
await page.getByRole("tab", { name: "Recipes" }).click();
const rcp = page.getByRole("dialog", { name: "Import with a recipe" });
await rcp.waitFor({ timeout: 10000 });
await rcp.getByLabel("Export file to import").setInputFiles(FLOWJO);
await rcp.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
expect("FlowJo export recognised", await rcp.locator(".recipe-option", { hasText: "FlowJo table" })
  .locator(".recipe-detected").count() === 1);
await rcp.getByRole("tab", { name: "Columns" }).click();
await rcp.getByLabel("Part 2 column name").fill("Animal");
expect("name pattern preview splits group and animal",
  (await rcp.getByLabel("How the names split").innerText()).includes("WT_M1_1.fcs"));
await rcp.getByRole("tab", { name: "Aggregate" }).click();
expect("aggregation is on", await rcp.getByLabel("Aggregate before making the table").isChecked());
expect("aggregation by animal", await rcp.getByRole("checkbox", { name: /One value per Animal/ }).isChecked());
const units = await rcp.getByLabel("Experimental units per group").innerText();
expect("n per group after aggregation: WT 4, KO 3", /WT n = 4/.test(units) && /KO n = 3/.test(units),
  units.replace(/\s+/g, " "));
await rcp.getByRole("tab", { name: "Table" }).click();
expect("column table chosen", await rcp.getByRole("radio", { name: /^Column/ }).isChecked());
await rcp.getByRole("button", { name: "Create table" }).click();
await page.getByRole("treeitem", { name: "FlowJo statistics", exact: true }).first().waitFor({ timeout: 10000 });
const filled = (prefix) => page.locator(".data-table td input").evaluateAll((els, p) =>
  els.filter((e) => new RegExp(`^${p}, row \\d+$`).test(e.getAttribute("aria-label") ?? "")
    && e.value.trim() !== "").length, prefix);
const nWT = await filled("WT");
const nKO = await filled("KO");
expect("column table has n = 4 (WT) and n = 3 (KO)", nWT === 4 && nKO === 3, `WT ${nWT}, KO ${nKO}`);

// --- Reshape: the new column table to long
await page.getByRole("button", { name: "Reshape…" }).click();
const rs = page.getByRole("dialog", { name: /Reshape .* to a long table/ });
await rs.waitFor({ timeout: 10000 });
expect("reshape previews 7 observations", (await rs.getByRole("status").innerText()).startsWith("7 observations"));
await rs.getByRole("button", { name: "Create long table" }).click();
await page.getByRole("treeitem", { name: "FlowJo statistics (long)", exact: true }).first().waitFor({ timeout: 10000 });
expect("long table created as multiple variables",
  await page.locator(".var-type").count() === 3, String(await page.locator(".var-type").count()));

// --- Apply to new data: the example project replayed onto a copy of its
// contingency table with one count changed (15 -> 25 exposed events)
const navCount = (kind) => page.locator(`.nav-item[data-key^='${kind}:']`).count();
// axe-core (WCAG 2 A and AA rules) on the open dialog
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const axeDialog = async () => {
  await page.addScriptTag({ path: axePath }).catch(() => {});
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document.querySelector("dialog[open]"),
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return r.violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.html.slice(0, 90)}`));
  });
};
const graphsBefore = await navCount("graph");
const fisherP = async () => {
  const row = page.locator(".pane-results .results-table tbody tr",
    { hasText: "Fisher's exact test, two-sided" }).first();
  await row.waitFor({ timeout: 60000 });
  return /P\s*=\s*(\S+)/.exec((await row.innerText()).replace(/\s+/g, " "))?.[1] ?? "";
};
await page.getByRole("treeitem", { name: "Contingency example", exact: true }).first()
  .locator(":scope > .nav-row").click();
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 60000 });
const pBefore = await fisherP();
const contingencyCsv = Buffer.from(",Event,No event\nExposed,25,85\nNot exposed,5,95\n");
await saveMenu.click();
await page.getByRole("menuitem", { name: "Apply to new data…" }).click();
const rp = page.getByRole("dialog", { name: "Apply to new data" });
await rp.waitFor({ timeout: 10000 });
await rp.getByLabel("New data file").setInputFiles({ name: "Contingency example.csv",
  mimeType: "text/csv", buffer: contingencyCsv });
const mapped = rp.getByLabel("Table for Contingency example.csv");
await mapped.waitFor({ timeout: 10000 });
expect("replay: the new file is matched to its table by name",
  (await mapped.locator("option:checked").innerText()).startsWith("Contingency example")
  && (await rp.innerText()).includes("matched by name"));
const axeSetup = await axeDialog();
expect("axe-core: no WCAG A/AA violations in Apply to new data", axeSetup.length === 0, axeSetup.join(" | "));
await rp.getByRole("button", { name: "Apply and re-run" }).click();
const rlog = page.getByRole("dialog", { name: "Replay log" });
await rlog.waitFor({ timeout: 180000 });
const axeLog = await axeDialog();
expect("axe-core: no WCAG A/AA violations in the replay log", axeLog.length === 0, axeLog.join(" | "));
const logText = (await rlog.innerText()).replace(/\s+/g, " ");
const contItem = (await rlog.locator("li", { hasText: "Contingency of Contingency example" }).innerText())
  .replace(/\s+/g, " ");
await rlog.getByRole("button", { name: "Keep as an info sheet" }).click();
await rlog.getByRole("button", { name: "Done" }).click();
let pAfter = pBefore;
for (let i = 0; i < 60 && pAfter === pBefore; i++) {
  await page.waitForTimeout(500);
  pAfter = await fisherP();
}
console.log("replay log:", contItem.slice(0, 240));
expect("replay log names the new data and the table it went into",
  logText.includes("Contingency example: new data from Contingency example.csv (2 rows, 2 data sets)")
  && logText.includes("Dose response: no new data for this table: kept as it was"));
expect("replay log names the results sheet whose P changed, with both values",
  pAfter !== pBefore && contItem.includes(`Fisher's exact test P ${pBefore} → ${pAfter}`),
  `${pBefore} -> ${pAfter}`);
expect("replay log: the dose-response fit did not change",
  logText.includes("Nonlin fit of Dose response: no number changed"));
expect("replay keeps every graph", await navCount("graph") === graphsBefore && graphsBefore >= 2,
  `${graphsBefore} -> ${await navCount("graph")}`);
expect("replay log kept as an info sheet",
  await page.getByRole("treeitem", { name: "Replay log", exact: true }).count() === 1);

// --- the same, with the bundle's provenance.json as the plan
const provFile = join(tmp, "provenance.json");
writeFileSync(provFile, entries["provenance.json"]);
expect("provenance.json carries a replay plan with every sheet",
  (prov.replay_plan?.sheets ?? []).filter((s) => s.kind === "graph").length === 2
  && (prov.replay_plan?.sheets ?? []).filter((s) => s.kind === "results").length === 3);
await saveMenu.click();
await page.getByRole("menuitem", { name: "Apply to new data…" }).click();
await rp.waitFor({ timeout: 10000 });
await rp.getByRole("radio", { name: /A project file or provenance\.json/ }).check();
await rp.getByLabel("Plan file").setInputFiles(provFile);
await rp.getByRole("status").filter({ hasText: "provenance.json: 3 tables, 3 analyses, 2 graphs" })
  .waitFor({ timeout: 10000 });
await rp.getByLabel("New data file").setInputFiles({ name: "Contingency example.csv",
  mimeType: "text/csv", buffer: contingencyCsv });
await rp.getByLabel("Table for Contingency example.csv").waitFor({ timeout: 10000 });
await rp.getByRole("button", { name: "Apply and re-run" }).click();
await rlog.waitFor({ timeout: 180000 });
const provLog = (await rlog.innerText()).replace(/\s+/g, " ");
await rlog.getByRole("button", { name: "Done" }).click();
expect("replay from provenance.json rebuilds the analyses and graphs on the new data",
  provLog.includes("from provenance.json") && provLog.includes("new data from Contingency example.csv")
  && provLog.includes("Dose response: no new data for this table, and the plan holds no values")
  && provLog.includes("Contingency of Contingency example: no earlier numbers to compare with")
  && await navCount("graph") === 2 && await navCount("results") === 3,
  provLog.slice(0, 200));
await page.getByRole("treeitem", { name: "Contingency example", exact: true }).first()
  .locator(":scope > .nav-row").click();
const pFromPlan = await fisherP();
expect("the plan from provenance.json gives the same P on the same new data", pFromPlan === pAfter,
  `${pFromPlan} vs ${pAfter}`);

// --- info popover: privacy, file format, validation page
await page.getByRole("button", { name: /About OpenDose/ }).click();
const pop = page.locator(".info-pop");
expect("privacy statement in the info popover",
  (await pop.innerText()).includes("no data is sent anywhere"));
expect("file-format promise in the info popover",
  (await pop.innerText()).includes("every release opens every earlier version"));
await pop.getByRole("button", { name: "How OpenDose is validated" }).click();
const val = page.getByRole("dialog", { name: "How OpenDose is validated" });
await val.waitFor({ timeout: 10000 });
const rows = await val.locator(".validation-table tbody tr").count();
expect("validation page lists the pinned cross-checks", rows > 100, String(rows));
expect("validation page includes NIST Longley and Prism pins",
  (await val.innerText()).includes("Longley") && (await val.innerText()).includes("LogIC50"));
await val.getByRole("button", { name: "NIST StRD (11)" }).click();
expect("validation page filters by reference", await val.locator(".validation-table tbody tr").count() === 11);
await val.getByRole("button", { name: "Close" }).last().click();

await page.screenshot({ path: join(tmp, "share.png") });
console.log("files in", tmp);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("share + recipes e2e OK");
