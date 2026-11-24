// End-to-end check for page layouts and image export: builds a layout
// from the sample project's graphs and exports it, exports a graph as a
// vector PDF and as a transparent PNG, and checks the files byte by byte
// (PNG header, pHYs resolution, alpha at a corner; PDF signature and
// text kept as text). Also checks the citation and version stamp, the
// PowerPoint export (a slide per graph, SVG picture with PNG fallback,
// legend in the notes), "Copy for Word" / "Copy graph" on the clipboard, and
// a layout's source data workbook, a sheet per panel letter (P-65).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { strFromU8, unzipSync } from "fflate";
import { readXlsx } from "./xlsx-read.mjs";

// The header's File and View menus (DECISIONS 5): open one, pick an item.
const fileMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "File", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};
const viewMenu = async (p, item) => {
  await p.locator("header").getByRole("button", { name: "View", exact: true }).click();
  await p.getByRole("menuitem", { name: item }).click();
};

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

// --- PDF reading: the text each Tj shows, through the fonts' ToUnicode
// maps (Identity-H fonts) or as Latin-1 (standard fonts), with the font's
// /W advance widths. Enough for jsPDF's output; pypdf reads the same file
// as a second, independent reader.
function readPdf(buf) {
  const src = buf.toString("latin1");
  const objs = new Map();
  for (const m of src.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    let body = m[2];
    const s = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(body);
    let stream = null;
    if (s) {
      const raw = Buffer.from(s[1], "latin1");
      stream = /\/FlateDecode/.test(body) ? inflateSync(raw).toString("latin1") : s[1];
      body = body.slice(0, s.index);
    }
    objs.set(Number(m[1]), { body, stream });
  }
  const ref = (body, key) => Number(new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(body)?.[1]);
  const fonts = new Map();
  for (const [, o] of objs) {
    for (const f of o.body.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)) {
      const font = objs.get(Number(f[2]));
      if (!font || !/\/Type\s*\/Font/.test(font.body)) continue;
      const entry = { base: /\/BaseFont\s*\/([^\s/>]+)/.exec(font.body)?.[1] ?? "", map: null, widths: new Map() };
      const tu = objs.get(ref(font.body, "ToUnicode"));
      if (tu?.stream) {
        entry.map = new Map();
        const hex = (h) => String.fromCodePoint(...(h.match(/.{4}/g) ?? []).map((x) => parseInt(x, 16)));
        for (const blk of tu.stream.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
          for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) entry.map.set(parseInt(p[1], 16), hex(p[2]));
        }
        for (const blk of tu.stream.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
          for (const p of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
            const a = parseInt(p[1], 16), b = parseInt(p[2], 16), c = parseInt(p[3], 16);
            for (let k = a; k <= b; k++) entry.map.set(k, String.fromCodePoint(c + k - a));
          }
        }
        const desc = objs.get(Number(/\/DescendantFonts\s*\[\s*(\d+) 0 R/.exec(font.body)?.[1]));
        const w = /\/W\s*\[([\s\S]*?)\]\s*(\/|>>)/.exec(desc?.body ?? "")?.[1] ?? "";
        for (const g of w.matchAll(/(\d+)\s*\[([^\]]*)\]/g)) {
          g[2].trim().split(/\s+/).forEach((v, i) => entry.widths.set(Number(g[1]) + i, Number(v)));
        }
        entry.fontFile2 = /\/FontFile2/.test(objs.get(ref(desc?.body ?? "", "FontDescriptor"))?.body ?? "");
      }
      fonts.set(f[1], entry);
    }
  }
  const runs = [];
  for (const [, o] of objs) {
    if (!o.stream || !/Tf/.test(o.stream)) continue;
    let font = null, size = 0;
    for (const t of o.stream.matchAll(/\/(F\d+)\s+([\d.]+)\s+Tf|<([0-9a-fA-F]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      if (t[1]) { font = fonts.get(t[1]); size = Number(t[2]); continue; }
      if (t[3] !== undefined && font?.map) {
        const codes = (t[3].match(/.{4}/g) ?? []).map((x) => parseInt(x, 16));
        runs.push({ text: codes.map((c) => font.map.get(c) ?? "�").join(""), font: font.base, size,
          em: codes.reduce((a, c) => a + (font.widths.get(c) ?? 0), 0) / 1000 });
      } else if (t[4] !== undefined) {
        runs.push({ text: t[4].replace(/\\(.)/g, "$1"), font: font?.base ?? "", size, em: NaN });
      }
    }
  }
  return { runs, fonts: [...fonts.values()] };
}

// --- PDF geometry: each text run's font size and each stroke's width as
// printed, in pt: the Tf size (or line width w) times the scale of the
// text and graphics matrices in force (cm, Tm, q/Q), as a PDF reader
// draws them. Enough of the content-stream language for jsPDF's output.
function pdfGeometry(buf) {
  const src = buf.toString("latin1");
  const out = { texts: [], strokes: [] };
  const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  const scale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  for (const m of src.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const s = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(m[2]);
    if (!s) continue;
    const raw = Buffer.from(s[1], "latin1");
    let text;
    try { text = /\/FlateDecode/.test(m[2].slice(0, s.index)) ? inflateSync(raw).toString("latin1") : s[1]; } catch { continue; }
    // the page content streams (as readPdf reads them, so text runs align)
    if (!/Tf/.test(text)) continue;
    let ctm = [1, 0, 0, 1, 0, 0], tm = [1, 0, 0, 1, 0, 0], tf = 0, w = 1;
    const stack = [];
    const nums = [];
    for (const t of text.matchAll(/<[0-9a-fA-F]*>|\((?:\\.|[^\\)])*\)|\[[^\]]*\]|\/[^\s/<>[\]()]+|-?\d*\.?\d+(?:e-?\d+)?|[A-Za-z'"*]+/g)) {
      const tok = t[0];
      if (/^-?\d*\.?\d+/.test(tok)) { nums.push(Number(tok)); continue; }
      if (tok[0] === "/" || tok[0] === "[" || tok[0] === "<" || tok[0] === "(") {
        if (tok[0] === "<" || tok[0] === "(") {
          // x: where the run starts on the page, in pt (P-104 reads the order of tick labels)
          out.texts.push({ size: tf * scale(mul(tm, ctm)), raw: tok, x: mul(tm, ctm)[4] });
        }
        if (tok[0] !== "/") nums.length = 0;
        continue;
      }
      const a = nums.splice(0);
      switch (tok) {
        case "q": stack.push([ctm, w]); break;
        case "Q": [ctm, w] = stack.pop() ?? [ctm, w]; break;
        case "cm": ctm = mul(a.slice(-6), ctm); break;
        case "BT": tm = [1, 0, 0, 1, 0, 0]; break;
        case "Tm": tm = a.slice(-6); break;
        case "Td": case "TD": tm = mul([1, 0, 0, 1, a[a.length - 2], a[a.length - 1]], tm); break;
        case "Tf": tf = a[a.length - 1]; break;
        case "w": w = a[a.length - 1]; break;
        case "S": case "s": case "B": case "b": case "B*": case "b*":
          out.strokes.push(w * scale(ctm)); break;
        default: break;
      }
    }
  }
  return out;
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 180000 });
await page.waitForSelector(".plot-card .plot.js-plotly-plot", { timeout: 30000 });
const panel = page.locator(".plot-card .export-panel");

