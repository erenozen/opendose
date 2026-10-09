// End-to-end check for page layouts and image export: builds a layout
// from the sample project's graphs and exports it, exports a graph as a
// vector PDF and as a transparent PNG, and checks the files byte by byte
// (PNG header, pHYs resolution, alpha at a corner; PDF signature and
// text kept as text). Also checks the citation and version stamp, the
// PowerPoint export (a slide per graph, SVG picture with PNG fallback,
// legend in the notes) and "Copy for Word" / "Copy graph" on the clipboard.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";

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
// Clipboard permissions: "Copy for Word" and "Copy graph" are read back.
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
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

// --- every graph to PowerPoint: one slide per graph sheet, each graph an
// SVG picture (svgBlip) with a PNG fallback, the figure legend in the notes
const graphSheets = await page.locator(".nav-item[data-key^='graph:']").count();
const legendShown = ((await page.locator(".figure-legend-text").first().textContent()) ?? "").trim();
await page.getByRole("button", { name: "More ways to save and share" }).click();
await page.getByRole("menuitem", { name: "Export graphs to PowerPoint (.pptx)…" }).click();
const pptDlg = page.getByRole("dialog", { name: "Export graphs to PowerPoint" });
await pptDlg.waitFor({ timeout: 10000 });
expect("PowerPoint dialog explains how to edit a graph (Convert to Shape)",
  (await pptDlg.innerText()).includes("Convert to Shape"));
await page.addScriptTag({ path: createRequire(import.meta.url).resolve("axe-core/axe.min.js") })
  .catch(() => {});
const axePptx = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const r = await axe.run(document.querySelector("dialog[open]"),
    { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  return r.violations.flatMap((x) => x.nodes.map((n) => `${x.id}: ${n.html.slice(0, 90)}`));
});
expect("axe-core: no WCAG A/AA violations in the PowerPoint dialog", axePptx.length === 0, axePptx.join(" | "));
await pptDlg.getByRole("radio", { name: /^Every graph/ }).check();
const pptx = await save(() => pptDlg.getByRole("button", { name: "Export .pptx" }).click());
const parts = unzipSync(new Uint8Array(pptx.buf));
const slides = Object.keys(parts).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
expect("pptx has one slide per graph sheet", graphSheets === 2 && slides.length === graphSheets,
  `${pptx.name}: ${slides.length} slides, ${graphSheets} graph sheets`);
const xmlText = (n) => strFromU8(parts[n] ?? new Uint8Array());
const types = xmlText("[Content_Types].xml");
const slide1 = xmlText("ppt/slides/slide1.xml");
const rels1 = xmlText("ppt/slides/_rels/slide1.xml.rels");
expect("pptx slide 1 references an SVG part of type image/svg+xml",
  /Id="rId3"[^>]*Target="\.\.\/media\/image1\.svg"/.test(rels1)
  && types.includes('<Default Extension="svg" ContentType="image/svg+xml"/>')
  && xmlText("ppt/media/image1.svg").includes("<svg"));
expect("pptx slide 1 picture is an svgBlip with a PNG fallback",
  /<a:blip r:embed="rId2">/.test(slide1) && /<asvg:svgBlip [^>]*r:embed="rId3"\/>/.test(slide1)
  && parts["ppt/media/image1.png"]?.[0] === 0x89);
expect("pptx slide 1 is titled with the graph sheet's name", slide1.includes("<a:t>Graph of Dose response</a:t>"));
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const notes1 = unxml(xmlText("ppt/notesSlides/notesSlide1.xml"));
expect("pptx notes of slide 1 hold the figure legend", legendShown.length > 40 && notes1.includes(legendShown),
  legendShown.slice(0, 80));

// --- "Copy for Word": an HTML table (and plain text) on the clipboard
const firstShown = await page.locator(".results-export-wrap").first().evaluate((root) => {
  for (const td of root.querySelectorAll("table tbody td")) {
    const t = td.innerText.replace(/\s+/g, " ").trim();
    if (/^[<>]?\s?[−-]?\d[\d.,]*(e[−+-]?\d+)?$/.test(t)) return t;
  }
  return "";
});
await page.getByRole("group", { name: "Export these results" }).first()
  .getByRole("button", { name: "Copy for Word" }).click();
await page.waitForTimeout(300);
const clip = await page.evaluate(async () => {
  const out = {};
  for (const it of await navigator.clipboard.read()) {
    for (const t of it.types) out[t] = await (await it.getType(t)).text();
  }
  return out;
});
const html = clip["text/html"] ?? "";
expect("Copy for Word puts an HTML table with a header row on the clipboard",
  html.includes("<table") && html.includes("<thead>") && html.includes("border-collapse"),
  `${html.length} characters`);
expect("the HTML table holds the first number shown", !!firstShown && html.includes(`>${firstShown.replace(/</g, "&lt;")}<`),
  firstShown);
expect("Copy for Word also puts plain text on the clipboard",
  (clip["text/plain"] ?? "").includes(firstShown) && (clip["text/plain"] ?? "").includes("\t"));

// --- "Copy graph for Word or PowerPoint": a PNG picture on the clipboard
await panel.getByRole("button", { name: "Copy graph for Word or PowerPoint" }).click();
await panel.getByRole("status").filter({ hasText: /^Copied as PNG/ }).waitFor({ timeout: 30000 });
const imgTypes = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
expect("Copy graph puts a PNG on the clipboard", imgTypes.includes("image/png"), imgTypes.join(", "));

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

// --- the layout as a PowerPoint slide at its own page size
await page.getByRole("treeitem", { name: "Layout 1", exact: true }).first()
  .locator(":scope > .nav-row").click({ button: "right" });
await page.getByRole("menuitem", { name: "Export to PowerPoint (.pptx)…" }).click();
const layDlg = page.getByRole("dialog", { name: "Export graphs to PowerPoint" });
await layDlg.waitFor({ timeout: 10000 });
expect("PowerPoint dialog from a layout offers this layout",
  await layDlg.getByRole("radio", { name: "This layout: “Layout 1”" }).isChecked());
const layPptx = await save(() => layDlg.getByRole("button", { name: "Export .pptx" }).click());
const lp = unzipSync(new Uint8Array(layPptx.buf));
const lpText = (n) => strFromU8(lp[n] ?? new Uint8Array());
expect("layout pptx: one A4 slide (210 × 297 mm in EMU)",
  /<p:sldSz cx="7560000" cy="10692000"\/>/.test(lpText("ppt/presentation.xml"))
  && Object.keys(lp).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === 1,
  layPptx.name);
expect("layout pptx: the page is an SVG picture holding both graphs",
  /<asvg:svgBlip /.test(lpText("ppt/slides/slide1.xml"))
  && (lpText("ppt/media/image1.svg").match(/class="main-svg"/g) ?? []).length >= 2);
expect("layout pptx notes give each panel's legend by letter",
  /\(A\) .+\(B\) /s.test(unxml(lpText("ppt/notesSlides/notesSlide1.xml"))));

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
