// Page-layout model: pure functions over LayoutSheet (no React, no DOM).
//
// A layout is a page (size, orientation, margins, background) holding
// items placed in millimetres from the page's top-left corner: graph
// placeholders (bound to a graph sheet, or empty), unlinked pictures
// (static SVG snapshots), text blocks and one master legend. Panels
// (graphs and pictures) get letters A, B, C... in reading order.
//
// Files written before the composer existed only carry `graphIds` and a
// `grid`; `resolveLayout` turns those into placeholders on the fly, with
// stable ids, so the first edit persists them.
import type {
  LayoutItem, LayoutPage, LayoutRect, LayoutSheet, PanelLetters, Project,
} from "./types.ts";

export const MM_PER_IN = 25.4;
/** CSS pixels per millimetre (CSS fixes 96 px to the inch). */
export const PX_PER_MM = 96 / MM_PER_IN;
export const PT_PER_MM = 72 / MM_PER_IN;
/** Smallest item edge, so a placeholder never collapses out of reach. */
export const MIN_ITEM_MM = 5;
/** Gap between grid cells. */
export const GRID_GAP_MM = 6;

export const PAGE_SIZES = {
  a4: { w: 210, h: 297, label: "A4 (210 × 297 mm)" },
  letter: { w: 215.9, h: 279.4, label: "US Letter (8.5 × 11 in)" },
} as const;

/** Grid arrangements offered as one-click presets (rows × columns). */
export const GRID_PRESETS: { rows: number; cols: number }[] = [
  { rows: 1, cols: 1 }, { rows: 1, cols: 2 }, { rows: 2, cols: 2 },
  { rows: 2, cols: 3 }, { rows: 3, cols: 2 },
];

export const DEFAULT_PAGE: LayoutPage = {
  size: "a4", orientation: "portrait", width: 210, height: 297,
  margin: 15, background: "#ffffff",
};

export const DEFAULT_LETTERS: PanelLetters = {
  show: true, style: "upper", format: "plain", fontSize: 14, bold: true,
  font: "sans", position: "inside",
};

export interface ResolvedLayout {
  page: LayoutPage;
  items: LayoutItem[];
  letters: PanelLetters;
  grid: { rows: number; cols: number };
}

// ------------------------------------------------------------ page

/** Page width and height in mm, orientation applied. */
export function pageDims(page: LayoutPage): { w: number; h: number } {
  const base = page.size === "custom"
    ? { w: page.width, h: page.height }
    : { w: PAGE_SIZES[page.size].w, h: PAGE_SIZES[page.size].h };
  const long = Math.max(base.w, base.h);
  const short = Math.min(base.w, base.h);
  return page.orientation === "landscape" ? { w: long, h: short } : { w: short, h: long };
}

/** The printable area inside the margins. */
export function contentRect(page: LayoutPage): LayoutRect {
  const { w, h } = pageDims(page);
  const m = Math.min(page.margin, w / 3, h / 3);
  return { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
}

// ------------------------------------------------------------ grid

/** Tallest a grid cell gets relative to its width: graphs keep a figure-
 *  like shape (4:3 is 0.75) instead of stretching down a portrait page;
 *  the space left below holds text and the legend. */
export const MAX_CELL_ASPECT = 0.8;

/** Cell rectangles of a rows × cols grid inside the margins, row-major,
 *  starting at the top. */
export function gridRects(page: LayoutPage, rows: number, cols: number,
  gap = GRID_GAP_MM, maxAspect = MAX_CELL_ASPECT): LayoutRect[] {
  const c = contentRect(page);
  const cw = (c.w - gap * (cols - 1)) / cols;
  const ch = Math.min((c.h - gap * (rows - 1)) / rows, cw * maxAspect);
  const out: LayoutRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      out.push(round({ x: c.x + k * (cw + gap), y: c.y + r * (ch + gap), w: cw, h: ch }));
    }
  }
  return out;
}

const isPanel = (it: LayoutItem) => it.kind === "graph" || it.kind === "picture";

/** Items in reading order: top to bottom by row band, then left to right.
 *  Two items share a row when their vertical centres are within half the
 *  shorter one's height. */
