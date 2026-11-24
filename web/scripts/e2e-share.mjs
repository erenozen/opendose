// End-to-end check for sharing, interoperability and trust (src/share):
// a share link made from the example project opens in a fresh browser
// read-only with the same LogIC50, and "Make a copy" makes it editable;
// a single family can be shared; the export bundle holds the expected
// files (with provenance.json and legends.txt); the FlowJo import recipe aggregates samples by animal into a
// column table; Reshape turns a table long; "Apply to new data" replays the
// project (and the bundle's provenance.json) onto a changed contingency
// table and logs the P that changed; the validation page, the privacy
// statement and the "Your data and privacy" page (also at #privacy) are
// reachable from the info popover; the Incucyte,
// LabChart and multi-read plate recipes make XY and grouped tables; a zip
// of per-image CSVs becomes a SuperPlot-ready column table; a mapping
// saved as a recipe is applied again after a reload; File › Export tables
// and results to Excel writes one sheet per table and results sheet equal
// to the CSV export, read back by openpyxl, python-calamine and LibreOffice
// (P-64); File › Export statistics table (.csv, .xlsx) and Copy statistics
// table for Word equal the results sheets, and the bundle's analysis.py
// reproduces the t test and the 4PL (P-66, P-67); the validation page's
// NIST reference datasets open as projects that reproduce the certified
// values (P-127).
// Run with the dev server up: node scripts/e2e-share.mjs http://localhost:5193/
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import { projectSchemaErrors } from "./validate-project.mjs";
import { parseCsv, readXlsx } from "./xlsx-read.mjs";

// The header's View menu (DECISIONS 5): open it, pick an item.
const viewMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "View", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};

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
const fileMenu = page.locator("header").getByRole("button", { name: "File", exact: true });
await fileMenu.click();
await page.getByRole("menuitem", { name: "Copy share link…" }).click();
const shareDlg = page.getByRole("dialog", { name: "Share this project" });
await shareDlg.waitFor({ timeout: 10000 });
expect("password protection is on by default, with no link until a password is set",
  await shareDlg.getByLabel("Protect with a password (recommended)").isChecked()
  && await shareDlg.getByLabel("Share link").count() === 0);
expect("the dialog warns that the data travel inside the link",
  (await shareDlg.innerText()).includes("The data travel inside the link itself."));

// a protected link: locked in the browser, opened only with its password
await shareDlg.getByRole("button", { name: "Suggest one" }).click();
const password = await shareDlg.getByLabel("Link password").inputValue();
expect("a suggested password is five groups of four characters",
  /^[a-z2-9]{4}(-[a-z2-9]{4}){4}$/.test(password), password);
await shareDlg.getByRole("button", { name: "Create protected link" }).click();
const lockedLink = await shareDlg.getByLabel("Share link").inputValue({ timeout: 30000 });
expect("protected link is the app URL with #e=<base64url>", /^https?:\/\/[^#]+#e=[A-Za-z0-9_-]+$/.test(lockedLink),
  `${lockedLink.length} characters`);
{
  const ctxL = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const locked = await ctxL.newPage();
  watch(locked, "locked");
  await locked.goto(lockedLink, { waitUntil: "domcontentloaded" });
  const pw = locked.getByLabel("Password", { exact: true });
  await pw.waitFor({ timeout: 30000 });
  expect("a protected link opens on a password screen, not the project",
    await locked.locator(".data-table").count() === 0);
  await pw.fill("not-the-password");
  await locked.getByRole("button", { name: "Open project" }).click();
  expect("a wrong password is refused",
    await locked.getByRole("alert").filter({ hasText: "wrong password" }).waitFor({ timeout: 30000 })
      .then(() => true, () => false));
  await pw.fill(password);
  await locked.getByRole("button", { name: "Open project" }).click();
  await locked.getByRole("region", { name: "Shared project" }).waitFor({ timeout: 30000 });
  await locked.locator(".results-table tbody tr", { hasText: "LogIC50" }).first().waitFor({ timeout: 180000 });
  const lockedRow = await logIC50(locked);
  expect("with the password the project opens read-only with the same LogIC50", lockedRow === original, lockedRow);
  await ctxL.close();
}

// a plain link (protection switched off)
await shareDlg.getByLabel("Protect with a password (recommended)").uncheck();
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
expect("the family dialog shows the same warning",
  (await famDlg.innerText()).includes("The data travel inside the link itself."));
await famDlg.getByLabel("Protect with a password (recommended)").uncheck();
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

// --- export bundle (with one page layout of the example's two graphs: P-63)
await fileMenu.click();
await page.getByRole("menuitem", { name: "New layout" }).click();
await page.waitForSelector(".layout-page", { timeout: 10000 });
await page.getByRole("button", { name: "Fill with graphs" }).click();
await page.waitForFunction(() => document.querySelectorAll(".layout-graph .plot.js-plotly-plot").length >= 2,
  null, { timeout: 60000 });
await fileMenu.click();
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
  // P-60: the published schema (docs/project-file.schema.json, ajv)
  const errs = projectSchemaErrors(pj);
  expect("schema: the bundle's project.json validates against docs/project-file.schema.json",
    errs.length === 0, errs.slice(0, 5).join(" | "));
}
expect("bundle has the data tables as .pzfx", has("data.pzfx")
  && (strFromU8(entries["data.pzfx"]).match(/<Table /g) ?? []).length === 3);
