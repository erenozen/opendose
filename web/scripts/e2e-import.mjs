// End-to-end check of getting a table in (feature plan wave 1, grid and
// import):
// - P-33: one CSV or .xlsx dropped anywhere on the page, or chosen with
//   File › Open, opens the Import dialog on a new table with a preview and
//   a guessed type (not the old "copy its cells and paste them" toast);
//   the table it makes equals the one the toolbar's Import makes from the
//   same file (e2e-fixtures/import/, reference in expected.json); an
//   instrument export gets the recipe hint; two files or a zip still go
//   to the recipe dialog.
// - P-34: one sheet saved by LibreOffice as .xls, .ods and .xlsx reads to
//   the same cells (openpyxl's reading of the .xlsx) and the same table.
// - P-35: pasted 12.5%, 30%, 47.5% and 3.2 µM get a one-click reading in
//   the paste report, never applied by itself, undone in one step.
// - P-36: find and replace (Ctrl+H) in a 96-row table: 7 n.d. cells, one
//   undo step, exclusions kept.
// - P-37: spreadsheet keys in a 50-row column: Ctrl+Down to row 50,
//   Ctrl+Shift+Up to row 1, Ctrl+D fills with row 1's exact text (an
//   excluded cell stays excluded), Home / End, Ctrl+Home / End, Ctrl+A.
// - P-38: a shuffled long table of mice before and after, paired by ID by
//   "From long table…" and by the recipes' column output: the
//   hand-aligned table, the pairs listed, a duplicate ID stopped, and the
//   paired t test against scipy (engine/tests/reference/paired_by_id.json).
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
// the on-demand reader wheels (P-34: xlrd only once an .xls is read)
const wheels = { list: [], xlrdBefore: -1 };
page.on("request", (r) => { if (/\.whl(\?|$)/.test(r.url())) wheels.list.push(r.url().split("/").pop()); });
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
  expect("P-33: File › Open accepts .csv, .tsv, .txt, .xlsx (P-34: .xls, .ods) and still projects and Prism files",
    [".csv", ".tsv", ".txt", ".xlsx", ".xls", ".ods", ".json", ".pzfx", ".prism"].every((x) => accept?.split(",").includes(x)), accept);
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

// --- P-34: one sheet saved by LibreOffice as .xls, .ods and .xlsx
// (e2e-fixtures/import/make_workbooks.py) imports to identical cells in all
// three, equal to openpyxl's reading of the .xlsx (workbook.expected.json);
// the row hidden by hand (row 7) is reported in each; both sheets listed.
{
  const wb = JSON.parse(readFileSync(join(IMP, "workbook.expected.json"), "utf8"));
  const assay = wb[0];
  const want = assay.rows.slice(1).map((r) => assay.rows[0].map((_, c) => r[c] ?? ""));
  wheels.xlrdBefore = wheels.list.filter((u) => /xlrd-/.test(u)).length;
  const made = {};
  for (const fmt of ["xlsx", "xls", "ods"]) {
    await page.setInputFiles(OPEN_INPUT, join(IMP, `workbook.${fmt}`));
    const open = await appears(dlg, 10000);
    const filled = open && await dlg.locator(".import-preview tbody tr").first().waitFor({ timeout: 120000 })
      .then(() => true, () => false);
    const cells = filled ? await dlg.locator(".import-preview tbody tr").evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll("td")].slice(1).map((td) => td.textContent))) : [];
    const heads = filled ? await dlg.locator(".import-preview thead tr:nth-child(2) th").allInnerTexts() : [];
    const sheets = filled ? await dlg.getByLabel("Worksheet").locator("option").allInnerTexts() : [];
    const report = dlg.locator(".workbook-report");
    const rep = (await appears(report, 5000)) ? (await report.innerText()).replace(/\s+/g, " ") : "";
    const bad = [];
    want.forEach((r, i) => r.forEach((v, c) => { if ((cells[i]?.[c] ?? "") !== v) bad.push(`R${i + 2}C${c + 1} “${cells[i]?.[c]}” ≠ “${v}”`); }));
    expect(`P-34: workbook.${fmt}: the preview holds openpyxl's cells of the .xlsx, every one (${want.length} rows × ${want[0].length})`,
      filled && bad.length === 0 && heads.join("|") === assay.rows[0].join("|"), bad.slice(0, 4).join("; ") || heads.join("|"));
    expect(`P-34: workbook.${fmt}: both sheets are offered, and the row hidden by hand is reported (row 7, imported)`,
      sheets.join("|") === "Assay|Plate 2" && /1 row is hidden in Excel \(row 7\): imported/.test(rep), `${sheets.join("|")} | ${rep}`);
    await dlg.getByLabel("New table").selectOption("multivariable");
    await dlg.getByRole("button", { name: "Import", exact: true }).click();
    await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    const names = await page.evaluate(() => globalThis.__opendose.store.project.sheets
      .filter((s) => s.kind === "data").map((s) => s.name));
    made[fmt] = await tableOf(names.filter((n) => n.startsWith("workbook")).at(-1));
  }
  expect("P-34: the .xls reader (xlrd) was fetched only once an .xls was read, never on the visit itself",
    wheels.xlrdBefore === 0 && wheels.list.filter((u) => /xlrd-/.test(u)).length === 1, wheels.list.join(", "));
  expect("P-34: the .xls, .ods and .xlsx of one sheet import to identical tables",
    !!made.xlsx && JSON.stringify(made.xls) === JSON.stringify(made.xlsx) && JSON.stringify(made.ods) === JSON.stringify(made.xlsx),
    JSON.stringify(made.xls)?.slice(0, 160));

  // a file that is not the workbook its name says: a reason, not a crash
  await page.setInputFiles(OPEN_INPUT, join(FIX, "encodings", "densitometry.xls"));
  const err = (await appears(dlg, 10000)) && await appears(dlg.locator(".import-error"), 120000)
    ? await dlg.locator(".import-error").innerText() : "";
  expect("P-34: a broken .xls says it could not be read and why, with no traceback",
    /^Could not read the workbook: it is not a readable \.xls workbook \(.+\)$/.test(err) && !/Traceback/.test(err), err);
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await dlg.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
}

