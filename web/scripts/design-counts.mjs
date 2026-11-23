// Design-token drift counts for web/src.
//
//   node scripts/design-counts.mjs [--list]
//
// Prints, for every file under web/src except styles/tokens.css (the one
// place raw values belong) and tests:
//   - colour literals (hex, rgb(), hsl(), oklch(), ...) in CSS and in
//     TS/TSX, with the pinned export chrome and the plot palettes, which
//     are scientific output (ruling 10), counted on their own line;
//   - distinct font-size values (CSS and inline `fontSize`);
//   - z-index values that do not come from the --z-* scale;
//   - border-radius values that do not come from the --radius-* scale;
//   - `100vh` uses;
//   - :hover rules outside a `(hover: hover)` media query;
//   - `transition: all`.
// --list prints every hit with its file and line.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");
const LIST = process.argv.includes("--list");

const TOKEN_FILE = "styles/tokens.css";
// Scientific output: figure colours, series schemes, the pinned export
// chrome and the print sheet. Counted separately, never as drift.
const OUTPUT_FILES = new Set([
  "lib/palette.ts", "lib/chrome.ts", "graph/drawnColors.ts", "app/print.css",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__") continue;
      walk(p, out);
    } else if (/\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

// A colour function only when no identifier or index runs into it (a JS
// call such as `[lab(x)]` to a function named lab is not a colour).
const COLOUR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b(?![0-9a-zA-Z-])|(?<![\w.$[])(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/g;

/** Strip comments, keeping line numbers. */
function stripComments(text, css) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  let t = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (!css) t = t.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, pre) => pre + blank(m.slice(pre.length)));
  return t;
}

const hits = {
  colourCss: [], colourCssDefs: [], colourTs: [], colourOutput: [],
  fontSizes: new Map(), zIndex: [], radius: [], vh100: [], hoverUngated: [], transitionAll: [],
};

function lineOf(text, idx) { return text.slice(0, idx).split("\n").length; }

function scanCss(rel, text) {
  const t = stripComments(text, true);
  const output = OUTPUT_FILES.has(rel);
  // colours, separating custom-property definitions from rules
  for (const m of t.matchAll(COLOUR)) {
    const ln = lineOf(t, m.index);
    const line = t.split("\n")[ln - 1];
    const where = `${rel}:${ln}`;
    if (/^#[0-9a-fA-F]{3,4}$/.test(m[0]) && /[a-z-]#/.test(line.slice(0, line.indexOf(m[0]) + 1))) continue;
    if (output) hits.colourOutput.push(`${where}  ${line.trim()}`);
    else if (/^\s*--[\w-]+\s*:/.test(line)) hits.colourCssDefs.push(`${where}  ${line.trim()}`);
    else hits.colourCss.push(`${where}  ${line.trim()}`);
  }
  for (const m of t.matchAll(/font-size\s*:\s*([^;}\n]+)/g)) addSize(m[1].trim(), `${rel}:${lineOf(t, m.index)}`);
  for (const m of t.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}\n]+)/g)) {
    const size = m[1].match(/(?:^|\s)([\d.]+(?:px|rem|em)|var\(--text-[\w-]+\))(?:\/|\s)/);
    if (size) addSize(size[1], `${rel}:${lineOf(t, m.index)}`);
  }
  for (const m of t.matchAll(/z-index\s*:\s*([^;}\n]+)/g)) {
    const v = m[1].trim();
    if (!/^(calc\()?var\(--z-/.test(v) && !/^(auto|0|inherit|initial)$/.test(v)) hits.zIndex.push(`${rel}:${lineOf(t, m.index)}  ${v}`);
  }
  for (const m of t.matchAll(/border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius\s*:\s*([^;}\n]+)/g)) {
    const v = m[1].trim();
    if (!/^(0|50%|inherit|0 0 0 0)$/.test(v) && !/^(var\(--radius-[\w-]+\)\s*)+$/.test(v) && !/^0 var\(--radius-[\w-]+\)/.test(v)) {
      hits.radius.push(`${rel}:${lineOf(t, m.index)}  ${v}`);
    }
  }
  for (const m of t.matchAll(/100vh/g)) hits.vh100.push(`${rel}:${lineOf(t, m.index)}`);
  for (const m of t.matchAll(/transition(?:-property)?\s*:\s*all\b/g)) hits.transitionAll.push(`${rel}:${lineOf(t, m.index)}`);
  // :hover outside a (hover: hover) block: walk the braces
  const stack = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "{") {
      const prelude = t.slice(start, i).trim();
      stack.push(prelude);
      if (/:hover/.test(prelude) && !stack.some((p) => /^@media[^{]*hover\s*:\s*hover/.test(p))) {
        hits.hoverUngated.push(`${rel}:${lineOf(t, i)}  ${prelude.replace(/\s+/g, " ").slice(0, 80)}`);
      }
      start = i + 1;
    } else if (c === "}") {
      stack.pop();
      start = i + 1;
    } else if (c === ";") {
      start = i + 1;
    }
  }
}

