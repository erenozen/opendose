// Renders public/apple-touch-icon.png (180 x 180) from the mark in
// public/favicon.svg. iOS rounds the corners itself and fills transparent
// pixels with black, so the tile's colour runs to the edges and the sigmoid
// is drawn on it at the favicon's proportions. Run after changing the mark:
//   node scripts/make-touch-icon.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = readFileSync(join(PUBLIC, "favicon.svg"), "utf8");
const tile = svg.match(/<rect[^>]*fill="([^"]+)"/)?.[1];
const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<rect[^>]*\/>/, "");
if (!tile || !inner.includes("<path")) throw new Error("favicon.svg: tile or mark not found");

// The favicon's 28-unit box, the tile filling all of it.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 28 28">`
  + `<rect width="28" height="28" fill="${tile}"/>${inner}</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0">${icon}</body></html>`);
await page.locator("svg").screenshot({ path: join(PUBLIC, "apple-touch-icon.png"), omitBackground: false });
await browser.close();
console.log("wrote public/apple-touch-icon.png");
