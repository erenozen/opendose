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
import { spawnSync } from "node:child_process";
import { strFromU8, unzipSync } from "fflate";

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
        if (tok[0] === "<" || tok[0] === "(") out.texts.push({ size: tf * scale(mul(tm, ctm)), raw: tok });
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
console.log("files in", tmp);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("export + layout e2e OK");
