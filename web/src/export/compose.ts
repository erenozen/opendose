// Page-layout drawing: every non-graph element of a layout (text blocks,
// the master legend, panel letters) is drawn as SVG by the functions
// here, both on screen in the composer and in the exported page, so what
// you see is what the file holds. Graphs and pictures are embedded as
// nested SVGs, which keeps a PDF of the page fully vector.
import { PX_PER_MM } from "../project/layout";
import type { LegendEntry } from "../project/layout";
import type { LayoutItem, LayoutPage, PanelLetters } from "../project/types";
import { pageDims } from "../project/layout";

export const SANS = "Inter, Helvetica, Arial, sans-serif";
export const SERIF = "Georgia, 'Times New Roman', Times, serif";
const PX_PER_PT = 96 / 72;

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export const mmPx = (mm: number) => mm * PX_PER_MM;

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Greedy word wrap of each paragraph to `maxWidth` px. */
export function wrapLines(text: string, maxWidth: number, font: string): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (measure(next, font) <= maxWidth) line = next;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/** A text block, drawn in its own box (origin at the box's top-left). */
export function textSvg(item: Extract<LayoutItem, { kind: "text" }>, ink: string): string {
  const size = item.fontSize * PX_PER_PT;
  const weight = item.bold ? 700 : 400;
  const w = mmPx(item.w);
  const lines = wrapLines(item.text, w, `${weight} ${size}px ${SANS}`);
  const x = item.align === "center" ? w / 2 : item.align === "right" ? w : 0;
  const anchor = item.align === "center" ? "middle" : item.align === "right" ? "end" : "start";
  const lh = size * 1.3;
  const tspans = lines.map((l, i) =>
    `<tspan x="${x}" y="${(size + i * lh).toFixed(2)}">${escapeXml(l) || " "}</tspan>`).join("");
  return `<text font-family="${SANS}" font-size="${size.toFixed(2)}" font-weight="${weight}" `
    + `fill="${ink}" text-anchor="${anchor}">${tspans}</text>`;
}

const DASHES: Record<string, string> = {
  dash: "6,4", dot: "2,3", dashdot: "6,3,2,3", longdash: "10,4",
  longdashdot: "10,3,2,3", "2px,3px": "2,3",
};

/** A Plotly marker symbol as SVG, centred at (cx, cy) with radius r. */
export function symbolSvg(symbol: string, cx: number, cy: number, r: number, color: string,
  outline: string): string {
  const open = symbol.endsWith("-open");
  const base = symbol.replace(/-open(-dot)?$/, "");
  const paint = open
    ? `fill="none" stroke="${color}" stroke-width="1.5"`
    : `fill="${color}" stroke="${outline}" stroke-width="1"`;
  const poly = (pts: [number, number][]) =>
    `<polygon points="${pts.map(([x, y]) => `${(cx + x * r).toFixed(2)},${(cy + y * r).toFixed(2)}`)
      .join(" ")}" ${paint}/>`;
  switch (base) {
    case "square":
      return `<rect x="${cx - r * 0.85}" y="${cy - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" ${paint}/>`;
    case "diamond": return poly([[0, -1.2], [1.2, 0], [0, 1.2], [-1.2, 0]]);
    case "triangle-up": return poly([[0, -1.15], [1.1, 0.8], [-1.1, 0.8]]);
    case "triangle-down": return poly([[0, 1.15], [1.1, -0.8], [-1.1, -0.8]]);
    case "star": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = i % 2 ? 0.5 : 1.2;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      return poly(pts);
    }
    case "hexagon": {
      const pts: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;
        pts.push([Math.cos(a), Math.sin(a)]);
      }
      return poly(pts);
    }
    case "x": case "x-thin": case "cross": case "cross-thin": {
      const d = base.startsWith("x")
        ? `M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx - r},${cy + r}L${cx + r},${cy - r}`
        : `M${cx - r},${cy}L${cx + r},${cy}M${cx},${cy - r}L${cx},${cy + r}`;
      return `<path d="${d}" stroke="${color}" stroke-width="2" fill="none"/>`;
    }
    default:
      return `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint}/>`;
  }
}

/** Height a legend needs, in px, for its entries at its size. */
export function legendRows(n: number, columns: number): number {
  return Math.ceil(n / Math.max(1, columns));
}

/** The master legend in its own box. */
export function legendSvg(item: Extract<LayoutItem, { kind: "legend" }>, entries: LegendEntry[],
  ink: string, outline: string): string {
  const size = item.fontSize * PX_PER_PT;
  const cols = Math.max(1, item.columns);
  const colW = mmPx(item.w) / cols;
  const rowH = size * 1.6;
  const sw = size * 2.2;
  const parts: string[] = [];
  entries.forEach((e, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * colW;
    const cy = row * rowH + rowH / 2;
    if (e.fill) {
      parts.push(`<rect x="${x + sw * 0.15}" y="${cy - size * 0.4}" width="${sw * 0.7}" `
        + `height="${size * 0.8}" fill="${e.color}" fill-opacity="0.35" stroke="${e.color}" stroke-width="1.5"/>`);
    }
    if (e.dash) {
      const dash = DASHES[e.dash] ? ` stroke-dasharray="${DASHES[e.dash]}"` : "";
      parts.push(`<line x1="${x}" y1="${cy}" x2="${x + sw}" y2="${cy}" stroke="${e.color}" `
        + `stroke-width="2"${dash}/>`);
    }
    if (e.symbol) parts.push(symbolSvg(e.symbol, x + sw / 2, cy, size * 0.32, e.color, outline));
    parts.push(`<text x="${x + sw + size * 0.4}" y="${cy}" dominant-baseline="central" `
      + `font-family="${SANS}" font-size="${size.toFixed(2)}" fill="${ink}">${escapeXml(e.name)}</text>`);
  });
  if (!entries.length) {
    parts.push(`<text x="0" y="${size}" font-family="${SANS}" font-size="${size.toFixed(2)}" `
      + `fill="${ink}" fill-opacity="0.6">Legend: place graphs on the page</text>`);
  }
  return parts.join("");
}