// --- PNG at 300 dpi in the plot font (P-03): an SVG drawn as an image
// cannot use the page's web fonts, so on a machine without Inter (this
// one: the fallback is Noto Sans) the raster used a system font. The X
// title in the PNG is compared, pixel for pixel, with two references
// drawn the same way (the title element of the SVG export at the same
// size, in an SVG image at the same scale): one with the page's Inter
// woff2 inlined, one without (the fallback). Its ink width must equal the
// Inter reference's within 1 px, and its pixels the reference's.
{
  const size = await page.evaluate(() => {
    const full = document.querySelector(".plot-card .plot.js-plotly-plot")._fullLayout;
    return { w: Math.round(full.width), hh: Math.round(full.height) };
  });
  await panel.getByLabel("Export format").selectOption("svg");
  await panel.getByLabel(/^Width/).fill(String(size.w));
  await panel.getByLabel(/^Height/).fill(String(size.hh));
  const vec = await save(() => panel.getByRole("button", { name: "Download" }).click());
  const ref = await page.evaluate(({ svg, size }) => {
    const host = document.createElement("div");
    host.innerHTML = svg;
    document.body.append(host);
    const t = host.querySelector(".xtitle");
    const box = t.getBoundingClientRect(), root = host.querySelector("svg").getBoundingClientRect();
    const m = t.getCTM();
    const out = { ...size, text: t.textContent, top: box.top - root.top, h: box.height,
      el: `<g transform="matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})">${t.outerHTML}</g>`,
      font: getComputedStyle(t).fontFamily };
    host.remove();
    return out;
  }, { svg: vec.buf.toString("utf8"), size });
  await panel.getByLabel("Export format").selectOption("png");
  await panel.getByLabel(/^Resolution/).fill("300");
  const png = await save(() => panel.getByRole("button", { name: "Download" }).click());
  const s = 300 / 96;
  const m = await page.evaluate(async ({ b64, r, s }) => {
    const y0 = Math.max(0, Math.floor((r.top - 2) * s));
    const y1 = Math.min(Math.floor(r.hh * s), Math.ceil((r.top + r.h + 2) * s));
    const band = async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = Math.floor(r.w * s); c.height = Math.floor(r.hh * s);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, y0, c.width, y1 - y0).data;
      const ink = new Uint8Array(d.length / 4);
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < ink.length; i++) {
        ink[i] = d[4 * i + 3] > 128 && 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2] < 160 ? 1 : 0;
        if (ink[i]) { const x = i % c.width; lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
      return { ink, width: hi - lo + 1 };
    };
    // the page's @font-face files for the title's font, inlined (the reference with the font present)
    const fam = r.font.split(",")[0].trim().replace(/^["']|["']$/g, "");
    const faces = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSFontFaceRule) || rule.style.getPropertyValue("font-family").replace(/["']/g, "") !== fam
          || rule.style.getPropertyValue("font-style") === "italic") continue;
        const u = /url\(\s*["']?([^"')]+)/.exec(rule.style.getPropertyValue("src"))[1];
        const b = new Uint8Array(await (await fetch(new URL(u, sheet.href ?? document.baseURI))).arrayBuffer());
        let bin = "";
        for (let k = 0; k < b.length; k += 0x8000) bin += String.fromCharCode(...b.subarray(k, k + 0x8000));
        faces.push(`@font-face{font-family:"${fam}";font-weight:${rule.style.getPropertyValue("font-weight")};`
          + `src:url(data:font/woff2;base64,${btoa(bin)});unicode-range:${rule.style.getPropertyValue("unicode-range")}}`);
      }
    }
    const svgOf = (css) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${r.w}" height="${r.hh}"><style>${css}</style>${r.el}</svg>`)}`;
    const got = await band(URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))],
      { type: "image/png" })));
    const inter = await band(svgOf(faces.join("")));
    const fallback = await band(svgOf(""));
    // share of ink pixels in common (intersection over union), in place
    const iou = (a, b) => {
      let both = 0, either = 0;
      for (let i = 0; i < a.ink.length; i++) { both += a.ink[i] & b.ink[i]; either += a.ink[i] | b.ink[i]; }
      return either ? both / either : 0;
    };
    return { got: got.width, inter: inter.width, fallback: fallback.width, faces: faces.length,
      iouInter: iou(got, inter), iouFallback: iou(got, fallback) };
  }, { b64: png.buf.toString("base64"), r: ref, s });
  console.log(`PNG 300 dpi: "${ref.text}": title ink ${m.got} px wide; reference in Inter ${m.inter} px `
    + `(${m.faces} font files), in the fallback ${m.fallback} px; pixel overlap with Inter ${m.iouInter.toFixed(3)}, `
    + `with the fallback ${m.iouFallback.toFixed(3)}`);
  expect(`PNG at 300 dpi: X title ink width ${m.got} px equals the Inter reference ${m.inter} px within 1 px`,
    m.faces > 0 && Math.abs(m.got - m.inter) <= 1);
  expect(`PNG at 300 dpi sets the X title in Inter, not the fallback: pixel overlap ${m.iouInter.toFixed(3)} >= 0.98`,
    m.iouInter >= 0.98, `overlap with the fallback ${m.iouFallback.toFixed(3)}`);
  await panel.getByLabel(/^Resolution/).fill("96");
}


