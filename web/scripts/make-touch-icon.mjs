// Renders the PNG icons from the mark in public/favicon.svg:
//   public/apple-touch-icon.png (180 x 180): iOS rounds the corners itself
//     and fills transparent pixels with black, so the tile's colour runs to
//     the edges and the sigmoid is drawn on it at the favicon's proportions.
//   public/favicon-32.png (32 x 32): the favicon as it is, for browsers and
//     link previews that skip SVG icons.
//   public/icon-192.png, public/icon-512.png: the web app manifest's icons
//     (public/manifest.webmanifest), drawn as the touch icon: a full tile, so
//     they also serve as maskable icons (the mark sits inside the central
//     80% safe zone).
// Run after changing the mark:
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
const tileIcon = (px) => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 28 28">`
  + `<rect width="28" height="28" fill="${tile}"/>${inner}</svg>`;
const touch = tileIcon(180);
const small = svg.replace(/width="28" height="28"/, 'width="32" height="32"');

const browser = await chromium.launch();
for (const [file, markup, size, transparent] of [
  ["apple-touch-icon.png", touch, 180, false],
  ["favicon-32.png", small, 32, true],
  ["icon-192.png", tileIcon(192), 192, false],
  ["icon-512.png", tileIcon(512), 512, false],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.locator("svg").screenshot({ path: join(PUBLIC, file), omitBackground: transparent });
  await page.close();
  console.log(`wrote public/${file}`);
}
await browser.close();
