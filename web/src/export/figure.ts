// Turning a rendered Plotly graph into export images.
//
// Every export starts from the graph's live figure (its data and layout,
// including any pan/zoom), restyled for the file: transparent background
// on request, and light "paper" colours when the app is in dark theme so
// a figure exported at night still prints black on white. Plotly then
// lays the figure out again at the requested size, so text keeps its
// size and the plot area grows or shrinks around it.
import type Plotly from "plotly.js-dist-min";
import { loadPlotly } from "../lib/plotly";
import { isDarkMode, SCHEMES, type SchemeId } from "../lib/palette";
import {
  EXPORT_CHROME_DARK, EXPORT_CHROME_LIGHT, SCREEN_CHROME_DARK, SCREEN_CHROME_LIGHT,
  type Chrome,
} from "../lib/chrome";
import { CSS_DPI } from "./settings";

export interface ExportLook {
  transparent: boolean;
  /** Map dark-theme colours to the light (print) palette. */
  paper: boolean;
  scheme?: SchemeId;
}

export interface Figure {
  data: Plotly.Data[];
  layout: Partial<Plotly.Layout>;
}

type PlotDiv = HTMLElement & {
  data?: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  _fullLayout?: Record<string, unknown>;
};

const TRANSPARENT = "rgba(0,0,0,0)";

export function isPlotReady(el: Element | null): el is PlotDiv {
  return !!el && !!(el as PlotDiv)._fullLayout && Array.isArray((el as PlotDiv).data);
}

/** Wait until a plot has drawn inside `root` (results may still be
 *  computing). Resolves null after `timeout` ms. */
export async function waitForPlot(root: ParentNode, timeout = 20000): Promise<PlotDiv | null> {
  const t0 = performance.now();
  for (;;) {
    const el = root.querySelector(".plot");
    if (isPlotReady(el)) {
      // Let a pending re-render (debounced result, resize) settle.
      await new Promise((r) => setTimeout(r, 120));
      return el;
    }
    if (performance.now() - t0 > timeout) return null;
    await new Promise((r) => setTimeout(r, 100));
  }
}

const key = (c: string) => c.toLowerCase().replace(/\s+/g, "");

/** Screen chrome -> the pinned export chrome. On screen, plots follow the
 *  app's tokens; a file keeps the chrome exports have always had (ruling
 *  10), whatever the tokens are retuned to. Light screen colours always
 *  map to the light (paper) export chrome; dark ones to the dark export
 *  chrome, or to paper when `paper` is set. */
function chromeMap(paper: boolean): Map<string, string> {
  const m = new Map<string, string>();
  const add = (from: Chrome, to: Chrome) => {
    for (const k of Object.keys(from) as (keyof Chrome)[]) {
      if (!m.has(key(from[k]))) m.set(key(from[k]), to[k]);
    }
  };
  add(SCREEN_CHROME_DARK, paper ? EXPORT_CHROME_LIGHT : EXPORT_CHROME_DARK);
  add(SCREEN_CHROME_LIGHT, EXPORT_CHROME_LIGHT);
  if (paper) add(EXPORT_CHROME_DARK, EXPORT_CHROME_LIGHT);
  return m;
}

/** Dark-theme colour -> light-theme colour, for the chrome and the scheme. */
function paperMap(scheme: SchemeId | undefined): Map<string, string> {
  const m = chromeMap(true);
  const ids = scheme ? [scheme] : (Object.keys(SCHEMES) as SchemeId[]);
  for (const id of ids) {
    const s = SCHEMES[id];
    s.dark.forEach((c, i) => {
      if (!m.has(c.toLowerCase())) m.set(c.toLowerCase(), s.light[i % s.light.length]);
    });
  }
  return m;
}

/** Replace #rrggbb (and #rrggbbaa) colours, and rgba() strings the map
 *  names, in any JSON-able value. */