export function readingOrder<T extends LayoutRect>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    const anchor = row?.[0];
    if (anchor && Math.abs((it.y + it.h / 2) - (anchor.y + anchor.h / 2))
      <= Math.min(it.h, anchor.h) / 2) row.push(it);
    else rows.push([it]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/**
 * Re-arrange the panels into a rows × cols grid. Panels (bound graphs and
 * pictures first, in reading order) fill the cells; empty placeholders
 * fill the rest. Nothing the user placed is dropped: panels beyond the
 * cell count keep their position. Text blocks and the legend stay put.
 */
export function applyGrid(layout: ResolvedLayout, rows: number, cols: number,
  ids: () => string): ResolvedLayout {
  const cells = gridRects(layout.page, rows, cols);
  const panels = readingOrder(layout.items.filter(isPanel));
  const filled = panels.filter((p) => p.kind === "picture" || p.graphId);
  const others = layout.items.filter((it) => !isPanel(it));
  const placed: LayoutItem[] = [];
  cells.forEach((cell, i) => {
    const it = filled[i];
    placed.push(it ? { ...it, ...cell } : reuseEmpty(panels, placed, cell, ids));
  });
  const overflow = filled.slice(cells.length);
  return {
    ...layout, grid: { rows, cols },
    items: [...placed, ...overflow, ...others],
  };
}

function reuseEmpty(panels: LayoutItem[], placed: LayoutItem[], cell: LayoutRect,
  ids: () => string): LayoutItem {
  // Keep an existing empty placeholder's id so React keys stay stable.
  const free = panels.find((p) => p.kind === "graph" && !p.graphId
    && !placed.some((q) => q.id === p.id));
  return { id: free?.id ?? ids(), kind: "graph", graphId: null, ...cell };
}

/**
 * Put graphs into the empty placeholders in reading order, taking them in
 * the order given (the project's Graphs section), starting from `startId`.
 * Graphs already on the page are skipped.
 */
export function fillPlaceholders(layout: ResolvedLayout, graphIds: string[],
  startId?: string | null): ResolvedLayout {
  const start = Math.max(0, startId ? graphIds.indexOf(startId) : 0);
  const onPage = new Set(placedGraphIds(layout.items));
  const queue = graphIds.slice(start).filter((g) => !onPage.has(g));
  const empties = readingOrder(layout.items.filter((it) => it.kind === "graph" && !it.graphId));
  const assign = new Map<string, string>();
  empties.forEach((e, i) => { if (queue[i]) assign.set(e.id, queue[i]); });
  if (!assign.size) return layout;
  return {
    ...layout,
    items: layout.items.map((it) => (assign.has(it.id) && it.kind === "graph"
      ? { ...it, graphId: assign.get(it.id)! } : it)),
  };
}

export function placedGraphIds(items: LayoutItem[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.kind === "graph" && it.graphId && !out.includes(it.graphId)) out.push(it.graphId);
  }
  return out;
}

// ------------------------------------------------------------ panel letters

/** "A".."Z", "AA".. (spreadsheet-style) for index 0, 1, ... */
export function letterFor(i: number, style: PanelLetters["style"] = "upper"): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return style === "lower" ? s.toLowerCase() : s;
}

export function formatLetter(letter: string, format: PanelLetters["format"]): string {
  return format === "paren" ? `(${letter})` : format === "period" ? `${letter}.` : letter;
}

/** Item id -> its panel label, for graphs (bound ones only) and pictures. */
export function panelLetters(items: LayoutItem[], letters: PanelLetters): Map<string, string> {
  const out = new Map<string, string>();
  if (!letters.show) return out;
  const panels = readingOrder(items.filter((it) =>
    (it.kind === "graph" && it.graphId) || it.kind === "picture"));
  panels.forEach((p, i) =>
    out.set(p.id, formatLetter(letterFor(i, letters.style), letters.format)));
  return out;
}