// --- graph as vector PDF, with axis titles the standard fonts cannot
// spell (P-02): embedded Inter, ToUnicode, the text exactly as typed ---
const Y_TITLE = "ΔF/F₀ ≤ 1", X_TITLE = "Ca²⁺ (10⁻⁶ M)";
await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
const gset = page.getByRole("dialog", { name: "Graph settings" });
await gset.getByLabel("X axis title").fill(X_TITLE);
await gset.getByLabel("Y axis title").fill(Y_TITLE);
await page.keyboard.press("Escape");
await page.waitForFunction(([x, y]) => {
  const t = [...document.querySelectorAll(".plot-card .plot .xtitle, .plot-card .plot .ytitle")].map((e) => e.textContent);
  return t.includes(x) && t.includes(y);
}, [X_TITLE, Y_TITLE], { timeout: 15000 });
// SVG widths in em of labels the page's Inter web font fully covers (its
// subsets lack ⁺, ₀ and ≤, which the screen takes from a fallback), set
// at 1000 px so pixel rounding of each advance does not count
const WIDTH_LABELS = ["Drug A", "100", "−9"];
const screenEm = await page.evaluate((labels) => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.style.cssText = "position:absolute;visibility:hidden";
  document.body.append(svg);
  const out = Object.fromEntries(labels.map((l) => {
    const el = [...document.querySelectorAll(".plot-card .plot text")].find((t) => t.textContent === l);
    if (!el) return [l, NaN];
    const t = document.createElementNS(ns, "text");
    t.setAttribute("style", `font-family: ${getComputedStyle(el).fontFamily}; font-size: 1000px; font-kerning: none`);
    t.textContent = l;
    svg.append(t);
    return [l, t.getComputedTextLength() / 1000];
  }));
  svg.remove();
  return out;
}, WIDTH_LABELS);
await panel.getByLabel("Export format").selectOption("pdf");
const pdf = await save(() => panel.getByRole("button", { name: "Download" }).click());
const pdfText = pdf.buf.toString("latin1");
expect("graph PDF starts with %PDF", pdf.buf.subarray(0, 5).toString("latin1") === "%PDF-",
  `${pdf.name}, ${(pdf.buf.length / 1024).toFixed(0)} KB`);
expect("graph PDF file named after the sheet", pdf.name === "graph-of-dose-response.pdf", pdf.name);
const rd = readPdf(pdf.buf);
const usedFonts = new Set(rd.runs.map((r) => r.font));
const inter = rd.fonts.filter((f) => usedFonts.has(f.base));
expect("graph PDF sets its text in embedded Inter (/FontFile2) with a ToUnicode map",
  inter.length > 0 && inter.every((f) => /^Inter-/.test(f.base) && f.fontFile2 && f.map?.size > 0)
  && /\/FontFile2/.test(pdfText) && /\/ToUnicode/.test(pdfText) && /\/CIDFontType2/.test(pdfText),
  rd.fonts.map((f) => f.base).join(", "));
expect("graph PDF no longer sets the default theme's text in Helvetica (was /BaseFont /Helvetica)",
  !rd.runs.some((r) => /Helvetica/.test(r.font)), [...new Set(rd.runs.map((r) => r.font))].join(", "));
const runText = rd.runs.map((r) => r.text);
expect("graph PDF text reads back exactly as typed: ΔF/F₀ ≤ 1 and Ca²⁺ (10⁻⁶ M)",
  runText.includes(Y_TITLE) && runText.includes(X_TITLE), JSON.stringify(runText.slice(0, 30)));
// every label of the SVG export is in the PDF, character for character
await panel.getByLabel("Export format").selectOption("svg");
const gsvg = await save(() => panel.getByRole("button", { name: "Download" }).click());
const svgLabels = await page.evaluate((s) => [...new DOMParser().parseFromString(s, "image/svg+xml")
  .querySelectorAll("text")].map((t) => t.textContent.trim()).filter(Boolean), gsvg.buf.toString("utf8"));
const joined = runText.join("\n");
const missing = svgLabels.filter((l) => !joined.includes(l) && !runText.join("").includes(l));
expect(`graph PDF holds every label of the SVG export (${svgLabels.length} labels)`,
  svgLabels.length > 10 && missing.length === 0, missing.slice(0, 5).join(" | "));
// advance widths: the PDF's /W widths against the screen's own measure
for (const label of WIDTH_LABELS) {
  const run = rd.runs.find((r) => r.text === label);
  const ratio = run ? run.em / screenEm[label] : NaN;
  expect(`"${label}": PDF advance widths match the SVG text in the page's Inter within 0.5% (no kerning)`,
    Math.abs(ratio - 1) < 0.005, `PDF ${run?.em.toFixed(4)} em, screen ${screenEm[label]?.toFixed(4)} em`);
}
// a second reader: pypdf (PYTHON names an interpreter that has it)
{
  const py = process.env.PYTHON ?? "python3";
  const r = spawnSync(py, ["-c", "import sys, pypdf; print(pypdf.PdfReader(sys.argv[1]).pages[0].extract_text())",
    pdf.file], { encoding: "utf8" });
  if (r.status !== 0 && /No module named .pypdf/.test(r.stderr)) {
    console.log(`skip pypdf is not installed for ${py}: set PYTHON to an interpreter that has it`);
  } else {
    expect("pypdf extracts both titles from the graph PDF", r.stdout.includes(Y_TITLE) && r.stdout.includes(X_TITLE),
      (r.stdout || r.stderr).replace(/\s+/g, " ").slice(0, 200));
  }
}
console.log(`graph PDF size ${(pdf.buf.length / 1024).toFixed(1)} KB`);

