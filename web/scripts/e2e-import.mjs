// End-to-end check of getting a table in (feature plan wave 1, grid and
// import):
// - P-33: one CSV or .xlsx dropped anywhere on the page, or chosen with
//   File › Open, opens the Import dialog on a new table with a preview and
//   a guessed type (not the old "copy its cells and paste them" toast);
//   the table it makes equals the one the toolbar's Import makes from the
//   same file (e2e-fixtures/import/, reference in expected.json); an
//   instrument export gets the recipe hint; two files or a zip still go
//   to the recipe dialog.
//
// Usage: node scripts/e2e-import.mjs http://localhost:5173/
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "..", "e2e-fixtures");
const IMP = join(FIX, "import");
const ref = JSON.parse(readFileSync(join(IMP, "expected.json"), "utf8"));
const baseUrl = process.argv[2] ?? "http://localhost:5173/";
const EXAMPLE = (() => { const u = new URL(baseUrl); u.searchParams.set("example", "1"); return u.toString(); })();
const OPEN_INPUT = 'input[aria-label="Open an OpenDose project or a Prism file"]';

const fails = [];
const errors = [];
function expect(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) fails.push(name);
}
const appears = (loc, timeout = 10000) => loc.first().waitFor({ timeout }).then(() => true, () => false);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto(EXAMPLE, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 300000 });

const fileMenu = async (item) => {
  await page.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
};
/** Drops files on the page, as a drag from the desktop does: a drop event
 *  with a DataTransfer holding them, on the body. */
const dropFiles = (files) => page.evaluate((list) => {
  const dt = new DataTransfer();
  for (const f of list) {
    const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
    dt.items.add(new File([bytes], f.name, { lastModified: f.t }));
  }
  document.body.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
  document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
}, files.map((p, i) => ({ name: p.split("/").pop(), b64: readFileSync(p).toString("base64"), t: Date.now() + i })));
/** A data table of the project by name: the cells that matter. */
const tableOf = (name) => page.evaluate((n) => {
  const p = globalThis.__opendose.store.project;
  const s = p.sheets.find((x) => x.kind === "data" && x.name === n);
  if (!s) return null;
  const t = s.table;
  return { type: t.type, x: t.x, xTitle: t.xTitle, rowTitles: t.rowTitles,
    datasets: t.datasets.map((d) => ({ rows: d.rows, subTitles: d.subTitles ?? null })),
    excluded: t.datasets.map((d) => d.excluded ?? []) };
}, name);
const toasts = () => page.locator(".toast").allInnerTexts().catch(() => []);
const dlg = page.getByRole("dialog", { name: "Import data" });
const typeWhy = dlg.locator("[data-part='type-why']");

// --- P-33: drop one CSV on the page
{
  await dropFiles([join(IMP, "dose-response.csv")]);
  const open = await appears(dlg, 10000);
  const rows = open ? await dlg.locator(".import-preview tbody tr").count() : 0;
  const type = open ? await dlg.getByLabel("New table").inputValue() : "";
  const why = open ? await typeWhy.innerText() : "";
  const t = (await toasts()).join(" | ");
  expect("P-33: a CSV dropped on the page opens the Import dialog with a preview (8 rows), not the paste toast",
    open && rows === 8 && !/copy its cells/.test(t), `${rows} rows | ${t}`);
  expect("P-33: the new table's type is guessed as XY, Rep 1 to Rep 3 as the replicates of one data set",
    type === "xy" && /Rep 1 to Rep 3 read as 3 replicates of one data set/.test(why), `${type} | ${why}`);
  const summary = open ? await dlg.locator(".import-summary[role=status]").innerText() : "";
  expect("P-33: the summary says 8 rows, 3 Y columns, as a new XY table",
    /^8 of 8 rows, 3 Y columns, as a new XY table\.$/.test(summary), summary);
  await dlg.getByRole("button", { name: "Import", exact: true }).click();
  await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  const made = await tableOf("dose-response");
  const want = ref["dose-response"];
  expect("P-33: Import makes the table “dose-response”: X and the 3 replicates as the file holds them",
    !!made && made.type === "xy" && made.datasets.length === 1
    && JSON.stringify(made.x) === JSON.stringify(want.rows.map((r) => r[0]))
    && JSON.stringify(made.datasets[0].rows) === JSON.stringify(want.rows.map((r) => r.slice(1)))
    && made.xTitle === want.titles[0], JSON.stringify(made)?.slice(0, 300));
  const report = page.locator(".paste-report").filter({ hasText: "Imported:" });
  const reportText = (await appears(report, 5000)) ? (await report.innerText()).replace(/\s+/g, " ") : "";
  expect("P-33: the new table shows its import report: 32 numbers, nothing converted to 0",
    /Imported: 32 numbers/.test(reportText) && /nothing was converted to 0/.test(reportText), reportText);
  const example = await page.evaluate(() => globalThis.__opendose.store.project.sheets
    .filter((s) => s.kind === "data").map((s) => s.name));
  expect("P-33: dropped on the example, the table takes the example's place (as a paste does)",
    example.length === 1 && example[0] === "dose-response", example.join(", "));

  // the same file through the grid's toolbar Import, on an empty XY table
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="xy"]').check();
  await nd.getByLabel("Table name").fill("Toolbar import");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.getByRole("button", { name: "Import…", exact: true }).click();
  await dlg.locator('input[aria-label="File to import"]').setInputFiles(join(IMP, "dose-response.csv"));
  await dlg.getByRole("tab", { name: "Placement" }).click();
  await dlg.getByLabel("Y columns per dataset (replicates)").fill("3");
  await dlg.getByRole("button", { name: "Import", exact: true }).click();
  await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  const viaToolbar = await tableOf("Toolbar import");
  expect("P-33: the dropped file's table equals the toolbar Import's table from the same file",
    JSON.stringify(viaToolbar) === JSON.stringify(made),
    `${JSON.stringify(viaToolbar)?.slice(0, 200)} vs ${JSON.stringify(made)?.slice(0, 200)}`);
}