function scanTs(rel, text) {
  const t = stripComments(text, false);
  const output = OUTPUT_FILES.has(rel);
  for (const m of t.matchAll(COLOUR)) {
    const ln = lineOf(t, m.index);
    const line = t.split("\n")[ln - 1];
    // only literals inside strings count (skip e.g. `#1` in comments-free code like ids)
    if (!/["'`]/.test(line)) continue;
    if (/^#[0-9a-fA-F]{3,4}$/.test(m[0])) continue;
    const where = `${rel}:${ln}  ${line.trim().slice(0, 110)}`;
    (output ? hits.colourOutput : hits.colourTs).push(where);
  }
  if (rel.endsWith(".tsx")) {
    // Inline styles only: a `fontSize` in document data (a layout text
    // item's size in points) is content, not a CSS size.
    for (const m of t.matchAll(/fontSize\s*:\s*["'`]?([\d.]+(?:px|rem|em)?)\b/g)) {
      if (t.lastIndexOf("style={{", m.index) <= t.lastIndexOf("}}", m.index)) continue;
      addSize(/\d$/.test(m[1]) ? `${m[1]}px` : m[1], `${rel}:${lineOf(t, m.index)}`);
    }
    for (const m of t.matchAll(/zIndex\s*:\s*([^,}\n]+)/g)) hits.zIndex.push(`${rel}:${lineOf(t, m.index)}  ${m[1].trim()}`);
    for (const m of t.matchAll(/100vh/g)) hits.vh100.push(`${rel}:${lineOf(t, m.index)}`);
  }
}

function addSize(v, where) {
  const key = v.replace(/\s*!important/, "");
  if (/^(inherit|initial|unset|1em|100%)$/.test(key)) return;
  if (!hits.fontSizes.has(key)) hits.fontSizes.set(key, []);
  hits.fontSizes.get(key).push(where);
}

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split("\\").join("/");
  if (rel === TOKEN_FILE) continue;
  const text = readFileSync(file, "utf8");
  if (rel.endsWith(".css")) scanCss(rel, text);
  else scanTs(rel, text);
}

const rows = [
  ["colour literals in CSS rules", hits.colourCss],
  ["colour literals in CSS custom properties (outside tokens.css)", hits.colourCssDefs],
  ["colour literals in TS/TSX", hits.colourTs],
  ["  (separately) export chrome, plot palettes, print", hits.colourOutput],
  ["z-index values not from --z-*", hits.zIndex],
  ["border-radius values not from --radius-*", hits.radius],
  ["100vh uses", hits.vh100],
  [":hover rules outside (hover: hover)", hits.hoverUngated],
  ["transition: all", hits.transitionAll],
];
const sizes = [...hits.fontSizes.keys()];
const isToken = (s) => /^(var\(--text-|max\(var\(--text-)/.test(s);
const tokenSizes = sizes.filter(isToken);
const rawSizes = sizes.filter((s) => !isToken(s));
console.log("design-counts for web/src (excluding styles/tokens.css and tests)\n");
for (const [label, list] of rows) console.log(`${String(list.length).padStart(5)}  ${label}`);
console.log(`${String(rawSizes.length).padStart(5)}  distinct raw font-size values: ${rawSizes.sort().join(", ")}`);
console.log(`${String(tokenSizes.length).padStart(5)}  distinct --text-* font sizes used`);
if (LIST) {
  for (const [label, list] of rows) {
    if (!list.length) continue;
    console.log(`\n## ${label}`);
    for (const h of list) console.log(`  ${h}`);
  }
  console.log("\n## font-size values");
  for (const [v, where] of [...hits.fontSizes].sort()) console.log(`  ${v}: ${where.length}  (${where.slice(0, 4).join(", ")}${where.length > 4 ? ", ..." : ""})`);
}