// --- sizes in points at the exported size (P-54): axis lines 1 pt and
// tick labels 7 pt, exported as a PDF 89 mm wide: every stroke of an
// axis line prints 1 pt wide and every tick label at Tf 7 (Tf times the
// matrices in force). Stored as px at 96 to the inch: 4/3 and 28/3.
{
  const fmtDlg = page.locator("dialog.fmt-dialog");
  const settings = async () => {
    await page.locator(".plot-card").getByRole("button", { name: "Settings" }).click();
    return page.getByRole("dialog", { name: "Graph settings" });
  };
  await (await settings()).getByRole("button", { name: "Format axes…" }).click();
  await fmtDlg.getByLabel("Points (pt, 1/72 inch").check();
  await fmtDlg.getByLabel("Axis line width (pt)").fill("1");
  await fmtDlg.getByRole("tab", { name: "X axis" }).click();
  await fmtDlg.getByLabel("Axis line width (pt)").fill("1");
  await fmtDlg.getByRole("button", { name: "Apply and close" }).click();
  await (await settings()).getByRole("button", { name: "Format graph…" }).click();
  expect("Format graph remembers the unit: sizes in pt", await fmtDlg.getByLabel("Points (pt, 1/72 inch").isChecked());
  await fmtDlg.getByRole("tab", { name: "Whole graph" }).click();
  await fmtDlg.getByLabel("Axis number size (pt)").fill("7");
  await fmtDlg.getByRole("button", { name: "Apply and close" }).click();
  await page.waitForFunction(() => {
    const l = document.querySelector(".plot-card .plot")?.layout;
    return l?.yaxis?.linewidth > 1.3 && l?.xaxis?.tickfont?.size > 9;
  }, null, { timeout: 15000 }).catch(() => {});
  const lay = await page.evaluate(() => {
    const l = document.querySelector(".plot-card .plot").layout;
    return { xw: l.xaxis.linewidth, yw: l.yaxis.linewidth, ytw: l.yaxis.tickwidth, xs: l.xaxis.tickfont?.size,
      ys: l.yaxis.tickfont?.size, ticks: [...document.querySelectorAll(".plot-card .plot .ytick text, .plot-card .plot .xtick text")]
        .map((t) => t.textContent) };
  });
  expect("1 pt axis lines and 7 pt tick labels are stored as 4/3 px and 28/3 px (96 per inch)",
    lay.xw === 4 / 3 && lay.yw === 4 / 3 && lay.ytw === 4 / 3 && lay.xs === 28 / 3 && lay.ys === 28 / 3,
    JSON.stringify(lay));
  await panel.getByRole("button", { name: "Options" }).click();
  await page.getByRole("dialog", { name: "Export options" }).getByLabel("Millimetres").check();
  await page.keyboard.press("Escape");
  await panel.getByLabel("Export format").selectOption("pdf");
  await panel.getByLabel(/^Width/).fill("89");
  const ptPdf = await save(() => panel.getByRole("button", { name: "Download" }).click());
  const geo = pdfGeometry(ptPdf.buf);
  const runs = readPdf(ptPdf.buf).runs;
  // the tick labels, in the order the PDF draws its text (runs and texts align)
  expect("PDF geometry reads the same text runs as the text reader", geo.texts.length === runs.length,
    `${geo.texts.length} vs ${runs.length}`);
  const sizes = geo.texts.map((t) => Math.round(t.size * 1000) / 1000);
  const tickSizes = runs.map((r, i) => (lay.ticks.includes(r.text) ? sizes[i] : null)).filter((v) => v !== null);
  expect(`PDF at 89 mm: every tick label is set at 7 pt (${tickSizes.length} labels)`,
    tickSizes.length >= 6 && tickSizes.every((s) => Math.abs(s - 7) < 1e-3), JSON.stringify(tickSizes));
  const widths = geo.strokes.map((w) => Math.round(w * 1000) / 1000);
  const onePt = widths.filter((w) => Math.abs(w - 1) < 1e-3).length;
  expect("PDF at 89 mm: the axis lines and their ticks are stroked 1 pt wide",
    onePt >= 2 + tickSizes.length, `${onePt} strokes of 1 pt; widths ${[...new Set(widths)].join(", ")}`);
  const page1 = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\]/.exec(ptPdf.buf.toString("latin1"));
  expect("the PDF page is 89 mm wide (252.28 pt)", page1 && Math.abs(Number(page1[1]) - 89 / 25.4 * 72) < 0.05,
    page1?.[1]);
  // back to the earlier settings for the steps below
  await panel.getByRole("button", { name: "Options" }).click();
  await page.getByRole("dialog", { name: "Export options" }).getByLabel("Pixels (96 per inch)").check();
  await page.keyboard.press("Escape");
  for (let i = 0; i < 2; i++) await page.locator("header").getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(() => !document.querySelector(".plot-card .plot")?.layout?.yaxis?.linewidth
    || document.querySelector(".plot-card .plot").layout.yaxis.linewidth !== 4 / 3, null, { timeout: 15000 })
    .catch(() => {});
  await page.evaluate(() => localStorage.removeItem("opendose-size-unit"));
}

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
const graphSheets = await page.locator(".nav-item[data-kind='graph']").count();
const legendShown = ((await page.locator(".figure-legend-text").first().textContent()) ?? "").trim();
await page.locator("header").getByRole("button", { name: "File", exact: true }).click();
await page.getByRole("menuitem", { name: "Export graphs to PowerPoint (.pptx)…" }).click();
const pptDlg = page.getByRole("dialog", { name: "Export graphs to PowerPoint" });
await pptDlg.waitFor({ timeout: 10000 });
expect("PowerPoint dialog explains how to edit a graph (Convert to Shape)",
  (await pptDlg.innerText()).includes("Convert to Shape"));
await page.evaluate(readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8"))
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
// The button says it worked (its label swaps to "Copied", DECISIONS 6)
// and the outcome is spoken once through the app's live region.
const copyGraph = panel.getByRole("button", { name: "Copy graph for Word or PowerPoint" });
await copyGraph.click();
await copyGraph.getByText("Copied", { exact: true }).waitFor({ timeout: 30000 });
await page.locator("[data-announcer] [role=status] > p").filter({ hasText: /^Copied as PNG/ }).first()
  .waitFor({ state: "attached", timeout: 5000 });
const imgTypes = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => i.types));
expect("Copy graph puts a PNG on the clipboard", imgTypes.includes("image/png"), imgTypes.join(", "));

// --- methods text: version stamp and citation ---
const methods = await page.locator(".methods-text").first().textContent();
expect("methods text carries the version stamp", /OpenDose version \S+/.test(methods));
expect("methods text names the numerical libraries with versions",
  /SciPy \d+\.\d+[\d.]* and NumPy \d+\.\d+/.test(methods));
expect("methods text has a citation block", methods.includes("How to cite OpenDose"));
await viewMenu(page, "About OpenDose…");
expect("info popover has How to cite",
  await page.locator(".info-pop").getByText("How to cite OpenDose").count() === 1);
await page.keyboard.press("Escape");