const overlaps = (a: LayoutRect, b: LayoutRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where a new w × h item goes: the first spot inside the margins (top to
 *  bottom, left to right, 5 mm steps) that overlaps nothing; failing
 *  that, the top-left of the content area. */
export function freeSpot(page: LayoutPage, items: LayoutRect[], w: number, h: number):
  LayoutRect {
  const c = contentRect(page);
  const bw = Math.min(w, c.w);
  const bh = Math.min(h, c.h);
  for (let y = c.y; y + bh <= c.y + c.h + 1e-6; y += 5) {
    for (let x = c.x; x + bw <= c.x + c.w + 1e-6; x += 5) {
      const r = { x, y, w: bw, h: bh };
      if (!items.some((o) => overlaps(r, o))) return round(r);
    }
  }
  return round({ x: c.x, y: c.y, w: bw, h: bh });
}

// ------------------------------------------------------------ move / resize

export function clampRect(r: LayoutRect, page: LayoutPage): LayoutRect {
  const { w: pw, h: ph } = pageDims(page);
  const w = Math.min(Math.max(r.w, MIN_ITEM_MM), pw);
  const h = Math.min(Math.max(r.h, MIN_ITEM_MM), ph);
  return round({
    x: Math.min(Math.max(r.x, 0), pw - w),
    y: Math.min(Math.max(r.y, 0), ph - h),
    w, h,
  });
}

export interface SnapOptions {
  /** Grid step in mm (0 = no grid). */
  grid: number;
  /** Distance within which an edge sticks to a guide, in mm. */
  threshold: number;
}

export const DEFAULT_SNAP: SnapOptions = { grid: 1, threshold: 2 };

/** Guide lines an edge can stick to: page edges and centre, margins, and
 *  the edges and centres of the other items. */
export function snapGuides(page: LayoutPage, others: LayoutRect[]):
  { xs: number[]; ys: number[] } {
  const { w, h } = pageDims(page);
  const c = contentRect(page);
  const xs = [0, w, w / 2, c.x, c.x + c.w];
  const ys = [0, h, h / 2, c.y, c.y + c.h];
  for (const o of others) {
    xs.push(o.x, o.x + o.w, o.x + o.w / 2);
    ys.push(o.y, o.y + o.h, o.y + o.h / 2);
  }
  return { xs, ys };
}

function nearest(values: number[], guides: number[], threshold: number):
  { delta: number } | null {
  let best: { delta: number } | null = null;
  for (const v of values) {
    for (const g of guides) {
      const d = g - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d };
      }
    }
  }
  return best;
}

const toGrid = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);

/** Snap a moved rectangle: its left/centre/right edge (and top/middle/
 *  bottom) sticks to the nearest guide; otherwise its corner to the grid. */
export function snapMove(r: LayoutRect, page: LayoutPage, others: LayoutRect[],
  opts: SnapOptions = DEFAULT_SNAP): LayoutRect {
  const g = snapGuides(page, others);
  const sx = nearest([r.x, r.x + r.w / 2, r.x + r.w], g.xs, opts.threshold);
  const sy = nearest([r.y, r.y + r.h / 2, r.y + r.h], g.ys, opts.threshold);
  return clampRect({
    ...r,
    x: sx ? r.x + sx.delta : toGrid(r.x, opts.grid),
    y: sy ? r.y + sy.delta : toGrid(r.y, opts.grid),
  }, page);
}

/** Snap a resized rectangle: only the right and bottom edges move. */
export function snapResize(r: LayoutRect, page: LayoutPage, others: LayoutRect[],
  opts: SnapOptions = DEFAULT_SNAP): LayoutRect {
  const g = snapGuides(page, others);
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  const sx = nearest([right], g.xs, opts.threshold);
  const sy = nearest([bottom], g.ys, opts.threshold);
  return clampRect({
    ...r,
    w: (sx ? right + sx.delta : toGrid(right, opts.grid)) - r.x,
    h: (sy ? bottom + sy.delta : toGrid(bottom, opts.grid)) - r.y,
  }, page);
}

function round(r: LayoutRect): LayoutRect {
  const q = (v: number) => Math.round(v * 100) / 100;
  return { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) };
}

// ------------------------------------------------------------ master legend

export interface LegendEntry {
  name: string;
  color: string;
  /** Marker symbol (Plotly name), or null for a line / bar swatch. */
  symbol: string | null;
  /** Line dash (Plotly name), or null when the series has no line. */
  dash: string | null;
  /** A filled swatch (bars, boxes, violins) instead of a marker. */
  fill: boolean;
}