const resultsCsv = names.filter((n) => n.startsWith("results/"));
expect("bundle has one CSV per results sheet", resultsCsv.length === 3, resultsCsv.join(", "));
expect("results CSV holds the LogIC50 row", resultsCsv.some((n) => /LogIC50,/.test(strFromU8(entries[n]))));
// P-64: File › Export tables and results to Excel (.xlsx): one worksheet per
// table and per results sheet, numbers stored as numbers, every value equal
// to the CSV export (the bundle's CSVs); the bundle's workbook.xlsx too
{
  await fileMenu.click();
  const [xl] = await Promise.all([
    page.waitForEvent("download", { timeout: 120000 }),
    page.getByRole("menuitem", { name: "Export tables and results to Excel (.xlsx)" }).click(),
  ]);
  const xlsxPath = join(tmp, xl.suggestedFilename());
  await xl.saveAs(xlsxPath);
  expect("the Excel export is named after the project", /\.xlsx$/.test(xl.suggestedFilename()), xl.suggestedFilename());
  const book = readXlsx(new Uint8Array(readFileSync(xlsxPath)));
  const tableCsv = names.filter((n) => /^data\/[^/]+\.csv$/.test(n) && !n.endsWith(".long.csv"));
  expect("workbook: README, then one sheet per data table and per results sheet",
    book.names[0] === "README" && book.names.length === 1 + tableCsv.length + resultsCsv.length,
    book.names.join(", "));
  // CSV fields that must be numbers: everything that reads as a plain
  // decimal number, except the title row(s) and a row-title column
  const NUM = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/;
  const expected = {};
  let mismatch = "";
  let numbers = 0;
  [...tableCsv, ...resultsCsv].forEach((csvName, k) => {
    const sheet = book.names[k + 1];
    const csv = parseCsv(strFromU8(entries[csvName]));
    const isTable = k < tableCsv.length;
    const titleRows = isTable ? 1 : 0;
    const textCol = isTable && csv[0]?.[0] === "Row title" ? 0 : -1;
    expected[sheet] = csv.map((row, i) => row.map((v, j) => {
      if (v === "") return null;
      const num = i >= titleRows && j !== textCol && NUM.test(v) && Number.isFinite(Number(v));
      return { t: num ? "n" : "s", v };
    }));
    expected[sheet].forEach((row, i) => row.forEach((c, j) => {
      const got = book.sheets[sheet]?.[i]?.[j] ?? null;
      if (c === null ? got !== null : c.t === "n" ? !(typeof got === "number" && got === Number(c.v))
        : got !== c.v) mismatch ||= `${sheet}!R${i + 1}C${j + 1}: CSV ${JSON.stringify(c)} vs ${JSON.stringify(got)}`;
      if (c?.t === "n") numbers++;
    }));
  });
  expect("workbook: every cell equals the CSV export, numbers as number cells",
    !mismatch && numbers > 100, mismatch || `${numbers} number cells`);
  expect("workbook: the fit's LogIC50 is a number in its results sheet",
    Object.values(book.sheets).some((rows) => rows.some((r) => r[0] === "LogIC50" && typeof r[1] === "number")));
  const inBundle = entries["workbook.xlsx"] ? readXlsx(entries["workbook.xlsx"]) : null;
  expect("the bundle's workbook.xlsx holds the same sheets and cells",
    !!inBundle && JSON.stringify({ ...inBundle.sheets, README: null }) === JSON.stringify({ ...book.sheets, README: null })
    && strFromU8(entries["README.txt"]).includes("workbook.xlsx"));
  // independent readers: openpyxl, python-calamine and LibreOffice (PYTHON
  // names an interpreter with openpyxl and python-calamine)
  const expPath = join(tmp, "workbook-expected.json");
  writeFileSync(expPath, JSON.stringify(expected));
  const py = process.env.PYTHON ?? "python3";
  const rb = spawnSync(py, [join(here, "xlsx-readback.py"), xlsxPath, expPath], { encoding: "utf8", timeout: 400000 });
  const out = (rb.stdout || rb.stderr).trim();
  if (rb.status === 2) console.log(`skip some readers are missing for ${py}: ${out.replace(/\s+/g, " ")}`);
  expect("openpyxl, python-calamine and LibreOffice read every cell back equal to the CSV export",
    rb.status === 0 || rb.status === 2, out.replace(/\s+/g, " "));
}
const svgs = names.filter((n) => /^graphs\/.+\.svg$/.test(n));
const pngs = names.filter((n) => /^graphs\/.+\.png$/.test(n));
expect("bundle has every graph (the example has two) as SVG and PNG",
  svgs.length === 2 && pngs.length === 2 && has("graphs/graph-of-dose-response.svg"),
  `${svgs.length} SVG, ${pngs.length} PNG`);
expect("bundle PNGs are PNGs", pngs.every((n) => entries[n][0] === 0x89 && entries[n][1] === 0x50));
const readme = strFromU8(entries["README.txt"]);
expect("README names the software versions", /OpenDose \S+/.test(readme) && /SciPy \d/.test(readme));
expect("README lists every file", names.filter((n) => n !== "README.txt").every((n) => readme.includes(n)));
// P-63: each graph as PDF, the layout page as PDF and SVG, read back by
// pypdf (PYTHON names an interpreter that has it) and by pdf.js (PDFJS
// names a pdfjs-dist folder; both are skipped, saying so, when absent)
{
  const pdfs = names.filter((n) => /^graphs\/.+\.pdf$/.test(n));
  const lay = names.filter((n) => n.startsWith("layouts/"));
  expect("bundle has every graph as PDF (fonts embedded, as the graph's own PDF export)",
    pdfs.length === 2 && pdfs.every((n) => strFromU8(entries[n].subarray(0, 5)) === "%PDF-")
    && pdfs.every((n) => /\/FontFile2/.test(Buffer.from(entries[n]).toString("latin1"))), pdfs.join(", "));
  expect("bundle has the layout page as PDF and SVG, and its source data (P-65)", lay.length === 3
    && has("layouts/layout-1.pdf") && has("layouts/layout-1.svg") && has("layouts/layout-1-source-data.xlsx")
    && strFromU8(entries["layouts/layout-1.svg"]).includes("<svg"), lay.join(", "));
  const src = entries["layouts/layout-1-source-data.xlsx"] ? readXlsx(entries["layouts/layout-1-source-data.xlsx"]) : null;
  expect("the layout's source data: README and a sheet per panel letter (A, B), each with its drawn values",
    JSON.stringify(src?.names) === JSON.stringify(["README", "A", "B"])
    && ["A", "B"].every((s) => src.sheets[s].some((r) => r.length === 1 && /^(Plotted values|Centre and error bars|Drawn curve)/.test(r[0]))
      && src.sheets[s].some((r) => r.some((c) => typeof c === "number"))), JSON.stringify(src?.names));
  lay.splice(lay.indexOf("layouts/layout-1-source-data.xlsx"), 1);
  for (const n of [...pdfs, ...lay]) {
    expect(`README lists ${n} on a line of its own with what it is`, new RegExp(`\\n${n.replace(/\./g, "\\.")}\\n {4}\\S`).test(readme));
  }
  const files = [...pdfs, "layouts/layout-1.pdf"].map((n) => {
    const f = join(tmp, n.replace("/", "-"));
    writeFileSync(f, entries[n]);
    return f;
  });
  const py = process.env.PYTHON ?? "python3";
  const r = spawnSync(py, ["-c", "import sys, pypdf\nfor f in sys.argv[1:]:\n r = pypdf.PdfReader(f)\n"
    + " print(len(r.pages), round(float(r.pages[0].mediabox.width), 2), len(r.pages[0].extract_text()) > 0)",
  ...files], { encoding: "utf8" });
  if (r.status !== 0 && /No module named .pypdf/.test(r.stderr)) {
    console.log(`skip pypdf is not installed for ${py}: set PYTHON to an interpreter that has it`);
  } else {
    const rows = r.stdout.trim().split("\n").map((l) => l.split(" "));
    expect("pypdf opens every bundle PDF: one page each, with text; the layout page is A4 (595.28 pt)",
      r.status === 0 && rows.length === 3 && rows.every((x) => x[0] === "1" && x[2] === "True")
      && rows[2][1] === "595.28", (r.stdout || r.stderr).replace(/\s+/g, " ").slice(0, 300));
  }
  if (process.env.PDFJS) {
    // pdf.js runs in a blank page (it needs the DOM; the app's CSP would
    // refuse its scripts), loaded from blob URLs
    const blank = await ctx1.newPage();
    const out = await blank.evaluate(async ({ lib, worker, pdfs }) => {
      const url = (src) => URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
      const pdfjs = await import(url(lib));
      pdfjs.GlobalWorkerOptions.workerSrc = url(worker);
      const res = [];
      for (const b64 of pdfs) {
        const doc = await pdfjs.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
        const pg = await doc.getPage(1);
        const text = (await pg.getTextContent()).items.map((i) => i.str).join(" ");
        res.push({ pages: doc.numPages, w: Math.round(pg.view[2] * 100) / 100, text: text.length });
      }
      return res;
    }, { lib: readFileSync(join(process.env.PDFJS, "build/pdf.min.mjs"), "utf8"),
      worker: readFileSync(join(process.env.PDFJS, "build/pdf.worker.min.mjs"), "utf8"),
      pdfs: files.map((f) => readFileSync(f).toString("base64")) });
    await blank.close();
    expect("pdf.js opens every bundle PDF: one page each, with text", out.length === 3
      && out.every((o) => o.pages === 1 && o.text > 0) && out[2].w === 595.28, JSON.stringify(out));
  } else {
    console.log("skip pdf.js: set PDFJS to a pdfjs-dist folder to read the PDFs with it too");
  }
}
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
// "Recognise the file" is checked before the file is read: wait until it
// says what the file looks like, then check which recipe it picked.
await rcp.locator(".recipe-option.checked", { hasText: "Looks like:" }).waitFor({ timeout: 10000 })
  .catch(() => {});
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
await page.locator(".grid-toolbar").getByRole("button", { name: "More", exact: true }).click();
await page.getByRole("menuitem", { name: "Reshape…" }).click();
const rs = page.getByRole("dialog", { name: /Reshape .* to a long table/ });
await rs.waitFor({ timeout: 10000 });
expect("reshape previews 7 observations", (await rs.getByRole("status").innerText()).startsWith("7 observations"));
await rs.getByRole("button", { name: "Create long table" }).click();
await page.getByRole("treeitem", { name: "FlowJo statistics (long)", exact: true }).first().waitFor({ timeout: 10000 });
expect("long table created as multiple variables",
  await page.locator(".var-type").count() === 3, String(await page.locator(".var-type").count()));