// --- layout with the sample project's graphs ---
await fileMenu(page, "New layout");
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
await page.getByRole("group", { name: "Add to page" }).getByRole("button", { name: "Add…" }).click();
await page.getByRole("menuitem", { name: "Master legend" }).click();
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

// --- figure items the export carries: a project opened from a file, each
// graph exported as SVG from its own export panel
const openProject = async (name, sheets) => {
  const file = join(tmp, name);
  writeFileSync(file, JSON.stringify({ version: 2, title: name, prefs: { defaultTableType: "xy",
    errorBars: "sd", ciMethod: "asymptotic", scheme: "default", digits: 4 }, sheets }));
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]', file);
};
const openSheet = async (name) => {
  await page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .nav-row").click();
  await page.waitForSelector('.pane-results[data-live="true"] .results-table', { timeout: 120000 });
};
const graphExport = async (format) => {
  const p = page.locator(".plot-card .export-panel");
  await p.getByLabel("Export format").selectOption(format);
  return save(() => p.getByRole("button", { name: "Download" }).click());
};
const svgTexts = (buf) => page.evaluate((s) => [...new DOMParser().parseFromString(s, "image/svg+xml")
  .querySelectorAll("text")].map((t) => t.textContent.trim()).filter(Boolean), buf.toString("utf8"));

// brackets for the pairs of rows of a contingency table (P-14): the
// Holm-adjusted P of engine/tests/reference/pairwise_proportions.py
// (0.4075, 3.719e-4, 0.008853) as ns, ***, ** above the stacks
{
  const ctTable = { type: "contingency", x: ["", "", ""], xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "",
    rowTitles: ["WT", "Het", "KO"], subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [{ name: "Positive", rows: [["18"], ["15"], ["5"]] }, { name: "Negative", rows: [["2"], ["5"], ["15"]] }] };
  await openProject("contingency-brackets.json", [
    { id: "c1", kind: "data", name: "Genotypes", table: ctTable },
    { id: "c2", kind: "results", parentId: "c1", name: "Chi-square of Genotypes", analysis: "contingency",
      options: { pairwise: "holm" } },
    { id: "c3", kind: "graph", parentId: "c1", resultsId: "c2", graphType: "contingency_stacked_percent",
      name: "Percent of each row", settings: { titles: { x: "", y: "" }, scheme: "default",
        format: { comparisons: { show: true } } } },
  ]);
  await openSheet("Percent of each row");
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.annotations ?? [])
    .filter((a) => a.name === "bracket-label").length === 3, null, { timeout: 30000 }).catch(() => {});
  const texts = await svgTexts((await graphExport("svg")).buf);
  expect("contingency SVG export carries the bracket labels ns, **, *** above the rows WT, Het, KO",
    ["ns", "**", "***", "WT", "Het", "KO"].every((t) => texts.includes(t)), JSON.stringify(texts));
}