// --- P-33: drop the .xlsx of the same table
{
  await dropFiles([join(IMP, "dose-response.xlsx")]);
  const open = await appears(dlg, 10000);
  const filled = open && await dlg.locator(".import-preview tbody tr").first().waitFor({ timeout: 120000 })
    .then(() => true, () => false);
  const type = open ? await dlg.getByLabel("New table").inputValue() : "";
  expect("P-33: an .xlsx dropped on the page opens the Import dialog with its first sheet's preview, guessed XY",
    filled && type === "xy" && await dlg.locator(".import-preview tbody tr").count() === 8, type);
  await dlg.getByRole("button", { name: "Import", exact: true }).click();
  await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  const fromCsv = await tableOf("dose-response");
  const names = await page.evaluate(() => globalThis.__opendose.store.project.sheets
    .filter((s) => s.kind === "data").map((s) => s.name));
  const xl = names.filter((n) => n.startsWith("dose-response")).at(-1);
  const fromXlsx = xl && xl !== "dose-response" ? await tableOf(xl) : null;
  expect("P-33: the .xlsx makes a new family next to the others, with the same cells as the CSV",
    names.length === 3 && !!fromXlsx && JSON.stringify(fromXlsx) === JSON.stringify(fromCsv), names.join(", "));
}

// --- P-33: File › Open takes table files
{
  const accept = await page.locator(OPEN_INPUT).getAttribute("accept");
  expect("P-33: File › Open accepts .csv, .tsv, .txt and .xlsx (and still projects and Prism files)",
    [".csv", ".tsv", ".txt", ".xlsx", ".json", ".pzfx", ".prism"].every((x) => accept?.split(",").includes(x)), accept);
  await page.setInputFiles(OPEN_INPUT, join(FIX, "plate-reader.csv"));
  const open = await appears(dlg, 10000);
  const rows = open ? await dlg.locator(".import-preview tbody tr").count() : 0;
  const hint = dlg.locator("[data-part='recipe-hint']");
  const hinted = open && await appears(hint, 10000);
  const hintText = hinted ? await hint.innerText() : "";
  expect("P-33: plate-reader.csv chosen with Open lands in the Import dialog with a preview and the plate-reader recipe hint",
    open && rows > 0 && /“Plate reader grid \(8 × 12 or 16 × 24\)” recognises this file/.test(hintText), hintText);
  if (hinted) await hint.getByRole("button", { name: "Read it with a recipe…" }).click();
  const recipe = page.getByRole("dialog", { name: "Import with a recipe" });
  const detected = await appears(recipe.getByText(/Looks like: Plate reader grid/), 10000);
  expect("P-33: Read it with a recipe… opens the recipe step on the same file, detected as a plate-reader grid", detected);
  await recipe.getByRole("button", { name: "Cancel" }).click();
  await recipe.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}

// --- P-33: two table files (isTableDrop) still go to the recipe dialog
{
  await dropFiles([join(FIX, "tidy-long.csv"), join(IMP, "dose-response.csv")]);
  const recipe = page.getByRole("dialog", { name: "Import with a recipe" });
  const r = await appears(recipe, 10000);
  expect("P-33: two CSV files dropped together still open the recipe dialog, not the Import dialog",
    r && !(await dlg.isVisible().catch(() => false)));
  if (r) {
    await recipe.getByRole("button", { name: "Cancel" }).click();
    await recipe.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  }
}

// --- a file Open cannot read: the error names what it opens
{
  await dropFiles([join(FIX, "encodings", "make_fixtures.py")]);
  await page.waitForTimeout(500);
  const t = (await toasts()).join(" | ");
  expect("an unknown file dropped on the page: the error lists project, Prism and table files",
    /OpenDose opens its own project files \(\.json\), Prism files \(\.prism, \.pzfx\) and tables/.test(t), t);
}

await browser.close();
console.log("errors:", errors.length ? errors : "none");
if (fails.length || errors.length) {
  console.error("FAILURES:", [...fails, ...errors]);
  process.exit(1);
}
console.log("import OK");