// --- Apply to new data: the example project replayed onto a copy of its
// contingency table with one count changed (15 -> 25 exposed events)
// Sheets of a kind listed in the navigator (each once, under its table).
const navCount = (kind) => page.locator(`.nav-item[data-kind='${kind}']`).count();
// axe-core (WCAG 2 A and AA rules) on the open dialog
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const axeDialog = async () => {
  await page.evaluate(readFileSync(axePath, "utf8")).catch(() => {});
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
await fileMenu.click();
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
await fileMenu.click();
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
await viewMenu(page, "About OpenDose…");
const pop = page.locator(".info-pop");
expect("privacy statement in the info popover",
  (await pop.innerText()).includes("no data is sent anywhere"));
expect("file-format promise in the info popover",
  (await pop.innerText()).includes("every release opens every earlier version"));
// P-60: the format page (docs/project-file-format.md, beside the schema)
const fmtLink = pop.getByRole("link", { name: "The project file format and its JSON Schema" });
expect("About links the project file format page, in a new tab",
  await fmtLink.count() === 1
  && (await fmtLink.getAttribute("href")) === "https://github.com/erenozen/opendose/blob/main/docs/project-file-format.md"
  && (await fmtLink.getAttribute("target")) === "_blank");
await pop.getByRole("button", { name: "How OpenDose is validated" }).click();
const val = page.getByRole("dialog", { name: "How OpenDose is validated" });
await val.waitFor({ timeout: 10000 });
const rows = await val.locator(".validation-table tbody tr").count();
expect("validation page lists the pinned cross-checks", rows > 100, String(rows));
expect("validation page includes NIST Longley and Prism pins",
  (await val.innerText()).includes("Longley") && (await val.innerText()).includes("LogIC50"));
await val.getByRole("button", { name: "NIST StRD (11)" }).click();
// (the checks' own tables: the reference datasets below them have theirs, P-127)
expect("validation page filters by reference",
  await val.locator(".validation-group:not(.validation-datasets) .validation-table tbody tr").count() === 11);
await val.getByRole("button", { name: "Close" }).last().click();

// --- "Your data and privacy": from the info popover, and at #privacy
await viewMenu(page, "About OpenDose…");
await page.locator(".info-pop").getByRole("button", { name: "How your data stays private" }).click();
const priv = page.getByRole("dialog", { name: "Your data and privacy" });
await priv.waitFor({ timeout: 10000 });
const privText = await priv.innerText();
expect("privacy page opens from the info popover and covers what is sent, kept and how to check it",
  ["In short", "What is sent and received", "Enforced, not just promised", "What stays on this computer",
    "Sharing", "Check it yourself", "Run your own copy"].every((h) => privText.includes(h)), privText.slice(0, 120));
expect("privacy page links the test, the policy and the self-hosting guide",
  await priv.locator('a[href$="web/scripts/e2e-privacy.mjs"]').count() === 1
  && await priv.locator('a[href$="web/public/_headers"]').count() === 1
  && await priv.locator('a[href$="docs/self-hosting.md"]').count() === 1);
const privAxe = await axeDialog();
expect("axe-core: no WCAG A/AA violations on the privacy page", privAxe.length === 0, privAxe.join(" | "));
await priv.getByRole("button", { name: "Close" }).last().click();
{
  const ctxP = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const pp = await ctxP.newPage();
  watch(pp, "privacy-link");
  await pp.goto(url.replace(/[?#].*$/, "") + "#privacy", { waitUntil: "domcontentloaded" });
  expect("#privacy in the address opens the privacy page",
    await pp.getByRole("dialog", { name: "Your data and privacy" }).waitFor({ timeout: 30000 })
      .then(() => true, () => false));
  await ctxP.close();
}

// --- instrument recipes (Incucyte, LabChart, multi-read plates), many
// per-image CSVs in a zip, and a mapping saved as a recipe
{
  const write = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p; };
  const incucyte = (vals) => write("incucyte-export.txt", [
    "Vessel Name: HeLa scratch", "Metric: Phase Object Confluence (Percent)", "Cell Type: HeLa", "",
    "Date Time\tElapsed\tB2\tB3\tC2\tC2 (Std Err Image)",
    ...vals.map((r, i) => `01/03/2024 1${i}:00:00\t${i * 2}\t${r.join("\t")}\t0.2`),
  ].join("\n"));
  const INCU = incucyte([[5.1, 4.8, 6.0], [7.9, 7.2, 9.5], [12.4, 11.8, 15.1]]);
  const val = (label) => page.getByLabel(label, { exact: true }).first().inputValue();
  const openRecipes = async () => {
    await page.getByRole("button", { name: "Import…" }).click();
    await page.getByRole("tab", { name: "Recipes" }).click();
    const d = page.getByRole("dialog", { name: "Import with a recipe" });
    await d.waitFor({ timeout: 10000 });
    return d;
  };

  // (0) a long table whose label column reads A … then B (warpbreaks:
  // wool, tension, breaks) is a long table, not a 6-well plate
  let d = await openRecipes();
  const WOOL = write("warpbreaks.csv", ["wool,tension,breaks", ...Array.from({ length: 54 }, (_, i) =>
    `${i < 27 ? "A" : "B"},${"LMH"[Math.floor((i % 27) / 9)]},${10 + ((i * 7) % 45)}`)].join("\n"));
  await d.getByLabel("Export file to import").setInputFiles(WOOL);
  await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
  expect("warpbreaks-like long table recognised as a long table, not a plate",
    await d.locator(".recipe-option", { hasText: "Long (tidy) table" }).locator(".recipe-detected").count() === 1
    && await d.locator(".recipe-option", { hasText: "Plate reader grid" }).locator(".recipe-detected").count() === 0
    && !(await d.innerText()).includes("well plate found at row"));
  await d.getByRole("button", { name: "Cancel" }).click();
  await d.waitFor({ state: "detached", timeout: 10000 });

  // (a) Incucyte → XY table of confluence over time per well; saved as a recipe
  d = await openRecipes();
  await d.getByLabel("Export file to import").setInputFiles(INCU);
  await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
  expect("Incucyte export recognised", await d.locator(".recipe-option", { hasText: "Incucyte time series" })
    .locator(".recipe-detected").count() === 1);
  expect("Incucyte recipe says which layouts it recognises",
    await d.locator(".recipe-option", { hasText: "Recognises: Incucyte ZOOM" }).count() === 1);
  expect("standard-error column left out", (await d.innerText()).includes("1 standard-error column left out"));
  await d.getByRole("tab", { name: "Table" }).click();
  expect("XY table chosen for Incucyte", await d.getByRole("radio", { name: /^XY/ }).isChecked());
  await d.getByLabel("Table name").fill("Confluence per well");
  await d.getByRole("button", { name: "Save as recipe…" }).click();
  await d.getByLabel("Recipe name").fill("Incucyte confluence");
  await d.getByRole("button", { name: "Save recipe" }).click();
  expect("recipe saved in this browser and the project",
    (await d.getByRole("region", { name: "Save as recipe" }).innerText())
      .includes("Saved “Incucyte confluence” in this browser and the project."));
  await d.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("treeitem", { name: "Confluence per well", exact: true }).first().waitFor({ timeout: 10000 });
  const xs = [await val("X, row 1"), await val("X, row 2"), await val("X, row 3")];
  expect("Incucyte: X = elapsed hours 0, 2, 4", xs.join(",") === "0,2,4", xs.join(","));
  expect("Incucyte: X title is Elapsed (h)", await page.getByLabel("X column title").inputValue() === "Elapsed (h)");
  const dsNames = [await val("Dataset 1 title"), await val("Dataset 2 title"), await val("Dataset 3 title")];
  expect("Incucyte: one data set per well B2, B3, C2", dsNames.join(",") === "B2,B3,C2", dsNames.join(","));
  expect("Incucyte: C2 at 2 h is 9.5", await val("C2, row 2") === "9.5", await val("C2, row 2"));

  // (b) LabChart → XY table with the channel names, time in ms
  const LAB = write("labchart.txt", ["Interval=\t0.5 s", "ExcelDateTime=\t4.5352e+04\t01/03/2024 10:00:00",
    "TimeFormat=\tStartOfBlock", "ChannelTitle=\tPressure\tFlow", "Range=\t10.000 V\t10.000 V",
    "UnitName=\tmmHg\tml/min", "0\t98.1\t1.20", "0.5\t98.3\t1.21", "1\t99.0\t1.25\t#* Drug added",
    "1.5\t99.4\t1.30", "2\t99.9\t1.32"].join("\n"));
  d = await openRecipes();
  await d.getByLabel("Export file to import").setInputFiles(LAB);
  await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
  expect("LabChart export recognised", await d.locator(".recipe-option", { hasText: "LabChart text export" })
    .locator(".recipe-detected").count() === 1);
  await d.getByLabel("Time unit").selectOption("ms");
  expect("LabChart comment listed", (await d.innerText()).includes("1000 ms: Drug added"));
  await d.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("treeitem", { name: "LabChart", exact: true }).first().waitFor({ timeout: 10000 });
  const lab = [await val("Dataset 1 title"), await val("Dataset 2 title")];
  expect("LabChart: data sets are the channels with units", lab.join(" | ") === "Pressure (mmHg) | Flow (ml/min)",
    lab.join(" | "));
  expect("LabChart: X in ms (row 3 = 1000), Pressure 99", await val("X, row 3") === "1000"
    && await val("Pressure (mmHg), row 3") === "99", `${await val("X, row 3")} ${await val("Pressure (mmHg), row 3")}`);
  expect("LabChart: X title Time (ms)", await page.getByLabel("X column title").inputValue() === "Time (ms)");

  // (c) multi-read plate run → grouped table, one row per read
  const block = (label, f) => [label, "\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12",
    ..."ABCDEFGH".split("").map((row, r) => [row, ...Array.from({ length: 12 }, (_, c) => f(r, c).toFixed(3))].join("\t")),
    ""].join("\n");
  const READS = write("multiread.txt", ["Plate: run 1", "", block("Read 1:450", (r, c) => 0.1 + r * 0.01 + c * 0.001),
    block("Read 2:620", (r) => 0.05 + r * 0.001)].join("\n"));
  d = await openRecipes();
  await d.getByLabel("Export file to import").setInputFiles(READS);
  await d.locator(".recipe-option.checked", { hasText: "Recognise the file" }).waitFor();
  expect("multi-read run recognised", await d.locator(".recipe-option", { hasText: "Multi-read plate run" })
    .locator(".recipe-detected").count() === 1);
  expect("two reads of a 96-well plate found", (await d.innerText()).includes("2 reads of a 96-well plate: Read 1:450, Read 2:620"));
  await d.getByRole("tab", { name: "Columns" }).click();
  expect("plate map editor offered for the wells",
    await d.getByRole("checkbox", { name: /Group the wells with a plate map/ }).count() === 1);
  await d.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("treeitem", { name: "Plate reads", exact: true }).first().waitFor({ timeout: 10000 });
  const rowsT = [await page.getByLabel("Row 1 title").inputValue(), await page.getByLabel("Row 2 title").inputValue()];
  expect("multi-read: the reads are the rows", rowsT.join(" | ") === "Read 1:450 | Read 2:620", rowsT.join(" | "));
  expect("multi-read: B3 at 450 nm is 0.112, at 620 nm 0.051",
    await val("B3, row 1") === "0.112" && await val("B3, row 2") === "0.051",
    `${await val("B3, row 1")} ${await val("B3, row 2")}`);

  // (d) a zip of 6 per-image CSVs → condition / replicate / image → SuperPlot-ready column table
  const files = {};
  ["ctrl", "drug"].forEach((cond, ci) => [1, 2, 3].forEach((rep) => {
    const cells = [10 + ci * 5 + rep, 12 + ci * 5 + rep, 14 + ci * 5 + rep];
    files[`${cond}_rep${rep}_img03.csv`] = strToU8([" ,Area,Mean", ...cells.map((a, i) => `${i + 1},${a},${100 + i}`)].join("\n"));
  }));
  const ZIP = join(tmp, "per-image.zip");
  writeFileSync(ZIP, zipSync(files));
  await page.getByRole("button", { name: "Import…" }).click();
  const imp = page.getByRole("dialog", { name: "Import data" });
  await imp.waitFor({ timeout: 10000 });
  await imp.locator('input[aria-label="File to import"]').setInputFiles(ZIP);
  d = page.getByRole("dialog", { name: "Import with a recipe" });
  await d.waitFor({ timeout: 10000 });
  await d.getByLabel("Files stacked").waitFor({ timeout: 10000 });
  expect("6 files stacked with the file name as a column",
    (await d.getByLabel("Files stacked").innerText()).startsWith("6 files stacked into one table of 18 rows"),
    await d.getByLabel("Files stacked").innerText());
  expect("per-image recipe chosen", (await d.locator(".recipe-option.checked").innerText()).includes("Per-image tables"));
  await d.getByRole("tab", { name: "Columns" }).click();
  expect("name template fits every file", (await d.getByRole("region", { name: "Name pattern" }).innerText())
    .includes("6 of 6 names fit"));
  expect("name preview reads ctrl / 1 / 03",
    /ctrl_rep1_img03\.csv\s+ctrl\s+1\s+03/.test(await d.getByLabel("How the names split").innerText()));
  const staged = await d.getByLabel("Staged records").innerText();
  expect("stacked table has File, Condition, Replicate and Image columns",
    ["File", "Condition", "Replicate", "Image"].every((h) => staged.includes(h)), staged.slice(0, 200));
  await d.getByRole("tab", { name: "Table" }).click();
  expect("column table with the replicate map",
    await d.getByRole("radio", { name: /^Column/ }).isChecked()
    && (await d.getByRole("status", { name: "Replicate map" }).innerText()).includes("3 independent experiments (from Replicate); each value is one image"),
    await d.getByRole("status", { name: "Replicate map" }).innerText().catch(() => ""));
  await d.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("treeitem", { name: "Image tables", exact: true }).first().waitFor({ timeout: 10000 });
  const groups = [await val("Group 1 title"), await val("Group 2 title"), await val("Group 3 title")];
  expect("2 groups and the experiment labels", groups.join(",") === "ctrl,drug,Experiment", groups.join(","));
  const nCtrl = await filled("ctrl");
  const nDrug = await filled("drug");
  expect("3 values (images) per group", nCtrl === 3 && nDrug === 3, `ctrl ${nCtrl}, drug ${nDrug}`);
  expect("ctrl rep1 image mean = 13 (mean of 11, 13, 15)", await val("ctrl, row 1") === "13", await val("ctrl, row 1"));
  expect("experiment labels Replicate 1..3", await val("Experiment, row 3") === "Replicate 3");
  await page.getByRole("treeitem", { name: "Graph of Image tables", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => document.querySelector(".plot-card .figure-legend-text")?.textContent
    ?.includes("independent experiments"), null, { timeout: 60000 }).catch(() => {});
  const leg = await page.locator(".plot-card .figure-legend-text").innerText().catch(() => "");
  expect("legend: n = 3 images per group from 3 independent experiments",
    leg.includes("n = 3 images per group from 3 independent experiments"), leg);

  // (e) the saved recipe after a reload, applied from the Import menu
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  await page.getByRole("treeitem", { name: "Dose response", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.getByRole("button", { name: "Import…" }).click();
  const imp2 = page.getByRole("dialog", { name: "Import data" });
  await imp2.waitFor({ timeout: 10000 });
  const pick = imp2.getByLabel("Apply a saved recipe");
  expect("saved recipe listed in the Import dialog after a reload",
    (await pick.innerText()).includes("Incucyte confluence (Incucyte time series)"), await pick.innerText());
  const opt = await pick.locator("option", { hasText: "Incucyte confluence" }).getAttribute("value");
  await pick.selectOption(opt);
  d = page.getByRole("dialog", { name: "Import with a recipe" });
  await d.waitFor({ timeout: 10000 });
  expect("saved recipe chosen", (await d.locator(".recipe-option.checked").innerText()).includes("Incucyte confluence"));
  await d.getByLabel("Export file to import").setInputFiles(incucyte([[1, 2, 3], [4, 5, 6]]));
  await d.getByRole("button", { name: "Create table" }).click();
  await page.getByRole("treeitem", { name: "Confluence per well", exact: true }).first().waitFor({ timeout: 10000 });
  expect("saved recipe applied in one click: XY table named by the recipe, C2 at 2 h = 6",
    await val("C2, row 2") === "6" && await val("X, row 2") === "2", await val("C2, row 2"));
}

// --- P-66 one statistics table, P-67 analysis.py and analysis.R: a t test,
// a one-way ANOVA with Tukey and a 4PL fit (e2e-fixtures/stage/stats-table.json);
// every row of the table equals what its results sheet shows; the bundle's
// analysis.py, run with Python (PYTHON: SciPy and statsmodels), reproduces the
// t test and the 4PL estimates
{
  await ctx1.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "stats-table.json"));
  await page.getByRole("treeitem", { name: "t test of Weights", exact: true }).first().waitFor({ timeout: 30000 });
  // what each results sheet shows: label -> value cells of its tables
  const sheetCells = async (name, ready) => {
    await page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .nav-row").click();
    await page.waitForFunction((t) => [...document.querySelectorAll(".pane-results .results-table")]
      .some((x) => x.innerText.includes(t)), ready, { timeout: 120000 });
    return page.evaluate(() => [...document.querySelectorAll(".pane-results .results-table tr")]
      .map((tr) => [...tr.querySelectorAll("th, td")].map((c) => c.innerText.replace(/\s+/g, " ").trim())));
  };
  const tRows = await sheetCells("t test of Weights", "t, df");
  const tdf = (tRows.find((r) => r[0] === "t, df") ?? [])[1] ?? "";
  const shownT = /t=(\S+), df=(\S+)/.exec(tdf) ?? [];
  const shownP = ((tRows.find((r) => /^P value \(two-tailed/.test(r[0])) ?? [])[1] ?? "").replace(/\s*\*+$|\s+ns$/, "");
  const aRows = await sheetCells("One-way ANOVA of Weights", "Treated A vs. Treated B");
  const shownTukey = Object.fromEntries(aRows.filter((r) => / vs\. /.test(r[0]) && r.length >= 4).map((r) => [r[0], r[3]]));
  const fRows = await sheetCells("Nonlin fit of Dose response", "LogIC50");
  const ic50Row = fRows.find((r) => /^IC50\b/.test(r[0])) ?? [];
  console.log("fit sheet rows:", fRows.filter((r) => /IC50/.test(r[0] ?? "")).map((r) => r.join(" | ")).join(" / "));
  const logRow = fRows.find((r) => r[0] === "LogIC50") ?? [];

  await fileMenu.click();
  const stats = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("menuitem", { name: "Export statistics table (.csv)" }).click(),
  ]).then(async ([d]) => ({ name: d.suggestedFilename(), text: readFileSync(await d.path(), "utf8") }));
  expect("statistics table: named after the project", stats.name === "statistics-table-statistics.csv", stats.name);
  const rows = parseCsv(stats.text.replace(/^﻿/, ""));
  const head = rows[0];
  const col = (name) => head.indexOf(name);
  const body = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  console.log("statistics table:", body.map((r) => `${r["Results sheet"]} | ${r.Comparison} | ${r["Statistic value"]} | ${r.P}`).join(" / "));
  expect("statistics table: the documented columns", ["Results sheet", "Figure panel", "Test", "n per group",
    "Statistic", "df", "P", "P (exact)", "Adjustment", "Family", "Effect size"].every((h) => col(h) >= 0), head.join(", "));
  const tt = body.filter((r) => r["Results sheet"] === "t test of Weights");
  expect("statistics table: one row for the t test, equal to its results sheet (t, df, P)",
    tt.length === 1 && tt[0]["Statistic value"] === shownT[1] && tt[0].df === shownT[2] && tt[0].P === shownP
    && tt[0]["n per group"] === "Control 6; Treated A 6" && tt[0].Adjustment === "none (one comparison)",
    JSON.stringify({ row: tt[0], shownT, shownP }));
  const an = body.filter((r) => r["Results sheet"] === "One-way ANOVA of Weights");
  const posthoc = an.filter((r) => r.Adjustment === "Tukey");
  expect("statistics table: the ANOVA's F test and one row per Tukey comparison, P as the sheet shows it",
    an.length === 4 && an[0].Statistic === "F" && posthoc.length === 3
    && posthoc.every((r) => shownTukey[r.Comparison] === r.P && r.Family === "3 comparisons (all pairs of 3 groups)"),
    JSON.stringify({ posthoc: posthoc.map((r) => [r.Comparison, r.P]), shownTukey }));
  expect("statistics table: figure panels from the layout (ANOVA panel A, fit panel B, t test none)",
    an.every((r) => r["Figure panel"] === "Figure 1, panel A") && tt[0]["Figure panel"] === ""
    && body.filter((r) => r["Results sheet"] === "Nonlin fit of Dose response").every((r) => r["Figure panel"] === "Figure 1, panel B"));
  const fit = body.filter((r) => r["Results sheet"] === "Nonlin fit of Dose response");
  const ic = fit.find((r) => r.Estimate === "IC50"), lg = fit.find((r) => r.Estimate === "LogIC50");
  expect("statistics table: the fit's IC50 and LogIC50 as its results sheet shows them",
    !!ic && ic["Estimate value"] === ic50Row[1] && `${ic["CI lower"]} to ${ic["CI upper"]}` === ic50Row[3]
    && !!lg && lg["Estimate value"] === logRow[1] && `${lg["CI lower"]} to ${lg["CI upper"]}` === logRow[3],
    JSON.stringify({ ic, ic50Row, lg, logRow }));

  // the same table as an Excel sheet, numbers as numbers
  await fileMenu.click();
  const xs = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("menuitem", { name: "Export statistics table to Excel (.xlsx)" }).click(),
  ]).then(async ([d]) => readXlsx(new Uint8Array(readFileSync(await d.path()))));
  const sheet = xs.sheets.Statistics ?? [];
  const pExact = col("P (exact)");
  expect("statistics workbook: Statistics and README sheets; P (exact) stored as a number equal to the CSV",
    JSON.stringify(xs.names) === JSON.stringify(["Statistics", "README"]) && sheet.length === rows.length
    && sheet.slice(1).every((r, i) => (rows[i + 1][pExact] === "" ? r[pExact] == null : r[pExact] === Number(rows[i + 1][pExact]))),
    xs.names.join(", "));

  // Copy statistics table for Word: an HTML table on the clipboard
  await fileMenu.click();
  await page.getByRole("menuitem", { name: "Copy statistics table for Word" }).click();
  await page.getByText(/^Copied the statistics table for Word/).first().waitFor({ timeout: 10000 });
  const clip = await page.evaluate(async () => {
    for (const it of await navigator.clipboard.read()) {
      if (it.types.includes("text/html")) return (await it.getType("text/html")).text();
    }
    return "";
  });
  expect("Copy statistics table for Word: an HTML table with the t test row",
    /<table[^>]*>/.test(clip) && clip.includes("<th") && clip.includes(`t = ${shownT[1]} (${shownT[2]})`), clip.slice(0, 200));

  // the bundle: statistics.csv equal to the File menu's, analysis.py and analysis.R
  await fileMenu.click();
  const [bd] = await Promise.all([
    page.waitForEvent("download", { timeout: 180000 }),
    page.getByRole("menuitem", { name: "Download export bundle (.zip)" }).click(),
  ]);
  const zip = unzipSync(new Uint8Array(readFileSync(await bd.path())));
  const inBundle = strFromU8(zip["statistics.csv"] ?? new Uint8Array());
  expect("bundle: statistics.csv, .xlsx and .html, analysis.py and analysis.R",
    ["statistics.csv", "statistics.xlsx", "statistics.html", "analysis.py", "analysis.R"].every((n) => !!zip[n]),
    Object.keys(zip).join(", "));
  expect("bundle: statistics.csv holds the same rows as File › Export statistics table",
    JSON.stringify(parseCsv(inBundle)) === JSON.stringify(rows));
  const readme = strFromU8(zip["README.txt"]);
  expect("bundle README lists analysis.py with what it re-runs", /analysis\.py\n {4}Python \(SciPy, statsmodels\) re-running 3 results sheets/.test(readme),
    readme.split("\n").filter((l) => /analysis|statistics/.test(l)).join(" | "));
  const py = strFromU8(zip["analysis.py"]);
  expect("analysis.py reads the bundle's long CSVs", py.includes('d = load("weights.long.csv")')
    && py.includes('d = load("dose-response.long.csv")'));
  const dir = mkdtempSync(join(tmpdir(), "opendose-bundle-py-"));
  for (const [n, data] of Object.entries(zip)) {
    if (n.endsWith("/")) continue;
    const out = join(dir, n);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
  const python = process.env.PYTHON ?? "python3";
  const run = spawnSync(python, [join(dir, "analysis.py"), "--json"], { encoding: "utf8", timeout: 120000 });
  if (run.status !== 0 && /No module named/.test(run.stderr)) {
    console.log(`skip analysis.py: ${python} lacks a module (${run.stderr.trim().split("\n").pop()}); set PYTHON`);
  } else {
    const res = JSON.parse(run.stdout || "{}");
    const t = res["t test of Weights"] ?? {};
    const exactP = Number(tt[0]["P (exact)"]);
    // the t test to the table's own precision (4 significant digits), the 4PL
    // LogIC50 to 1e-3 and the IC50 to 0.5% (curve_fit vs the engine's fit)
    expect("analysis.py reproduces the t test: t and P to the table's 4 significant digits",
      Math.abs(Number(t.t).toPrecision(4) - Number(tt[0]["Statistic value"])) < 1e-9
      && Math.abs(t.p - exactP) <= 5e-4 * exactP, JSON.stringify({ t, row: tt[0] }));
    const f = res["Nonlin fit of Dose response | Drug A"] ?? {};
    expect("analysis.py reproduces the 4PL: LogIC50 within 1e-3, IC50 within 0.5%",
      Math.abs(f.LogIC50 - Number(lg["Estimate value"])) < 1e-3
      && Math.abs(f.IC50 - Number(ic["Estimate value"])) <= 5e-3 * Number(ic["Estimate value"]),
      JSON.stringify({ f, ic: ic["Estimate value"], lg: lg["Estimate value"] }));
  }
}

// --- P-66 for the kinds merged after it: the meta-analysis of the BCG trials
// (e2e-fixtures/stage/meta-bcg.json, REML with the Hartung-Knapp CI) gets
// its pooled rows in the statistics table, equal to its results card;
// before, one "Not tabulated" row
{
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "meta-bcg.json"));
  await page.getByRole("treeitem", { name: "Combined experiments of BCG trials", exact: true }).first()
    .locator(":scope > .nav-row").click({ timeout: 30000 });
  await page.waitForFunction(() => /Random effects \(REML/.test(document.querySelector(".pane-results .meta-results")
    ?.textContent ?? ""), null, { timeout: 120000 }).catch(() => {});
  const cardText = (await page.locator(".pane-results .meta-results").first().innerText().catch(() => "")).replace(/\s+/g, " ");
  const shown = /Random effects \(REML, Hartung-Knapp\) \S+ \S+ (\S+) (\S+) to (\S+)/.exec(cardText) ?? [];
  await fileMenu.click();
  const st = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByRole("menuitem", { name: "Export statistics table (.csv)" }).click(),
  ]).then(async ([d]) => readFileSync(await d.path(), "utf8"));
  const rows = parseCsv(st.replace(/^﻿/, ""));
  const body = rows.slice(1).map((r) => Object.fromEntries(rows[0].map((h, i) => [h, r[i] ?? ""])));
  const pooled = body.find((r) => r.Comparison === "Pooled (random effects, REML)");
  expect("P-66 meta-analysis row: pooled ratio and Hartung-Knapp CI equal the results card (0.4894)",
    !!pooled && pooled.Estimate === "Pooled ratio" && pooled["Estimate value"] === "0.4894"
    && pooled["Estimate value"] === shown[1] && `${pooled["CI lower"]} to ${pooled["CI upper"]}` === `${shown[2]} to ${shown[3]}`
    && pooled["n per group"] === "13 studies" && /I² = 92\.22%/.test(pooled.Note),
    JSON.stringify({ pooled, shown: shown.slice(1) }));
  expect("P-66 meta-analysis: the heterogeneity Q row is there, no Not tabulated note",
    body.some((r) => r.Statistic === "Q" && r.Comparison === "Between studies")
    && !body.some((r) => /Not tabulated/.test(r.Note)), body.map((r) => r.Comparison).join(" / "));
}

