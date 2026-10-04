// End-to-end check for page layouts and image export: builds a layout
// from the sample project's graphs and exports it, exports a graph as a
// vector PDF and as a transparent PNG, and checks the files byte by byte
// (PNG header, pHYs resolution, alpha at a corner; PDF signature and
// text kept as text). Also checks the citation and version stamp.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { inflateSync } from "node:zlib";
import { unzipSync } from "fflate";

const here = dirname(fileURLToPath(import.meta.url));
const baseUrl = process.argv[2] ?? "http://localhost:5173/";
// ?example=1 opens the example project directly (no start screen, no tour).
const url = (() => {
  const u = new URL(baseUrl);
  u.searchParams.set("example", "1");
  return u.toString();
})();
const tmp = mkdtempSync(join(tmpdir(), "opendose-export-"));

const browser = await chromium.launch({
  args: process.env.HOST_RESOLVER
    ? [`--host-resolver-rules=${process.env.HOST_RESOLVER}`]
    : [],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
const fail = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
const expect = (label, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) fail.push(label);
};
const save = async (trigger) => {
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), trigger()]);
  const file = join(tmp, download.suggestedFilename());
  await download.saveAs(file);
  return { file, name: download.suggestedFilename(), buf: readFileSync(file) };
};

// --- PNG parsing: header, pHYs, first pixel of the first row ---
function parsePng(buf) {
  const sig = buf.subarray(0, 8).toString("hex");
  if (sig !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let p = 8;
  const out = { idat: [] };
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      out.width = data.readUInt32BE(0);
      out.height = data.readUInt32BE(4);
      out.colorType = data[9];
    }
    if (type === "pHYs") out.ppm = data.readUInt32BE(0);
    if (type === "IDAT") out.idat.push(data);
    p += 12 + len;
  }
  // For every PNG filter type, the first pixel of the first row is stored
  // raw (its left and upper neighbours are zero), so its alpha is byte 4.
  const raw = inflateSync(Buffer.concat(out.idat));
  out.firstAlpha = out.colorType === 6 ? raw[4] : 255;
  return out;
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
await page.waitForSelector(".plot-card .plot.js-plotly-plot", { timeout: 30000 });
const panel = page.locator(".plot-card .export-panel");

// --- graph as vector PDF ---
await panel.getByLabel("Export format").selectOption("pdf");
const pdf = await save(() => panel.getByRole("button", { name: "Download" }).click());
expect("graph PDF starts with %PDF", pdf.buf.subarray(0, 5).toString("latin1") === "%PDF-",
  `${pdf.name}, ${(pdf.buf.length / 1024).toFixed(0)} KB`);
expect("graph PDF file named after the sheet", pdf.name === "graph-of-dose-response.pdf", pdf.name);
expect("graph PDF keeps text as text (standard font embedded by name)",
  /\/BaseFont\s*\/Helvetica/.test(pdf.buf.toString("latin1")));

// --- graph as transparent PNG at a stated resolution ---
await panel.getByLabel("Export format").selectOption("png");
await panel.getByLabel(/^Width/).fill("400");
await panel.getByLabel(/^Height/).fill("300");
await panel.getByLabel(/^Resolution/).fill("192");
await panel.getByRole("button", { name: "Options" }).click();
await page.getByRole("dialog", { name: "Export options" }).getByLabel("Transparent background").check();
await page.keyboard.press("Escape");
const png = await save(() => panel.getByRole("button", { name: "Download" }).click());
const info = parsePng(png.buf);
expect("transparent PNG has the requested pixel size", info.width === 800 && info.height === 600,
  `${info.width} × ${info.height}`);
expect("transparent PNG is RGBA", info.colorType === 6, `colour type ${info.colorType}`);
expect("transparent PNG has alpha at the corner pixel", info.firstAlpha < 255,
  `alpha ${info.firstAlpha}`);
expect("PNG carries its DPI (pHYs)", Math.round((info.ppm ?? 0) * 0.0254) === 192,
  `${info.ppm} px/m`);
// put the setting back for anything that follows
await panel.getByRole("button", { name: "Options" }).click();
const opts = page.getByRole("dialog", { name: "Export options" });
await opts.getByLabel("Transparent background").uncheck();

// --- every graph of the project as a zip of PNGs ---
const zip = await save(() => opts.getByRole("button", { name: /Export all \d+ graphs/ }).click());
const entries = unzipSync(new Uint8Array(zip.buf));
const names = Object.keys(entries).sort();
expect("export all graphs: one PNG per graph in a zip",
  names.length === 2 && names.every((n) => n.endsWith(".png"))
  && names.every((n) => parsePng(Buffer.from(entries[n])).width === 800),
  `${zip.name}: ${names.join(", ")}`);
await page.keyboard.press("Escape");