// the equivalence margin on the estimation plot (P-12): the t test of the
// family (margin ±1, engine/tests/reference/equivalence_tost.py) gives the
// dashed lines and their labels, carried by the export
{
  const A = ["10.8", "10.75", "10.55", "10.5", "9.6", "9.65", "9.85", "9.9"];
  const eqTable = { type: "column", x: A.map(() => ""), xTitle: "", xFormat: "numbers", xUnit: "", yTitle: "Value",
    rowTitles: A.map(() => ""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [{ name: "A", rows: A.map((v) => [v]) },
      { name: "B", rows: A.map((v) => [String(+(Number(v) - 0.2).toFixed(2))]) }] };
  await openProject("estimation-margins.json", [
    { id: "e1", kind: "data", name: "Equivalence", table: eqTable },
    { id: "e2", kind: "results", parentId: "e1", name: "t test of Equivalence", analysis: "column",
      options: { analysis: "ttest", ttestKind: "unpaired", equivalence: "equivalence", equivalenceMargin: "1" } },
    { id: "e3", kind: "results", parentId: "e1", name: "Estimation of Equivalence", analysis: "estimation", options: {} },
    { id: "e4", kind: "graph", parentId: "e1", resultsId: "e3", graphType: "estimation",
      name: "Estimation plot of Equivalence", settings: { titles: { x: "", y: "" }, scheme: "default" } },
  ]);
  await page.getByRole("treeitem", { name: "Estimation plot of Equivalence", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.layout?.shapes ?? [])
    .some((s) => s.name === "equivalence-margin:upper"), null, { timeout: 180000 }).catch(() => {});
  const svg = (await graphExport("svg")).buf.toString("utf8");
  const texts = await svgTexts(Buffer.from(svg));
  const dashed = (svg.match(/stroke-dasharray/g) ?? []).length;
  // two dotted reference lines of the Gardner-Altman plot and the two margin lines
  expect("estimation SVG export carries the margin labels and the dashed margin lines",
    texts.includes("margin −1") && texts.includes("margin +1") && dashed >= 4, `${JSON.stringify(texts)}; ${dashed} dashed`);
}

// IC50 drop lines and the in-figure legend (P-23, P-24) in the SVG and PDF
// exports, on a plain Y axis and on a broken one (the lines on the upper
// segment). engine/tests/reference/fit_graph.py: IC50 1.040e-7 M.
{
  const FIT_X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7", "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
  const FIT_Y = [["98.2", "101.5", "99.1"], ["97.0", "95.8", "99.9"], ["93.4", "90.1", "92.7"],
    ["78.9", "82.3", "80.0"], ["51.2", "48.7", "50.9"], ["22.1", "25.6", "24.0"],
    ["8.9", "10.2", "7.5"], ["3.1", "4.4", "2.2"], ["1.0", "0.5", "2.1"]];
  const fitTable = { type: "xy", x: FIT_X, xTitle: "[Conc.]", xFormat: "numbers", xUnit: "M", yTitle: "Response",
    rowTitles: FIT_X.map(() => ""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [{ name: "Drug A", subTitles: ["", "", ""], rows: FIT_Y }] };
  const fam = (id, name, format) => [
    { id: `${id}d`, kind: "data", name, table: fitTable },
    { id: `${id}r`, kind: "results", parentId: `${id}d`, name: `Nonlin fit of ${name}`, analysis: "nonlin",
      options: { model: "log_inhibitor_vs_response_4pl", errorBars: "sd", autoFit: "requested" } },
    { id: `${id}g`, kind: "graph", parentId: `${id}d`, resultsId: `${id}r`, graphType: "xy", name: `Graph of ${name}`,
      settings: { titles: { x: "", y: "" }, scheme: "default", xy: { dropLines: true, dropLabel: true, caption: "figure" },
        ...(format ? { format } : {}) } },
  ];
  await openProject("fit-exports.json", [...fam("p", "Plain axis"), ...fam("b", "Broken axis",
    { y: { gap: { from: 15, to: 35 } } })]);
  // the PDF's content streams draw dashed strokes with "[on off] phase d"
  const pdfDashes = (buf) => {
    const src = buf.toString("latin1");
    let n = 0;
    for (const m of src.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
      const s = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(m[2]);
      if (!s) continue;
      let text;
      try {
        const raw = Buffer.from(s[1], "latin1");
        text = /\/FlateDecode/.test(m[2].slice(0, s.index)) ? inflateSync(raw).toString("latin1") : s[1];
      } catch { continue; }
      n += (text.match(/\[\s*[\d.]+(?:\s+[\d.]+)+\s*\]\s+[\d.]+\s+d\b/g) ?? []).length;
    }
    return n;
  };
  for (const [name, split] of [["Graph of Plain axis", false], ["Graph of Broken axis", true]]) {
    await page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .nav-row").click();
    await page.waitForFunction((want) => {
      const l = document.querySelector(".plot-card .plot")?.layout ?? {};
      return (l.shapes ?? []).some((s) => s.name === (want ? "drop:0:v2" : "drop:0:v"))
        && (l.annotations ?? []).some((a) => a.name === "caption");
    }, split, { timeout: 120000 }).catch(() => {});
    const svg = (await graphExport("svg")).buf.toString("utf8");
    const texts = await svgTexts(Buffer.from(svg));
    const dashed = (svg.match(/stroke-dasharray/g) ?? []).length;
    // the caption wraps over lines: compare without white space
    const squash = (t) => t.replace(/\s+/g, "");
    const CAPTION = ["Points show the mean of the replicates", "Dashed lines mark the IC50 (the concentration "
      + "giving a response half-way between the fitted Top and Bottom)."].map(squash);
    const svgAll = squash(texts.join(""));
    expect(`${name}: the SVG export carries the drop lines (${split ? 3 : 2} dashed), the IC50 label and the legend in the figure`,
      dashed >= (split ? 3 : 2) && texts.includes("IC50 = 1.040e-7 M") && CAPTION.every((c) => svgAll.includes(c)),
      `${dashed} dashed; ${JSON.stringify(texts.slice(-6))}`);
    const pdf = (await graphExport("pdf")).buf;
    const runs = readPdf(pdf).runs.map((r) => r.text);
    const pdfAll = squash(runs.join(""));
    expect(`${name}: the PDF export draws the dashed drop lines and holds the IC50 label and the legend text`,
      pdfDashes(pdf) >= (split ? 3 : 2) && runs.includes("IC50 = 1.040e-7 M") && CAPTION.every((c) => pdfAll.includes(c)),
      `${pdfDashes(pdf)} dashed strokes`);
  }
}

// the zero dose left of an X axis break (P-104): in the SVG export the
// vehicle points of both curves and the "0 M" tick sit left of the two
// break marks, the log-dose ticks right of them; the PDF keeps the same
// order of tick labels. Data: engine/tests/reference/zero_dose_plateau.py.
{
  const ZX = ["0", "1e-9", "1e-8", "1e-7", "1e-6", "1e-5", "1e-4"];
  const rows = (r) => r.map((x) => x.map(String));
  const zTable = { type: "xy", x: ZX, xTitle: "[Conc.]", xFormat: "numbers", xUnit: "M", yTitle: "Response",
    rowTitles: ZX.map(() => ""), subcolumnFormat: "replicates", replicateLayout: "side_by_side",
    datasets: [
      { name: "Drug A", subTitles: ["", "", ""], rows: rows([[98.0, 101.0, 103.0], [97.5, 99.0, 100.2],
        [90.1, 92.4, 88.7], [70.2, 66.8, 72.5], [31.0, 35.2, 29.4], [10.4, 12.9, 9.8], [6.1, 4.9, 7.3]]) },
      { name: "Drug B", subTitles: ["", "", ""], rows: rows([[84.0, 88.5, 86.1], [85.2, 82.7, 84.9],
        [83.0, 80.6, 84.4], [76.1, 73.9, 78.0], [58.2, 55.0, 60.3], [30.1, 27.7, 33.6], [14.2, 12.8, 16.5]]) }] };
  await openProject("zero-break-exports.json", [
    { id: "zd", kind: "data", name: "Vehicle export", table: zTable },
    { id: "zr", kind: "results", parentId: "zd", name: "Nonlin fit of Vehicle export", analysis: "nonlin",
      options: { model: "log_inhibitor_vs_response_4pl", errorBars: "sd", autoFit: "requested" } },
    { id: "zg", kind: "graph", parentId: "zd", resultsId: "zr", graphType: "xy", name: "Graph of Vehicle export",
      settings: { titles: { x: "", y: "" }, scheme: "default", format: { x: { zeroBreak: true } } } },
  ]);
  await page.getByRole("treeitem", { name: "Graph of Vehicle export", exact: true }).first()
    .locator(":scope > .nav-row").click();
  await page.waitForFunction(() => (document.querySelector(".plot-card .plot")?.data ?? [])
    .filter((t) => t.xaxis === "x3").length === 2, null, { timeout: 120000 }).catch(() => {});
  const svg = (await graphExport("svg")).buf.toString("utf8");
  // lay the exported SVG out in the page to read where things are drawn
  const geo = await page.evaluate((s) => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0";
    host.innerHTML = s;
    document.body.appendChild(host);
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, w: r.width, h: r.height }; };
    const tick = (t) => [...host.querySelectorAll("text")].filter((e) => e.textContent.trim() === t).map(box)[0] ?? null;
    const marks = [...host.querySelectorAll(".shapelayer path")].map(box)
      .filter((b) => Math.abs(b.w - 8) < 2.5 && Math.abs(b.h - 14) < 2.5);
    const points = [...host.querySelectorAll(".scatterlayer .point")].map(box);
    const out = { zero: tick("0 M"), first: tick("−9"), marks, points };
    host.remove();
    return out;
  }, svg);
  const leftOf = geo.marks.length === 2 ? Math.min(...geo.marks.map((m) => m.x)) : NaN;
  const rightOf = geo.marks.length === 2 ? Math.max(...geo.marks.map((m) => m.x)) : NaN;
  expect("P-104 SVG export: two break marks; the 0 M tick and both vehicle points left of them, the log-dose ticks right",
    !!geo.zero && !!geo.first && geo.marks.length === 2 && geo.zero.x < leftOf && geo.first.x > rightOf
      && geo.points.filter((p) => p.x < leftOf).length === 2 && geo.points.filter((p) => p.x > rightOf).length === 12,
    JSON.stringify({ zero: geo.zero, first: geo.first, marks: geo.marks, n: geo.points.length }));
  const pdf = (await graphExport("pdf")).buf;
  const runs = readPdf(pdf).runs.map((r) => r.text);
  const pg = pdfGeometry(pdf).texts;
  const at = (t) => pg[runs.indexOf(t)]?.x;
  expect("P-104 PDF export: the 0 M tick is drawn left of the log-dose ticks",
    runs.includes("0 M") && runs.includes("−9") && at("0 M") < at("−9"), `${at("0 M")} / ${at("−9")}`);
}