// --- P-126: an exercise link for teaching. The plan's acceptance test:
// create an exercise link hiding the test and P; opening it shows the
// data and the task; after choosing a test, the results appear. Numbers:
// web/e2e-fixtures/reference/left_out_ttest.py (scipy ttest_ind).
{
  const ref = JSON.parse(readFileSync(join(here, "..", "e2e-fixtures", "reference", "left_out_ttest.json"), "utf8"));
  const tRow = `t=-${Number(ref.all_values.t.toPrecision(4))}, df=${ref.all_values.df}`;
  await fileMenu.click();
  await page.getByRole("menuitem", { name: "New data table…" }).click();
  const nd = page.locator(".new-table-dialog");
  await nd.getByRole("radio", { name: "From a template" }).check();
  await nd.getByRole("radio", { name: /Two-group t test/ }).check();
  await nd.getByLabel("Table name").fill("Exercise data");
  await nd.getByRole("button", { name: "Create from template" }).click();
  await page.waitForFunction((t) => (document.querySelector('.pane-results[data-live="true"]')?.textContent ?? "")
    .includes(t), tRow, { timeout: 120000 });
  await page.getByRole("treeitem", { name: "Exercise data", exact: true }).first()
    .locator(":scope > .nav-row").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Share this family…" }).click();
  const exDlg = page.getByRole("dialog", { name: "Share “Exercise data”" });
  await exDlg.waitFor({ timeout: 10000 });
  await exDlg.getByLabel("Protect with a password (recommended)").uncheck();
  await exDlg.getByLabel(/Make it an exercise/).check();
  expect("P-126 the dialog says plainly that the answer is inside the link",
    /Withheld in the app only\. The answer travels inside the link/.test(
      (await exDlg.locator(".share-exercise").innerText()).replace(/\s+/g, " ")));
  expect("P-126 no link until the task is written", await exDlg.getByLabel("Share link").count() === 0);
  await exDlg.getByRole("button", { name: "Copy link" }).click();
  expect("P-126 Copy link without a task asks for one",
    await exDlg.getByText("Enter the task the student sees").isVisible());
  const TASK = "Which test compares Control with Treated? Choose it, then read the result.";
  await exDlg.getByLabel("Task for the student").fill(TASK);
  expect("P-126 the test is withheld too by default",
    await exDlg.getByLabel(/Also withhold which test was run/).isChecked());
  const axEx = await axeDialog();
  expect("P-126 axe-core: the Share dialog with the exercise options passes", axEx.length === 0, axEx.join(" | "));
  const exLink = await exDlg.getByLabel("Share link").inputValue();
  await exDlg.getByRole("button", { name: "Done" }).click();
  // the student's browser
  const ctxS = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const student = await ctxS.newPage();
  watch(student, "exercise");
  await student.goto(exLink, { waitUntil: "domcontentloaded" });
  const ex = student.getByRole("region", { name: "Exercise" });
  await ex.waitFor({ timeout: 60000 });
  await student.waitForFunction(() => globalThis.__opendoseEngine?.state.phase === "ready", null,
    { timeout: 180000 }).catch(() => {});
  await student.waitForTimeout(1500);
  const body = await student.locator("body").innerText();
  expect("P-126 the link opens with the task and the data",
    (await ex.innerText()).includes(TASK)
    && await student.locator('.data-table input[aria-label="Control, row 1"]').inputValue() === "23.1");
  expect("P-126 no results, no P, no test name before the choice",
    await student.locator(".pane-results, .pane-answer, .pane-methods").count() === 0
    && !/P value|t=-|t test|Unpaired/i.test(body), body.match(/.{0,40}(P value|t=-|t test|Unpaired).{0,40}/i)?.[0] ?? "");
  expect("P-126 the analysis goes by a neutral name and its settings are withheld",
    await student.locator("header").getByRole("tab", { name: "Analysis 1" }).count() === 1
    && await student.getByRole("treeitem", { name: "Analysis 1", exact: true }).count() === 1
    && (await student.locator(".pane-controls").innerText()).includes("Settings withheld"));
  await student.evaluate(readFileSync(axePath, "utf8")).catch(() => {});
  const axW = await student.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document.querySelector(".pane-exercise"),
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return r.violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.html.slice(0, 90)}`));
  });
  expect("P-126 axe-core: the withheld results pane passes", axW.length === 0, axW.join(" | "));
  await ex.getByRole("button", { name: "Help me choose…" }).click();
  const wiz = student.getByRole("dialog", { name: "Help me choose a test" });
  await wiz.waitFor({ timeout: 10000 });
  expect("P-126 Help me choose keeps the recommendation until the answers are committed",
    !/Recommended/.test(await wiz.innerText())
    && await wiz.getByRole("button", { name: "Commit my answers" }).count() === 1);
  await wiz.getByRole("button", { name: "Commit my answers" }).click();
  const revealed = await student.waitForFunction((t) => (document.querySelector(".pane-results")?.textContent ?? "")
    .includes(t), tRow, { timeout: 120000 }).then(() => true, () => false);
  expect(`P-126 after the choice the results appear (${tRow}, scipy)`, revealed);
  const outcome = student.getByRole("region", { name: /Your answers point to/ });
  const outText = await outcome.innerText().catch(() => "");
  expect("P-126 the banner says what the answers point to and the analysis the link holds",
    /Your answers point to: .+\./.test(outText) && outText.includes("Column stats of Exercise data"), outText);
  expect("P-126 the analysis has its name back",
    await student.getByRole("treeitem", { name: "Column stats of Exercise data", exact: true }).count() === 1);
  await ctxS.close();
}

// --- P-127: the published reference datasets open as projects. On the
// validation page, "Open this dataset" on a NIST StRD check (Longley)
// opens the table and the multiple regression whose results equal the
// listed certified values at the 10 significant digits the project shows;
// the datasets section opens a NIST curve fit (Misra1a, from NIST's Start
// 1), a one-way ANOVA (SmLs01) and summary statistics (Lew) the same way.
// The values are NIST's certified values as the page lists them
// (src/share/referenceDatasets.json, compiled from docs/validation).
{
  const REFS = JSON.parse(readFileSync(join(here, "..", "src", "share", "referenceDatasets.json"), "utf8"));
  const certified = (id, q) => REFS.datasets.find((d) => d.id === id).references.find((r) => r.quantity === q).value;
  const ctxV = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const pv = await ctxV.newPage();
  watch(pv, "reference-datasets");
  await pv.goto(exampleUrl, { waitUntil: "domcontentloaded" });
  await pv.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
  const openValidation = async () => {
    await viewMenu(pv, "About OpenDose…");
    await pv.locator(".info-pop").getByRole("button", { name: "How OpenDose is validated" }).click();
    const v = pv.getByRole("dialog", { name: "How OpenDose is validated" });
    await v.waitFor({ timeout: 10000 });
    return v;
  };
  /** The results pane's text once a result of `name` is live. */
  const results = async (marker) => {
    await pv.waitForFunction((m) => {
      const el = document.querySelector('.pane-results[data-live="true"]');
      return !!el && (el.textContent ?? "").includes(m);
    }, marker, { timeout: 180000 });
    return (await pv.locator(".pane-results").innerText()).replace(/\s+/g, " ");
  };
  /** The number after `label` in the results text, as shown. */
  const shownAfter = (text, label) => {
    const at = text.indexOf(label);
    if (at < 0) return NaN;
    const m = text.slice(at + label.length).match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  const same10 = (shown, ref) => shown === Number(ref.toPrecision(10));
  const check = (what, text, pairs) => {
    for (const [label, id, q] of pairs) {
      const shown = shownAfter(text, label);
      const ref = certified(id, q);
      expect(`P-127 ${what}: ${q} shown ${shown} = certified ${ref} at 10 digits`, same10(shown, ref));
    }
  };

  let v = await openValidation();
  await v.getByRole("button", { name: "NIST StRD (11)" }).click();
  const onChecks = v.locator(".validation-group:not(.validation-datasets) .validation-open");
  expect("P-127 each NIST StRD check offers its dataset", await onChecks.count() === 11, String(await onChecks.count()));
  const listed = (await v.locator(".validation-table tbody tr", { hasText: "Intercept estimate" }).first().innerText())
    .replace(/\s+/g, " ");
  expect("P-127 the check lists the certified Longley intercept", listed.includes("-3482258.63459582"), listed);
  await onChecks.first().click();
  const lt = await results("β0 (Intercept)");
  check("Longley, opened from its check", lt, [
    ["β0 (Intercept)", "nist-longley", "B0"], ["β1: x1", "nist-longley", "B1"], ["β6: x6", "nist-longley", "B6"],
    ["Sy.x", "nist-longley", "sy_x"], ["R squared", "nist-longley", "r_squared"], ["F (6, 9) =", "nist-longley", "F"],
  ]);
  expect("P-127 the project holds the table, the analysis and the reference values",
    await pv.getByRole("treeitem", { name: "Longley", exact: true }).count() === 1
    && await pv.getByRole("treeitem", { name: "Reference values", exact: true }).count() === 1);
  expect("P-127 opening says where the published values are",
    await pv.locator(".toast", { hasText: /Opened the reference dataset “Longley”: its published values are in the info sheet “Reference values”\./ })
      .first().waitFor({ timeout: 10000 }).then(() => true, () => false));

  v = await openValidation();
  const sec = v.getByRole("region", { name: "Reference datasets you can open" });
  expect("P-127 the validation page lists the 34 openable NIST datasets",
    await sec.getByRole("button", { name: /^Open this dataset: / }).count() === 34);
  const misra = sec.locator("tr", { hasText: "Misra1a" });
  await misra.locator("summary").click();
  expect("P-127 a dataset's certified values are listed on the page",
    (await misra.innerText()).includes("2.3894212918E+02"));
  await sec.getByRole("button", { name: "Open this dataset: Misra1a" }).click();
  const mt = await results("Misra1a (NIST)");
  check("Misra1a (curve fit from Start 1)", mt, [
    ["Std. Error 95% CI (asymptotic) b1", "nist-misra1a", "b1"], [" b2 ", "nist-misra1a", "b2"],
    ["Sum of squares", "nist-misra1a", "residual_ss"], ["Sy.x", "nist-misra1a", "sy_x"],
  ]);

  v = await openValidation();
  await v.getByRole("button", { name: "Open this dataset: SmLs01" }).click();
  const st = await results("Ordinary one-way ANOVA");
  check("SmLs01 (one-way ANOVA)", st, [
    ["F(8, 180) =", "nist-smls01", "F"], ["R squared", "nist-smls01", "r_squared"],
    ["Residual SD (pooled, √MS residual)", "nist-smls01", "residual_sd"],
  ]);

  v = await openValidation();
  await v.getByRole("button", { name: "Open this dataset: Lew" }).click();
  const wt = await results("Descriptive");
  check("Lew (column statistics)", wt, [
    ["Mean", "nist-lew", "mean"], [" SD", "nist-lew", "sd"], ["Descriptive n", "nist-lew", "n"],
  ]);
  await ctxV.close();
}

await page.screenshot({ path: join(tmp, "share.png") });
console.log("files in", tmp);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("share + recipes e2e OK");