/** Where a panel letter sits relative to its panel's top-left (px). */
export function letterPosition(letters: PanelLetters): { dx: number; dy: number } {
  const size = letters.fontSize * PX_PER_PT;
  return letters.position === "inside"
    ? { dx: mmPx(1), dy: size }
    : { dx: -mmPx(1), dy: -mmPx(1.5) };
}

export function letterSvg(label: string, x: number, y: number, letters: PanelLetters,
  ink: string): string {
  const size = letters.fontSize * PX_PER_PT;
  const p = letterPosition(letters);
  return `<text x="${(x + p.dx).toFixed(2)}" y="${(y + p.dy).toFixed(2)}" `
    + `font-family="${letters.font === "serif" ? SERIF : SANS}" font-size="${size.toFixed(2)}" `
    + `font-weight="${letters.bold ? 700 : 400}" fill="${ink}">${escapeXml(label)}</text>`;
}

/** Rename every id in an SVG (and the references to it) so several
 *  embedded graphs cannot clash. */
function prefixIds(root: Element, prefix: string) {
  const ids = new Map<string, string>();
  root.querySelectorAll("[id]").forEach((el) => {
    const id = el.getAttribute("id")!;
    ids.set(id, `${prefix}${id}`);
    el.setAttribute("id", `${prefix}${id}`);
  });
  if (!ids.size) return;
  const swap = (v: string) => v.replace(/url\(\s*["']?#([^)"']+)["']?\s*\)/g,
    (m, id: string) => (ids.has(id) ? `url(#${ids.get(id)})` : m));
  root.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (a.value.includes("url(")) el.setAttribute(a.name, swap(a.value));
      else if ((a.name === "href" || a.name === "xlink:href") && a.value.startsWith("#")
        && ids.has(a.value.slice(1))) el.setAttribute(a.name, `#${ids.get(a.value.slice(1))}`);
    }
  });
}

export interface PagePanel {
  item: LayoutItem;
  /** SVG markup of the graph or picture. */
  svg: string;
}

export interface ComposeInput {
  page: LayoutPage;
  items: LayoutItem[];
  panels: PagePanel[];
  letters: PanelLetters;
  letterMap: Map<string, string>;
  legend: LegendEntry[];
  ink: string;
  outline: string;
  /** Page fill, or null for transparent. */
  background: string | null;
}

/** The whole page as one SVG document (CSS px, 96 per inch). */
export function composePage(input: ComposeInput): { svg: string; width: number; height: number } {
  const { w, h } = pageDims(input.page);
  const W = mmPx(w);
  const H = mmPx(h);
  const NS = "http://www.w3.org/2000/svg";
  const doc = document.implementation.createDocument(NS, "svg", null);
  const root = doc.documentElement;
  root.setAttribute("xmlns", NS);
  root.setAttribute("width", String(W));
  root.setAttribute("height", String(H));
  root.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (input.background) {
    const bg = doc.createElementNS(NS, "rect");
    bg.setAttribute("width", String(W));
    bg.setAttribute("height", String(H));
    bg.setAttribute("fill", input.background);
    root.appendChild(bg);
  }
  const fragment = (markup: string, x: number, y: number, bw: number, bh: number) => {
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="${NS}" x="${x}" y="${y}" width="${bw}" height="${bh}" overflow="visible">${markup}</svg>`,
      "image/svg+xml").documentElement;
    root.appendChild(doc.importNode(parsed, true));
  };
  input.panels.forEach(({ item, svg }, i) => {
    const el = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
    if (el.nodeName !== "svg") return;
    const ow = Number.parseFloat(el.getAttribute("width") ?? "") || mmPx(item.w);
    const oh = Number.parseFloat(el.getAttribute("height") ?? "") || mmPx(item.h);
    if (!el.getAttribute("viewBox")) el.setAttribute("viewBox", `0 0 ${ow} ${oh}`);
    el.setAttribute("x", String(mmPx(item.x)));
    el.setAttribute("y", String(mmPx(item.y)));
    el.setAttribute("width", String(mmPx(item.w)));
    el.setAttribute("height", String(mmPx(item.h)));
    el.removeAttribute("style"); // Plotly puts its background colour here
    prefixIds(el, `p${i}-`);
    root.appendChild(doc.importNode(el, true));
  });
  for (const it of input.items) {
    const x = mmPx(it.x);
    const y = mmPx(it.y);
    if (it.kind === "text") fragment(textSvg(it, input.ink), x, y, mmPx(it.w), mmPx(it.h));
    if (it.kind === "legend") {
      fragment(legendSvg(it, input.legend, input.ink, input.outline), x, y, mmPx(it.w), mmPx(it.h));
    }
  }
  for (const it of input.items) {
    const label = input.letterMap.get(it.id);
    if (label) fragment(letterSvg(label, mmPx(it.x), mmPx(it.y), input.letters, input.ink), 0, 0, W, H);
  }
  return { svg: new XMLSerializer().serializeToString(root), width: W, height: H };
}