// interpolated unknowns (P-22) and a curve drawn beyond the data (P-52):
// a BCA standard curve (quadratic) with three unknown rows, its curve
// drawn from -500 to 2500 µg/mL. The SVG and PDF exports carry the two
// dotted parts, the three hollow diamonds and the legend sentences.
{
  const bca = JSON.parse(readFileSync(join(here, "..", "e2e-fixtures", "stage", "interpolation.json"), "utf8"));
  const res = bca.sheets.find((x) => x.kind === "results");
  res.options = { ...res.options, curveFrom: "-500", curveTo: "2500" };
  const g = bca.sheets.find((x) => x.kind === "graph");
  g.settings = { ...g.settings, xy: { caption: "figure" } };
  await openProject("fit-unknowns.json", bca.sheets);
  await page.getByRole("treeitem", { name: g.name, exact: true }).first().locator(":scope > .nav-row").click();
  await page.waitForFunction(() => {
    const gd = document.querySelector(".plot-card .plot");
    return (gd?.data ?? []).some((t) => String(t.name ?? "").endsWith("(beyond the data)"))
      && (gd?.data ?? []).some((t) => String(t.name ?? "").endsWith("(unknowns)"))
      && (gd?.layout?.annotations ?? []).some((a) => a.name === "caption");
  }, null, { timeout: 120000 }).catch(() => {});
  const squash = (t) => t.replace(/\s+/g, "");
  const LEGEND = ["Beyond the X values tested the curve is dotted: there it is the model's extrapolation, not a measurement.",
    "Open diamonds mark 3 unknowns read off the curve at their measured Y, with horizontal bars for the 95% CI of X."]
    .map(squash);
  const svg = (await graphExport("svg")).buf.toString("utf8");
  const svgAll = squash((await svgTexts(Buffer.from(svg))).join(""));
  const dotted = (svg.match(/stroke-dasharray/g) ?? []).length;
  const diamonds = await page.evaluate((src) => {
    const doc = new DOMParser().parseFromString(src, "image/svg+xml");
    return [...doc.querySelectorAll(".scatterlayer .trace")].map((t) => t.querySelectorAll("path.point").length);
  }, svg);
  expect("P-22/P-52 the SVG export carries the two dotted parts, the 7 standards and 3 unknown markers, and the legend",
    dotted >= 2 && diamonds.includes(3) && diamonds.includes(7) && LEGEND.every((l) => svgAll.includes(l)),
    `${dotted} dashed; points per trace ${JSON.stringify(diamonds)}`);
  const pdf = (await graphExport("pdf")).buf;
  const pdfAll = squash(readPdf(pdf).runs.map((r) => r.text).join(""));
  const pdfDots = (() => {
    let n = 0;
    for (const m of pdf.toString("latin1").matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
      const st = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(m[2]);
      if (!st) continue;
      try {
        const raw = Buffer.from(st[1], "latin1");
        const text = /\/FlateDecode/.test(m[2].slice(0, st.index)) ? inflateSync(raw).toString("latin1") : st[1];
        n += (text.match(/\[\s*[\d.]+(?:\s+[\d.]+)+\s*\]\s+[\d.]+\s+d\b/g) ?? []).length;
      } catch { /* not a content stream */ }
    }
    return n;
  })();
  expect("P-22/P-52 the PDF export draws the dotted parts and holds the legend text",
    pdfDots >= 2 && LEGEND.every((l) => pdfAll.includes(l)), `${pdfDots} dashed strokes`);
}

