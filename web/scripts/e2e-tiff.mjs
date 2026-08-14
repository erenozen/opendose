// End-to-end check for TIFF export: drives the real export panel, then
// parses the downloaded file back byte by byte. The TIFF container is
// hand-written (no browser can encode one), so this asserts the header,
// the IFD tags, and the resolution actually match what was asked for.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? "http://localhost:5173/";
const WIDTH = 400, HEIGHT = 300, DPI = 150;
const EXPECT_W = Math.floor(WIDTH * DPI / 96);
const EXPECT_H = Math.floor(HEIGHT * DPI / 96);

// With --no-deflate the page loses CompressionStream, which exercises the
// encoder's uncompressed fallback for browsers that lack it.
const deflateOff = process.argv.includes("--no-deflate");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
if (deflateOff) {
  await page.addInitScript(() => {
    // @ts-expect-error - deliberately removing a platform API
    delete window.CompressionStream;
  });
}
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".results-table", { timeout: 180000 });
await page.waitForSelector(".plot.js-plotly-plot", { timeout: 30000 });

const panel = page.locator(".plot-card .export-panel");
await panel.locator("select").selectOption("tiff");
await panel.locator("input").nth(0).fill(String(WIDTH));
await panel.locator("input").nth(1).fill(String(HEIGHT));
await panel.locator("input").nth(2).fill(String(DPI));
console.log("hint:", (await panel.locator(".export-hint").innerText()));

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 60000 }),
  panel.getByRole("button", { name: /Download/ }).click(),
]);
const file = join(mkdtempSync(join(tmpdir(), "opendose-tiff-")),
  download.suggestedFilename());
await download.saveAs(file);

// --- parse the TIFF back ---
const buf = readFileSync(file);
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const fail = [];
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail.push(`${label}: got ${got}, want ${want}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${label} = ${got}`);
};

check("magic", buf.toString("latin1", 0, 2), "II");
check("version", view.getUint16(2, true), 42);

const ifd = view.getUint32(4, true);
const count = view.getUint16(ifd, true);
const tags = new Map();
let prevTag = 0;
for (let i = 0; i < count; i++) {
  const p = ifd + 2 + i * 12;
  const tag = view.getUint16(p, true);
  const type = view.getUint16(p + 2, true);
  const n = view.getUint32(p + 4, true);
  if (tag <= prevTag) fail.push(`tags out of order at ${tag}`);
  prevTag = tag;
  const inline = type === 3 && n === 1
    ? view.getUint16(p + 8, true)
    : view.getUint32(p + 8, true);
  tags.set(tag, { type, n, value: inline });
}
const rational = (off) =>
  view.getUint32(off, true) / view.getUint32(off + 4, true);

// Plotly's own rounding of the scaled canvas can differ by a pixel.
const near = (label, got, want) => {
  const ok = Math.abs(got - want) <= 1;
  if (!ok) fail.push(`${label}: got ${got}, want ~${want}`);
  console.log(`${ok ? "ok  " : "FAIL"} ${label} = ${got} (asked ~${want})`);
};

check("entries", count, 14);
near("ImageWidth", tags.get(256).value, EXPECT_W);
near("ImageLength", tags.get(257).value, EXPECT_H);
check("SamplesPerPixel", tags.get(277).value, 3);
check("BitsPerSample[0]", view.getUint16(tags.get(258).value, true), 8);
check("Photometric", tags.get(262).value, 2);
check("PlanarConfig", tags.get(284).value, 1);
check("ResolutionUnit", tags.get(296).value, 2);
check("XResolution", rational(tags.get(282).value), DPI);
check("YResolution", rational(tags.get(283).value), DPI);
check("RowsPerStrip", tags.get(278).value, tags.get(257).value);

const strip = tags.get(273).value;
const bytesInStrip = tags.get(279).value;
const raw = tags.get(256).value * tags.get(257).value * 3;
check("Compression", tags.get(259).value, deflateOff ? 1 : 8);
if (strip + bytesInStrip > buf.length) fail.push("strip runs past end of file");

let pixels;
if (deflateOff) {
  pixels = buf.subarray(strip, strip + bytesInStrip);
} else {
  console.log(`ok   strip = ${(bytesInStrip / 1024).toFixed(0)} KB `
    + `(${(raw / bytesInStrip).toFixed(1)}x smaller than raw)`);
  const { inflateSync } = await import("node:zlib");
  pixels = inflateSync(buf.subarray(strip, strip + bytesInStrip));
}
check("pixel bytes", pixels.length, raw);
// A rendered graph is neither blank nor uniform.
const distinct = new Set();
for (let i = 0; i < pixels.length; i += 3) {
  distinct.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  if (distinct.size > 20) break;
}
console.log(`ok   distinct colours sampled = ${distinct.size}`);
if (distinct.size < 3) fail.push("image looks blank");

// --- oversized request is refused up front, not by a browser crash ---
await panel.locator("input").nth(2).fill("2400");
await panel.getByRole("button", { name: /Download/ }).click();
await page.waitForSelector(".export-err", { timeout: 5000 });
console.log("ok   oversize guard:", await panel.locator(".export-err").innerText());

console.log("file:", file, `(${(buf.length / 1024).toFixed(0)} KB)`);
console.log("errors:", errors.length ? errors : "none");
await page.screenshot({ path: join(here, "tiff-export.png") });
await browser.close();
if (fail.length || errors.length) {
  console.error("FAILURES:", [...fail, ...errors]);
  process.exit(1);
}
console.log("TIFF export OK");