// --- methods text: version stamp and citation ---
const methods = await page.locator(".methods-text").first().textContent();
expect("methods text carries the version stamp", /OpenDose version \S+/.test(methods));
expect("methods text names the numerical libraries with versions",
  /SciPy \d+\.\d+[\d.]* and NumPy \d+\.\d+/.test(methods));
expect("methods text has a citation block", methods.includes("How to cite OpenDose"));
await page.getByRole("button", { name: /About OpenDose/ }).click();
expect("info popover has How to cite",
  await page.locator(".info-pop").getByText("How to cite OpenDose").count() === 1);
await page.keyboard.press("Escape");

// --- layout with the sample project's graphs ---
await page.getByRole("button", { name: "New layout" }).click();
await page.waitForSelector(".layout-page", { timeout: 10000 });
await page.getByRole("button", { name: "Fill with graphs" }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".layout-graph .plot.js-plotly-plot").length >= 2,
  { timeout: 60000 },
);
const graphs = await page.locator(".layout-item.kind-graph:not(.is-empty)").count();
expect("layout holds two live graphs", graphs === 2, String(graphs));
const letters = await page.locator(".layout-letters text").allTextContents();
expect("panels lettered A, B", letters.join(",") === "A,B", letters.join(","));

// master legend collects both graphs' series
await page.getByRole("button", { name: "+ Master legend" }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".kind-legend text").length >= 2, { timeout: 10000 });
const legendText = await page.locator(".kind-legend text").allTextContents();
console.log("master legend:", legendText.join(" | "));
expect("master legend lists series of both graphs", legendText.length >= 3, String(legendText.length));

// keyboard nudge of the first graph: 1 mm right
const first = page.locator(".layout-item.kind-graph").first();
await first.focus();
const left = page.getByLabel("Left (mm)");
const before = Number(await left.inputValue());
await first.press("ArrowRight");
expect("arrow key nudges the selected item by 1 mm",
  Math.abs(Number(await left.inputValue()) - before - 1) < 0.01);
await page.keyboard.press("Control+z");

// export the page as PNG at 150 dpi: A4 = 1240 × 1753 px
const exportBar = page.getByRole("group", { name: "Export page" });
await exportBar.getByLabel("Page export format").selectOption("png");
await exportBar.getByLabel(/Page export resolution/).fill("150");
const pagePng = await save(() => exportBar.getByRole("button", { name: "Export page" }).click());
const pi = parsePng(pagePng.buf);
expect("layout PNG is A4 at 150 dpi", pi.width === 1240 && pi.height === 1753,
  `${pi.width} × ${pi.height}, ${pagePng.name}`);
expect("layout PNG carries 150 dpi", Math.round((pi.ppm ?? 0) * 0.0254) === 150);

await exportBar.getByLabel("Page export format").selectOption("pdf");
const pagePdf = await save(() => exportBar.getByRole("button", { name: "Export page" }).click());
expect("layout PDF starts with %PDF", pagePdf.buf.subarray(0, 5).toString("latin1") === "%PDF-",
  `${(pagePdf.buf.length / 1024).toFixed(0)} KB`);
const mediaBox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pagePdf.buf.toString("latin1"));
expect("layout PDF page is A4 (595 × 842 pt)", !!mediaBox
  && Math.abs(Number(mediaBox[1]) - 595.28) < 1 && Math.abs(Number(mediaBox[2]) - 841.89) < 1,
  mediaBox ? `${mediaBox[1]} × ${mediaBox[2]}` : "no MediaBox");

await exportBar.getByLabel("Page export format").selectOption("svg");
const pageSvg = await save(() => exportBar.getByRole("button", { name: "Export page" }).click());
const svgText = pageSvg.buf.toString("utf8");
expect("layout SVG embeds both graphs as vector",
  (svgText.match(/class="main-svg"/g) ?? []).length >= 2 && svgText.startsWith("<svg"));
await exportBar.getByLabel("Page export format").selectOption("png");

// rearrange into 2 × 2: the two graphs stay, two empty placeholders appear
await page.getByRole("button", { name: "Arrange as 2 rows by 2 columns" }).click();
expect("2 × 2 arrangement keeps both graphs and adds placeholders",
  await page.locator(".layout-item.kind-graph").count() === 4
  && await page.locator(".layout-item.kind-graph:not(.is-empty)").count() === 2);

// unlinked picture from the first graph
await page.locator(".layout-item.kind-graph:not(.is-empty)").first().click();
await page.getByRole("button", { name: "Make unlinked picture" }).click();
await page.waitForSelector(".layout-item.kind-picture img", { timeout: 10000 });
expect("graph turned into an unlinked picture",
  await page.locator(".layout-item.kind-picture").count() === 1);

// duplicate the layout
await page.getByRole("button", { name: "Duplicate layout" }).click();
await page.waitForTimeout(300);
expect("layout duplicated",
  await page.locator(".nav-item[data-key^='layout:']").count() === 2);

await page.screenshot({ path: join(here, "layout.png") });
console.log("files in", tmp);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("export + layout e2e OK");