/** The fields of a Plotly trace the legend reads (kept structural so the
 *  model needs no Plotly types). */
export interface TraceLike {
  name?: string;
  type?: string;
  mode?: string;
  legendgroup?: string;
  showlegend?: boolean;
  hoverinfo?: string;
  marker?: { color?: unknown; symbol?: unknown };
  line?: { color?: unknown; dash?: unknown; width?: unknown };
}

const INTERNAL = / band$|\(outliers\)$/;

/**
 * The series a graph shows, one entry per dataset: traces sharing a
 * legend group (a fitted curve plus its points) merge into one entry.
 * Helper traces (unnamed, confidence bands, outlier markers) are skipped.
 */
export function seriesFromTraces(traces: TraceLike[]): LegendEntry[] {
  const byKey = new Map<string, LegendEntry>();
  for (const t of traces) {
    const name = (t.name ?? "").trim();
    const helper = t.hoverinfo === "skip" && !t.mode?.includes("lines");
    if (!name || INTERNAL.test(name) || helper) continue;
    const key = t.legendgroup || name;
    const color = str(t.marker?.color) ?? str(t.line?.color) ?? "#000000";
    const filled = t.type === "bar" || t.type === "box" || t.type === "violin";
    const hasMarkers = !filled && (t.mode ?? "markers").includes("markers");
    const hasLine = !filled && !!t.mode?.includes("lines") && t.line?.width !== 0;
    const prev = byKey.get(key);
    const entry: LegendEntry = prev ?? { name, color, symbol: null, dash: null, fill: false };
    if (hasMarkers && !entry.symbol) {
      entry.symbol = str(t.marker?.symbol) ?? "circle";
      entry.color = color;
    }
    if (hasLine && !entry.dash) entry.dash = str(t.line?.dash) ?? "solid";
    if (filled) entry.fill = true;
    if (!prev) byKey.set(key, entry);
  }
  return [...byKey.values()];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * One legend for several graphs: the series of each graph in page order,
 * with exact repeats (same name, colour, symbol and line) shown once.
 * The same name drawn differently in two graphs is kept twice, since
 * merging those would mislabel one of them.
 */
export function masterLegend(perGraph: LegendEntry[][]): LegendEntry[] {
  const seen = new Set<string>();
  const out: LegendEntry[] = [];
  for (const list of perGraph) {
    for (const e of list) {
      const key = [e.name.trim(), e.color.toLowerCase(), e.symbol ?? "", e.dash ?? "",
        e.fill ? 1 : 0].join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

// ------------------------------------------------------------ resolve / edit

/** The layout with every default filled in. Pure and deterministic. */
export function resolveLayout(sheet: LayoutSheet): ResolvedLayout {
  const page = sheet.page ?? DEFAULT_PAGE;
  const letters = { ...DEFAULT_LETTERS, ...(sheet.letters ?? {}) };
  const grid = sheet.grid ?? { rows: 1, cols: 2 };
  if (sheet.items) return { page, items: sheet.items, letters, grid };
  // Pre-composer file: build placeholders from the stored graph list.
  const cells = gridRects(page, grid.rows, grid.cols);
  const items: LayoutItem[] = cells.map((cell, i) => ({
    id: `cell-${i + 1}`, kind: "graph", graphId: sheet.graphIds[i] ?? null, ...cell,
  }));
  sheet.graphIds.slice(cells.length).forEach((g, i) => {
    const r = cells[i % cells.length];
    items.push({ id: `cell-${cells.length + i + 1}`, kind: "graph", graphId: g,
      ...r, x: r.x + 4, y: r.y + 4 });
  });
  return { page, items, letters, grid };
}

/** Write a resolved layout back into its sheet, keeping graphIds in sync. */
export function storeLayout(sheet: LayoutSheet, l: ResolvedLayout): LayoutSheet {
  return {
    ...sheet, page: l.page, items: l.items, letters: l.letters, grid: l.grid,
    graphIds: placedGraphIds(l.items),
  };
}

/** Unbind placeholders whose graph no longer exists (deleted sheets). */
export function forgetGraphs(sheet: LayoutSheet, keep: (graphId: string) => boolean):
  LayoutSheet {
  const graphIds = sheet.graphIds.filter(keep);
  const items = sheet.items?.map((it) => (it.kind === "graph" && it.graphId
    && !keep(it.graphId) ? { ...it, graphId: null } : it));
  const changed = graphIds.length !== sheet.graphIds.length
    || (items && sheet.items && items.some((it, i) => it !== sheet.items![i]));
  return changed ? { ...sheet, graphIds, ...(items ? { items } : {}) } : sheet;
}

/** All graph sheet ids of a project, in Graphs-section order. */
export function projectGraphIds(p: Project): string[] {
  return p.sheets.filter((s) => s.kind === "graph").map((s) => s.id);
}

// ------------------------------------------------------------ files

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, lo: number, hi: number, d: number) =>
  (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : d);
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  (allowed.includes(v as T) ? v as T : d);
const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Read the composer fields of a layout sheet from an untrusted file.
 *  Returns only the fields present, so pre-composer files stay as they were. */
export function sanitizeLayoutFields(raw: Record<string, unknown>):
  Pick<LayoutSheet, "page" | "items" | "letters"> {
  const out: Pick<LayoutSheet, "page" | "items" | "letters"> = {};
  if (raw.page !== undefined) {
    const p = obj(raw.page);
    out.page = {
      size: pick(p.size, ["a4", "letter", "custom"] as const, "a4"),
      orientation: pick(p.orientation, ["portrait", "landscape"] as const, "portrait"),
      width: num(p.width, 20, 2000, 210),
      height: num(p.height, 20, 2000, 297),
      margin: num(p.margin, 0, 100, 15),
      background: p.background === "transparent" || (typeof p.background === "string"
        && HEX.test(p.background)) ? p.background as string : "#ffffff",
    };
  }
  if (raw.letters !== undefined) {
    const l = obj(raw.letters);
    out.letters = {
      show: l.show !== false,
      style: pick(l.style, ["upper", "lower"] as const, "upper"),
      format: pick(l.format, ["plain", "paren", "period"] as const, "plain"),
      fontSize: num(l.fontSize, 4, 72, 14),
      bold: l.bold !== false,
      font: pick(l.font, ["sans", "serif"] as const, "sans"),
      position: pick(l.position, ["inside", "outside"] as const, "inside"),
    };
  }
  if (Array.isArray(raw.items)) {
    const items: LayoutItem[] = [];
    const seen = new Set<string>();
    for (const r of raw.items) {
      const it = obj(r);
      const id = typeof it.id === "string" && it.id && !seen.has(it.id) ? it.id : null;
      if (!id) continue;
      seen.add(id);
      const rect = {
        x: num(it.x, 0, 2000, 0), y: num(it.y, 0, 2000, 0),
        w: num(it.w, MIN_ITEM_MM, 2000, 80), h: num(it.h, MIN_ITEM_MM, 2000, 60),
      };
      switch (it.kind) {
        case "graph":
          items.push({ id, kind: "graph", ...rect,
            graphId: typeof it.graphId === "string" ? it.graphId : null,
            ...(it.hideLegend === true ? { hideLegend: true } : {}) });
          break;
        case "picture":
          if (typeof it.svg === "string" && it.svg.trimStart().startsWith("<svg")) {
            items.push({ id, kind: "picture", ...rect, svg: it.svg,
              name: typeof it.name === "string" ? it.name : "Picture" });
          }
          break;
        case "text":
          items.push({ id, kind: "text", ...rect,
            text: typeof it.text === "string" ? it.text : "",
            fontSize: num(it.fontSize, 4, 96, 10), bold: it.bold === true,
            align: pick(it.align, ["left", "center", "right"] as const, "left") });
          break;
        case "legend":
          items.push({ id, kind: "legend", ...rect,
            fontSize: num(it.fontSize, 4, 48, 9), columns: Math.round(num(it.columns, 1, 8, 1)) });
          break;
        default: break;
      }
    }
    out.items = items;
  }
  return out;
}