// P-65: source data per figure. A layout with panels a (column scatter,
// mean ± SD under an unpaired t test) and b (the dose-response 4PL fit):
// the layout's "Source data (.xlsx)" writes sheets "a" and "b" holding
// what each panel plots (equal to the graph's own traces, gd.data); the
// means, SDs and n against numpy (Control 1, 2, 3, 4: mean 2.5, SD
// 1.2909944487358056; Drug 2, 4, 6: mean 4, SD 2; scipy ttest_ind gives
// t = 1.2180, P = 0.2776); read back by openpyxl, python-calamine and
// LibreOffice; eLife "Source data available" turns met.
{
  await page.setInputFiles('input[aria-label="Open an OpenDose project or a Prism file"]',
    join(here, "..", "e2e-fixtures", "stage", "source-data.json"));
  await page.getByRole("treeitem", { name: "Figure 2", exact: true }).first().waitFor({ timeout: 30000 });
  await page.getByRole("treeitem", { name: "Figure 2", exact: true }).first().locator(":scope > .nav-row").click();
  await page.waitForFunction(() => document.querySelectorAll(".layout-graph .plot.js-plotly-plot").length === 2
    && [...document.querySelectorAll(".layout-graph .plot")].every((d) => (d.data ?? []).length > 0),
  null, { timeout: 120000 });
  // the fit's curve is drawn once its result is in
  await page.waitForFunction(() => [...document.querySelectorAll(".layout-graph .plot")]
    .some((d) => (d.data ?? []).some((t) => t.meta?.odTag?.role === "fit")), null, { timeout: 120000 });
  const drawn = await page.evaluate(() => [...document.querySelectorAll(".layout-item.kind-graph")].map((it) => {
    const d = it.querySelector(".layout-graph .plot");
    return (d?.data ?? []).map((t) => ({ role: t.meta?.odTag?.role, ds: t.meta?.odTag?.ds,
      x: Array.from(t.x ?? []), y: Array.from(t.y ?? []), err: t.error_y?.array ? Array.from(t.error_y.array) : null }));
  }));
  const src = await save(() => page.getByRole("button", { name: "Source data (.xlsx)" }).click());
  expect("source data: one workbook named after the layout", src.name === "figure-2-source-data.xlsx", src.name);
  const book = readXlsx(new Uint8Array(src.buf));
  expect("source data: README, then sheets a and b (the panel letters)",
    JSON.stringify(book.names) === JSON.stringify(["README", "a", "b"]), book.names.join(", "));
  const section = (rows, title) => {
    const i = rows.findIndex((r) => r.length === 1 && r[0] === title);
    if (i < 0) return { header: [], body: [] };
    let end = rows.slice(i + 2).findIndex((r) => !r || r.every((c) => c === null));
    end = end < 0 ? rows.length : i + 2 + end;
    return { header: rows[i + 1], body: rows.slice(i + 2, end) };
  };
  const a = book.sheets.a ?? [];
  const groups = section(a, "Centre and error bars of each group");
  expect("sheet a: each group's mean, SD and n (numpy: 2.5, 1.2909944487358056, 4; 4, 2, 3)",
    JSON.stringify(groups.header) === JSON.stringify(["Data set", "Category", "Mean", "SD below", "SD above", "n"])
    && JSON.stringify(groups.body) === JSON.stringify([["Control", "Control", 2.5, 1.2909944487358056, 1.2909944487358056, 4],
      ["Drug", "Drug", 4, 2, 2, 3]]), JSON.stringify(groups.body));
  const pts = section(a, "Plotted values");
  expect("sheet a: every plotted point, with its group and row",
    JSON.stringify(pts.body.map((r) => [r[0], r[2], r[4]])) === JSON.stringify([["Control", "M1", 1], ["Control", "M2", 2],
      ["Control", "M3", 3], ["Control", "M4", 4], ["Drug", "M1", 2], ["Drug", "M2", 4], ["Drug", "M3", 6]]),
    JSON.stringify(pts.body));
  const drawnA = drawn[0].filter((t) => t.role === "points").flatMap((t) => t.y);
  expect("sheet a: the points equal the panel's plotted traces",
    JSON.stringify(pts.body.map((r) => r[4])) === JSON.stringify(drawnA), JSON.stringify(drawnA));
  const testRow = a.find((r) => r[0] === "Test")?.[1] ?? "";
  const legendRow = a.find((r) => r[0] === "Legend")?.[1] ?? "";
  expect("sheet a: the test and the legend with n",
    /^Unpaired t test, two-sided \(results sheet “t test of Viability”\)$/.test(testRow) && /n = 4 \(Control\), 3 \(Drug\)/.test(legendRow),
    `${testRow} | ${legendRow}`);
  const b = book.sheets.b ?? [];
  const curve = section(b, "Drawn curve");
  const fit = drawn[1].filter((t) => t.role === "fit");
  expect("sheet b: the drawn curve, every point of it, equal to the plotted trace",
    fit.length === 1 && curve.body.length === fit[0].x.length && curve.body.length > 50
    && curve.body.every((r, i) => r[2] === fit[0].x[i] && r[3] === fit[0].y[i]), `${curve.body.length} rows`);
  const bpts = section(b, "Plotted values");
  const means = [99.59999999999998, 97.56666666666668, 92.06666666666666];
  const sds = [1.7058722109231976, 2.1079215671683214, 1.7387735140993361];
  // X is what the axis plots: log10 of the dose, said in the column's title
  expect("sheet b: the points at log10(dose) with their mean and SD (numpy, first three doses)",
    bpts.body.length === 9 && bpts.body[0][3] === -9 && bpts.body[2][3] === -8
    && /^X: log/.test(String(bpts.header[3])) && JSON.stringify(bpts.header).includes("SD below")
    && means.every((m, i) => Math.abs(bpts.body[i][4] - m) < 1e-12 && Math.abs(bpts.body[i][5] - sds[i]) < 1e-12),
    JSON.stringify(bpts.body.slice(0, 3)));
  // independent readers (PYTHON with openpyxl and python-calamine; LibreOffice)
  const expected = Object.fromEntries(["a", "b"].map((s) => [s, book.sheets[s].map((r) => r.map((c) => (c === null
    ? null : typeof c === "number" ? { t: "n", v: String(c) } : { t: "s", v: c })))]));
  const xlsxPath = join(tmp, src.name);
  writeFileSync(xlsxPath, src.buf);
  const expPath = join(tmp, "source-data-expected.json");
  writeFileSync(expPath, JSON.stringify(expected));
  const py = process.env.PYTHON ?? "python3";
  const rb = spawnSync(py, [join(here, "xlsx-readback.py"), xlsxPath, expPath], { encoding: "utf8", timeout: 400000 });
  const out = (rb.stdout || rb.stderr).trim().replace(/\s+/g, " ");
  if (rb.status === 2) console.log(`skip some readers are missing for ${py}: ${out}`);
  expect("source data read back by openpyxl, python-calamine and LibreOffice",
    rb.status === 0 || rb.status === 2, out);
  // P-09: with the graphs on a layout, eLife's source data item is met
  await page.getByRole("treeitem", { name: "Viability", exact: true }).first().locator(":scope > .nav-row").click();
  await page.getByRole("treeitem", { name: "t test of Viability", exact: true }).first().locator(":scope > .nav-row").click();
  await page.getByRole("button", { name: "Journal checklists" }).click();
  const ck = page.getByRole("dialog", { name: "Journal checklists" });
  await ck.waitFor({ timeout: 15000 });
  await ck.getByRole("tab", { name: /eLife/ }).click();
  const item = ck.locator(".checklist li").filter({ hasText: "Source data available" });
  const itemText = (await item.innerText()).replace(/\s+/g, " ");
  expect("P-09 eLife source data is met once the graph is on a layout, naming the layout",
    await item.getAttribute("data-status") === "met" && itemText.includes("Figure 2"), itemText);
  await ck.getByRole("button", { name: "Close" }).click();
}

console.log("files in", tmp);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("export + layout e2e OK");