// --- P-35: pasted percents and units get a one-click reading in the paste
// report, never applied by itself; the fix writes exactly the typed digits
// (12.5% as 12.5 or 0.125, by moving the point), and one undo restores the
// text.
{
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByLabel("Table name").fill("Percents");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  const paste = (label, text) => page.evaluate(([l, t]) => {
    const el = document.querySelector(`.data-table input[aria-label='${l}']`);
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [label, text]);
  const col = () => page.locator(".data-table input[aria-label^='Group A, row ']")
    .evaluateAll((els) => els.slice(0, 3).map((e) => e.value));
  const strip = page.locator(".paste-report");
  const stripText = async () => ((await appears(strip, 5000)) ? (await strip.innerText()).replace(/\s+/g, " ") : "");

  await paste("Group A, row 1", "12.5%\n30%\n47.5%\n");
  const s1 = await stripText();
  const before = await col();
  const asIs = strip.getByRole("button", { name: "Read 12.5% as 12.5" });
  const asFraction = strip.getByRole("button", { name: "Read 12.5% as 0.125" });
  expect("P-35: the report says 3 cells hold a percent sign, with the two readings; nothing changed yet",
    /3 cells hold a percent sign \(not read as numbers\): B1, B2, B3/.test(s1)
    && await asIs.isVisible() && await asFraction.isVisible()
    && before.join(",") === "12.5%,30%,47.5%", `${s1} | ${before.join(",")}`);
  await asFraction.click();
  const frac = await col();
  const s2 = await stripText();
  expect("P-35: Read 12.5% as 0.125 writes 0.125, 0.3, 0.475 (the typed digits, point moved) and the report counts 3 numbers",
    frac.join(",") === "0.125,0.3,0.475" && /3 numbers/.test(s2) && !/percent sign/.test(s2), `${frac.join(",")} | ${s2}`);
  await page.locator("header").getByRole("button", { name: "Undo" }).click();
  const undone = await col();
  expect("P-35: one undo restores the text (12.5%, 30%, 47.5%)", undone.join(",") === "12.5%,30%,47.5%", undone.join(","));

  await paste("Group A, row 1", "12.5%\n30%\n47.5%\n");
  await stripText();
  await strip.getByRole("button", { name: "Read 12.5% as 12.5" }).click();
  const digits = await col();
  expect("P-35: Read 12.5% as 12.5 writes 12.5, 30, 47.5", digits.join(",") === "12.5,30,47.5", digits.join(","));

  await paste("Group A, row 1", "3.2 µM\n5 µM\n0.75µM\n");
  const s3 = await stripText();
  const strip1 = strip.getByRole("button", { name: "Strip “µM”" });
  expect("P-35: 3 cells with one unit: the report names it and offers to strip it",
    /3 cells hold the unit “µM” \(not read as numbers\)/.test(s3) && await strip1.isVisible(), s3);
  await strip1.click();
  const stripped = await col();
  expect("P-35: Strip “µM” writes 3.2, 5, 0.75", stripped.join(",") === "3.2,5,0.75", stripped.join(","));

  await paste("Group A, row 1", "3.2 µM\n5 nM\n1\n");
  const s4 = await stripText();
  expect("P-35: cells in two units are named and not offered for stripping (it would mix scales)",
    /2 cells hold units \(µM, nM\): convert them to one unit, then strip it/.test(s4)
    && await strip.getByRole("button", { name: /^Strip/ }).count() === 0, s4);
}

// --- P-36: find and replace. A 96-row table with "n.d." in 7 cells (one
// of them excluded, with a reason): Ctrl+H in the table, replace "n.d."
// with an empty cell, Replace all: 7 cells change, the bar says 7, the
// excluded cell keeps its exclusion and reason, one undo restores all 7.
{
  const ND = [3, 17, 18, 40, 41, 77, 95];
  const lines = Array.from({ length: 96 }, (_, r) => (ND.includes(r) ? "n.d." : (20 + (r % 13) / 4).toFixed(2)));
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByLabel("Table name").fill("Cq values");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  // 96 lines go through the Import dialog (more than 60 lines)
  await page.evaluate((t) => {
    const el = document.querySelector(".data-table input[aria-label='Group A, row 1']");
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `${lines.join("\n")}\n`);
  if (await appears(dlg, 3000)) {
    await dlg.getByRole("button", { name: "Import", exact: true }).click();
    await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  }
  const cq = async () => (await tableOf("Cq values"))?.datasets[0].rows.map((r) => r[0]) ?? [];
  const reasons = () => page.evaluate(() => {
    const s = globalThis.__opendose.store.project.sheets.find((x) => x.kind === "data" && x.name === "Cq values");
    return { excluded: s.table.datasets[0].excluded ?? [], reasons: s.table.datasets[0].exclusionReasons ?? {} };
  });
  const start = await cq();
  // exclude row 18 (an "n.d.") with a reason
  const cell18 = page.locator(".data-table input[aria-label='Group A, row 18']");
  await cell18.click();
  await page.keyboard.press("Control+e");
  const prompt = page.getByRole("region", { name: "Exclusion reason" });
  if (await appears(prompt, 5000)) await prompt.getByRole("button", { name: "technical failure" }).click();
  const ex0 = await reasons();
  expect("P-36: the 96-row table holds n.d. in 7 cells, row 18 excluded as a technical failure",
    start.length === 96 && start.filter((v) => v === "n.d.").length === 7
    && JSON.stringify(ex0) === JSON.stringify({ excluded: ["17:0"], reasons: { "17:0": "technical failure" } }),
    JSON.stringify(ex0));

  // Ctrl+H in the grid (handled there, so the browser's history stays shut)
  await cell18.focus();
  const prevented = await page.evaluate(() => {
    const el = document.activeElement;
    const ev = new KeyboardEvent("keydown", { key: "h", ctrlKey: true, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  const find = page.getByRole("searchbox", { name: "Find" });
  const repl = page.getByRole("textbox", { name: "Replace with" });
  const opened = await appears(repl, 3000);
  expect("P-36: Ctrl+H in the table opens find with its replace row, and takes the key from the browser",
    prevented && opened && await find.evaluate((el) => el === document.activeElement));
  await find.fill("n.d.");
  const count = await page.locator(".grid-find-count[role=status]").first().innerText();
  await repl.fill("");
  await page.getByRole("button", { name: "Replace all" }).click();
  const status = await page.locator(".grid-replace-status").innerText();
  const after = await cq();
  const ex1 = await reasons();
  expect("P-36: Replace all of n.d. with an empty cell: 7 cells change and the bar says “Replaced 7 cells.”",
    /of 7$/.test(count) && status === "Replaced 7 cells."
    && ND.every((r) => after[r] === "") && after.filter((v, r) => !ND.includes(r) && v === start[r]).length === 89,
    `${count} | ${status}`);
  expect("P-36: the excluded cell keeps its exclusion and its reason", JSON.stringify(ex1) === JSON.stringify(ex0),
    JSON.stringify(ex1));
  await page.locator("header").getByRole("button", { name: "Undo" }).click();
  const undone = await cq();
  expect("P-36: one undo restores all 7 n.d. cells", JSON.stringify(undone) === JSON.stringify(start),
    String(undone.filter((v) => v === "n.d.").length));

  // the whole cell only, and Replace (one match): "20" in a cell of "20.25" is not a whole cell
  await find.fill("20.25");
  await page.getByRole("checkbox", { name: "Whole cell only" }).check();
  const wholeCount = await page.locator(".grid-find-count[role=status]").first().innerText();
  await repl.fill("20.250");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  const one = await cq();
  const s2 = await page.locator(".grid-replace-status").innerText();
  expect("P-36: Replace changes the match shown only (whole cells of 20.25: one of them becomes 20.250)",
    one.filter((v) => v === "20.250").length === 1 && s2 === "Replaced 1 cell." && /of \d+$/.test(wholeCount), `${wholeCount} | ${s2}`);
  await repl.press("Escape");
  const closed = !(await repl.isVisible().catch(() => false));
  expect("P-36: Escape closes the bar", closed);
}

// --- P-37: spreadsheet keys. A 50-row column: Ctrl+Down from row 1 lands
// on row 50, Ctrl+Shift+Up selects rows 50 to 1, Ctrl+D fills them with
// row 1's text exactly (an excluded cell stays excluded), one undo puts
// every value back; Home / End, Ctrl+Home / End and Ctrl+A.
{
  const vals = Array.from({ length: 50 }, (_, r) => (r === 0 ? "12.50" : String(r + 1)));
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByLabel("Table name").fill("Fifty rows");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.evaluate((t) => {
    const el = document.querySelector(".data-table input[aria-label='Group A, row 1']");
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `${vals.join("\n")}\n`);
  if (await appears(dlg, 3000)) {
    await dlg.getByRole("button", { name: "Import", exact: true }).click();
    await dlg.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  }
  const colA = async () => {
    const t = await tableOf("Fifty rows");
    return t ? { rows: t.datasets[0].rows, excluded: t.excluded[0] } : null;
  };
  const start = await colA();
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  const scope = () => page.locator(".data-inspector .inspector-scope").innerText().catch(() => "");
  // exclude row 10 first: it must stay excluded through the fill
  await page.locator(".data-table input[aria-label='Group A, row 10']").click();
  await page.keyboard.press("Control+e");
  const prompt = page.getByRole("region", { name: "Exclusion reason" });
  if (await appears(prompt, 3000)) await prompt.getByRole("button", { name: /^(Skip|Not now|Close)/ }).first().click().catch(() => {});
  // reach row 1 by the keyboard (its text selected, as a cell not being edited)
  await page.locator(".data-table input[aria-label='Group A, row 2']").click();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Control+ArrowDown");
  const atEnd = await focused();
  expect("P-37: Ctrl+Down in a 50-row column jumps from row 1 to row 50",
    start?.rows.length === 50 && atEnd === "Group A, row 50", atEnd);
  await page.keyboard.press("Control+Shift+ArrowUp");
  const sel = await scope();
  expect("P-37: Ctrl+Shift+Up selects up to row 1 (the Data Inspector reads 50 × 1 cells, rows 1–50)",
    sel.startsWith("50 × 1 cells (rows 1–50)"), sel);
  // Ctrl+D, dispatched so the browser's own Ctrl+D (bookmark) is seen to be taken
  const prevented = await page.evaluate(() => {
    const ev = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  const filled = await colA();
  expect("P-37: Ctrl+D fills rows 2 to 50 with row 1's text exactly (12.50), and takes the key from the browser",
    prevented && filled.rows.every((r) => r[0] === "12.50"), `${prevented} ${filled.rows.slice(0, 3).map((r) => r[0])}`);
  expect("P-37: the excluded cell in row 10 stays excluded after the fill",
    JSON.stringify(filled.excluded) === JSON.stringify(["9:0"]), JSON.stringify(filled.excluded));
  await page.locator("header").getByRole("button", { name: "Undo" }).click();
  const undone = await colA();
  expect("P-37: one undo puts all 49 values back", JSON.stringify(undone.rows) === JSON.stringify(start.rows));

  // Home / End along a row, Ctrl+Home / End over the table, Ctrl+A
  await page.locator(".data-table input[aria-label='Group A, row 4']").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  const home = await focused();
  await page.keyboard.press("End");
  const end = await focused();
  await page.keyboard.press("Control+End");
  const cEnd = await focused();
  await page.keyboard.press("Control+Home");
  const cHome = await focused();
  expect("P-37: Home and End go to the row's title and its last cell; Ctrl+End and Ctrl+Home to the last value and the first cell",
    home === "Row 5 title" && end === "Group C, row 5" && cEnd === "Group A, row 50" && cHome === "Row 1 title",
    [home, end, cEnd, cHome].join(" | "));
  await page.keyboard.press("Control+a");
  const all = await scope();
  expect("P-37: Ctrl+A selects the whole table (50 rows × the title and three group columns)",
    all.startsWith("50 × 4 cells"), all);
  await page.keyboard.press("Escape");
  // a cell being edited keeps Home and Ctrl+A for its text
  const c7 = page.locator(".data-table input[aria-label='Group A, row 7']");
  await c7.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  const stays = await focused();
  await page.keyboard.press("Control+a");
  const textSel = await c7.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length);
  const notTable = !(await scope()).startsWith("50 × 4");
  expect("P-37: in a cell being edited, Home and End move the caret and Ctrl+A selects its text",
    stays === "Group A, row 7" && textSel && notTable, stays);
  // the keys are listed in Help
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Control+/");
  const help = page.locator(".help-panel");
  const helpText = (await appears(help, 5000)) ? await help.innerText() : "";
  expect("P-37: the Help keyboard table lists Ctrl+D, Ctrl+A, Ctrl+arrow, Home and End",
    /Ctrl\+D\s+Fill down/.test(helpText) && /Ctrl\+A\s+Select the whole table/.test(helpText)
    && /Ctrl\+arrow/.test(helpText) && /Home, End/.test(helpText), helpText.length);
  await page.keyboard.press("Control+/");
}

// --- P-38: pair values by subject ID. Mice M1 to M6, before and after,
// in a shuffled long table (e2e-fixtures/import/paired_long.csv): "From
// long table…" on a paired t test and the import recipes' column output
// both make the hand-aligned table, the report lists the pairs and any
// unmatched ID, a duplicate ID stops with a message naming it and its
// rows, and the paired t test reads scipy's ttest_rel on the aligned
// columns (engine/tests/reference/paired_by_id.json).
{
  const REF = JSON.parse(readFileSync(join(here, "..", "..", "engine", "tests", "reference", "paired_by_id.json"), "utf8"));
  const LONG = readFileSync(join(IMP, "paired_long.csv"), "utf8");
  const HAND = {
    rowTitles: ["M4", "M1", "M6", "M3", "M2", "M5"],
    after: ["12.6", "14.3", "15.0", "13.1", "11.9", "13.4"],
    before: ["9.7", "12.1", "12.9", "13.8", "10.4", "11.2"],
  };
  const aligned = (t) => !!t && JSON.stringify(t.rowTitles) === JSON.stringify(HAND.rowTitles)
    && JSON.stringify(t.datasets.map((d) => d.rows.map((r) => r[0]))) === JSON.stringify([HAND.after, HAND.before]);
  await fileMenu("New data table…");
  const nd = page.locator(".new-table-dialog");
  await nd.locator('input[name="table-type"][value="column"]').check();
  await nd.getByLabel("Table name").fill("Paired mice");
  await nd.getByRole("button", { name: "Create table" }).click();
  await page.waitForSelector(".grid-toolbar");
  await page.locator(".pane-controls select.analysis-select").selectOption("ttest");
  await page.locator(".pane-controls").getByLabel("Test", { exact: true }).selectOption("paired");
  await page.getByRole("button", { name: "From long table…" }).click();
  const lt = page.getByRole("dialog", { name: "Paired values from a long table" });
  const ltText = lt.getByLabel("Long table text");
  const fillBtn = lt.getByRole("button", { name: "Fill the table" });
  // a duplicate: M3 twice "before"
  await ltText.fill(`${LONG}M3,before,14.0\n`);
  const dup = await lt.locator(".long-table-error").innerText().catch(() => "");
  expect("P-38: a duplicate ID stops the import with a message naming the ID and its rows",
    dup === "Subject “M3” has 2 records for “before” (rows 5 and 14). Pairing needs one value per subject and "
      + "condition: remove the extra records, or average them first." && await fillBtn.isDisabled(), dup);
  // an unmatched ID: listed, kept as a row
  await ltText.fill(`${LONG}M7,before,10.0\n`);
  const unmatched = await lt.innerText();
  expect("P-38: an unmatched ID is listed in the report, not dropped",
    unmatched.includes("Unmatched, kept as rows with a blank that paired analyses leave out: M7 (no “after”)."));
  await ltText.fill(LONG);
  const summary = await lt.locator(".import-summary").innerText().catch(() => "");
  const report = await lt.innerText();
  expect("P-38: the report lists the six pairs, matched by mouse",
    summary === "6 subjects paired by mouse across “after”, “before”"
    && report.includes("Paired (one row each, titled with the ID): M4, M1, M6, M3, M2, M5."), summary);
  await fillBtn.click();
  await lt.waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  expect("P-38: the filled table pairs M1 with M1 and so on (identical to the hand-aligned wide table)",
    aligned(await tableOf("Paired mice")), JSON.stringify((await tableOf("Paired mice"))?.rowTitles));
  const tWant = `t=${REF.by_id.t.toFixed(3)}`;
  const tRow = await page.waitForFunction((w) => [...document.querySelectorAll(".pane-results .results-table tr")]
    .find((tr) => /^t, df/.test(tr.innerText) && tr.innerText.includes(w))?.innerText ?? false,
  tWant, { timeout: 60000 }).then((h) => h.jsonValue(), () => "");
  const pRow = await page.locator(".pane-results .results-table tr", { hasText: /^P value/ }).first().innerText()
    .catch(() => "");
  const pWant = REF.by_id.p.toPrecision(4);
  expect(`P-38: the paired t test on the paired table reads scipy's ttest_rel (${tWant}, df=${REF.by_id.df}, P=${pWant})`,
    String(tRow).includes(`df=${REF.by_id.df}`) && pRow.includes(pWant),
    `${String(tRow).replace(/\s+/g, " ")} | ${pRow.replace(/\s+/g, " ")}`);

  // the import recipes, column output: the same pairing from the same file
  await page.getByRole("button", { name: "Import…" }).click();
  await page.getByRole("tab", { name: "Recipes" }).click();
  const rd = page.getByRole("dialog", { name: "Import with a recipe" });
  await rd.waitFor({ timeout: 10000 });
  await rd.getByLabel("Export file to import").setInputFiles(join(IMP, "paired_long.csv"));
  await rd.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
  await rd.getByRole("tab", { name: "Columns" }).click();
  await rd.getByLabel("Column mouse holds").selectOption("subject");
  await rd.getByLabel("Column time holds").selectOption("group");
  await rd.getByLabel("Column value holds").selectOption("value");
  await rd.getByRole("tab", { name: "Table" }).click();
  await rd.getByRole("radio", { name: /^Column/ }).check();
  await rd.getByLabel("Table name").fill("Paired by recipe");
  const rcpReport = await rd.locator(".recipe-pairing").innerText().catch(() => "");
  expect("P-38: the recipe's column output pairs by the subject ID and lists the pairs",
    rcpReport.includes("6 subjects paired by mouse across “after”, “before”.")
    && rcpReport.includes("Paired (one row each, titled with the ID): M4, M1, M6, M3, M2, M5."), rcpReport);
  await rd.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("treeitem", { name: "Paired by recipe", exact: true }).first().waitFor({ timeout: 10000 });
  expect("P-38: the recipe's table equals the hand-aligned wide table", aligned(await tableOf("Paired by recipe")),
    JSON.stringify((await tableOf("Paired by recipe"))?.datasets.map((d) => d.rows.map((r) => r[0]))));
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