export function remapColours<T>(value: T, map: Map<string, string>): T {
  const json = JSON.stringify(value)
    .replace(/#[0-9a-f]{6}(?=(?:[0-9a-f]{2})?")/gi, (hex) => map.get(hex.toLowerCase()) ?? hex)
    .replace(/"(rgba?\([^"]*\))"/g, (whole, c: string) => {
      const to = map.get(key(c));
      return to ? JSON.stringify(to) : whole;
    });
  return JSON.parse(json) as T;
}

/** Map any dark-theme colours in a JSON-able value to print colours. */
export function toPaperColours<T>(value: T, scheme?: SchemeId): T {
  return remapColours(value, paperMap(scheme));
}

/** Whether exported colours should be mapped to print colours. */
export function wantsPaper(look: ExportLook): boolean {
  return look.paper && isDarkMode();
}

/** The graph's figure restyled for export. */
export function exportFigure(gd: PlotDiv, look: ExportLook): Figure {
  let data = (gd.data ?? []) as Plotly.Data[];
  let layout = { ...(gd.layout ?? {}) } as Partial<Plotly.Layout>;
  const map = wantsPaper(look) ? paperMap(look.scheme) : chromeMap(false);
  data = remapColours(data, map);
  layout = remapColours(layout, map);
  if (look.transparent) {
    layout.paper_bgcolor = TRANSPARENT;
    layout.plot_bgcolor = TRANSPARENT;
  }
  return { data, layout };
}

/** Every font size the figure uses (CSS px), for the font-floor check. */
export function figureFontSizes(gd: PlotDiv): number[] {
  const full = gd._fullLayout ?? {};
  const out: number[] = [];
  const add = (f: unknown) => {
    const size = (f as { size?: unknown } | undefined)?.size;
    if (typeof size === "number") out.push(size);
  };
  add(full.font);
  for (const [k, v] of Object.entries(full)) {
    if (!/^[xy]axis\d*$/.test(k) || !v || typeof v !== "object") continue;
    const ax = v as { tickfont?: unknown; title?: { font?: unknown; text?: string };
      showticklabels?: boolean; visible?: boolean };
    if (ax.visible === false) continue;
    if (ax.showticklabels !== false) add(ax.tickfont);
    if (ax.title?.text) add(ax.title.font);
  }
  const legend = full.legend as { font?: unknown } | undefined;
  if (full.showlegend !== false && legend) add(legend.font);
  for (const a of (full.annotations as { font?: unknown }[] | undefined) ?? []) add(a.font);
  return out;
}

/** SVG markup of the figure at a size (CSS px). */
export async function figureToSvg(fig: Figure, width: number, height: number): Promise<string> {
  const P = await loadPlotly();
  const url = await P.toImage(fig as unknown as Plotly.RootOrData, {
    format: "svg", width, height,
  } as Parameters<typeof Plotly.toImage>[1]);
  return decodeDataUrl(url);
}

/** PNG/JPEG/WebP data URL of the figure; `scale` multiplies the pixels. */
export async function figureToRaster(fig: Figure, format: "png" | "jpeg" | "webp",
  width: number, height: number, scale: number): Promise<string> {
  // JPEG cannot hold transparency: Plotly would fill it with black.
  const f = format === "jpeg" && fig.layout.paper_bgcolor === TRANSPARENT
    ? { ...fig, layout: { ...fig.layout, paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff" } }
    : fig;
  const P = await loadPlotly();
  return P.toImage(f as unknown as Plotly.RootOrData, {
    format, width, height, scale,
  } as Parameters<typeof Plotly.toImage>[1]);
}

export function decodeDataUrl(url: string): string {
  const comma = url.indexOf(",");
  const head = url.slice(0, comma);
  const body = url.slice(comma + 1);
  return head.includes(";base64")
    ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
    : decodeURIComponent(body);
}

export async function dataUrlToBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
}

/** Draw SVG markup onto a canvas at `scale` (device pixels per CSS px). */
export async function svgToCanvas(svg: string, width: number, height: number,
  scale: number, background: string | null): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number):
  Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error("encoding failed"))), type, quality));
}

/** Pixels of a PNG data URL, for the TIFF writer. */
export async function pngPixels(dataUrl: string): Promise<ImageData> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export const scaleFor = (dpi: number) => dpi / CSS_DPI;
