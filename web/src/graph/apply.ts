// applyFormat: post-process the Plotly traces and layout a plot panel
// built, according to a GraphFormat. Pure: same inputs, same output, no
// DOM. With an empty format it returns its inputs untouched, so a graph
// nobody has formatted renders exactly as the panel drew it.
//
// Panels tell the layer what each trace is by tagging it (tagTrace): which
// dataset it belongs to and its role. Untagged traces are left alone
// except for axis-wide changes (scales, gaps).
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle, type Chrome, type SchemeId,
} from "../lib/palette.ts";
import {
  axisMap, generateTicks, plotlyNumberAttrs, shortNumber, type AxisMap,
} from "./axes.ts";
import {
  datasetFmt, isDefaultFormat, type Annotation, type AxisFormat, type DatasetFormat,
  type FontFamily, type GraphFormat, type ResultsBlock,
} from "./format.ts";
import { atRisk, censoredBy, type RiskSet } from "./results.ts";
import {
  compactLetters, formatP, lettersInputKey, pairKey, pStars, stackBrackets,
  type Comparison,
} from "./significance.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Trace = Record<string, any>;
export type Layout = Record<string, any>;

/** What a trace draws, so formatting reaches the right attributes. */
export type TraceRole =
  | "points"    // markers (individual values or means), may carry error bars
  | "summary"   // mean/median marker drawn over the points of a column
  | "fit"       // fitted curve
  | "band"      // filled confidence / prediction band
  | "bar" | "box" | "violin"
  | "line"      // a data line (e.g. a survival curve)
  | "outliers"
  | "decor";    // anything else the layer should not restyle

export interface TraceTag {
  /** Dataset index (the key used in GraphFormat.datasets). */
  ds: number;
  role: TraceRole;
  /** Row index of each point (points traces): row-title labels, X error. */
  rows?: number[];
  /** Identity of each point across datasets, e.g. "row:subcolumn"
   *  (column graphs: spaghetti lines join equal keys). */
  keys?: string[];
}

/** Attach a tag (stored in the trace's `meta`, which Plotly ignores). */
export function tagTrace<T extends object>(trace: T, tag: TraceTag): T {
  (trace as Trace).meta = { odTag: tag };
  return trace;
}

export function traceTag(t: Trace): TraceTag | null {
  const tag = t?.meta?.odTag;
  return tag && typeof tag.ds === "number" ? tag as TraceTag : null;
}

export interface FormatContext {
  dark: boolean;
  scheme: SchemeId;
  /** Dataset names by index, as entered (comparisons refer to these). */
  datasets: string[];
  /** Dataset i is drawn around x = i on a category axis (column graphs). */
  categorical?: boolean;
  /** Row titles of the table (point labels). */
  rowTitles?: string[];
  /** Pairwise comparisons available for brackets / letters. */
  comparisons?: Comparison[];
  /** Text blocks for results annotations. */
  results?: Partial<Record<ResultsBlock, string>>;
  /** Survival groups, for the number-at-risk table. */
  riskSets?: RiskSet[];
  /** Position of a group on the X axis, for plots whose groups are not
   *  "dataset i at x = i" (grouped graphs). Return null to skip; return
   *  `{x, xref}` for a group on another X axis (a second panel, "x2"). */
  groupX?: (name: string, family?: string) => GroupPos;
  /** Half the width a group occupies on X (brackets clear the data within
   *  it); default 0.45 (a column graph's slot). */
  groupHalf?: number;
  /** Bumped by the drag handler to snap generated items back. */
  editRevision?: number;
}

/** Where a group sits: an X value on the main X axis, or on another one. */
export type GroupPos = number | { x: number; xref: string } | null;

const toPos = (v: GroupPos | undefined): { x: number; xref: string } | null =>
  v === null || v === undefined ? null
    : typeof v === "number" ? (Number.isFinite(v) ? { x: v, xref: "x" } : null)
      : Number.isFinite(v.x) ? v : null;

export interface Formatted {
  traces: Trace[];
  layout: Layout;
}

const FONTS: Record<FontFamily, string> = {
  inter: PLOT_FONT,
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  arial: "Arial, Helvetica, sans-serif",
  serif: '"Times New Roman", Times, Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

export function fontStack(f: FontFamily | undefined): string {
  return FONTS[f ?? "inter"] ?? PLOT_FONT;
}

export function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+a.toFixed(3)})`;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Which y axis a trace is on. */
const yOf = (t: Trace): "y" | "y2" => (t.yaxis === "y2" ? "y2" : "y");

/** The axis maps a format implies (for converting stored coordinates). */
export function axisMaps(f: GraphFormat): { x: AxisMap; y: AxisMap; y2: AxisMap } {
  return { x: axisMap(f.x), y: axisMap(f.y), y2: axisMap(f.y2) };
}

// =================================================================== main

export function applyFormat(tracesIn: Trace[], layoutIn: Layout, format: GraphFormat,
  ctx: FormatContext): Formatted {
  if (isDefaultFormat(format)) return { traces: tracesIn, layout: layoutIn };
  let traces: Trace[] = structuredClone(tracesIn);
  const layout: Layout = structuredClone(layoutIn);
  const chrome = ctx.dark ? CHROME_DARK : CHROME_LIGHT;
  const maps = axisMaps(format);
  layout.shapes = arr(layout.shapes);
  layout.annotations = arr(layout.annotations);
  const shapesBefore = layout.shapes.length, annBefore = layout.annotations.length;

  // ---- hidden datasets (and datasets used as another one's X error)
  const hidden = new Set<number>();
  const xErrSrc = new Map<number, Map<number, number>>();
  for (let i = 0; i < ctx.datasets.length; i++) {
    const f = datasetFmt(format, i);
    if (f.show === false) hidden.add(i);
    if (isNum(f.xErrorFrom) && f.xErrorFrom !== i) {
      hidden.add(f.xErrorFrom);
      xErrSrc.set(i, pointValuesByRow(traces, f.xErrorFrom));
    }
  }
  if (hidden.size) traces = traces.filter((t) => !hidden.has(traceTag(t)?.ds ?? -1));

  // ---- per-dataset styling
  const out: Trace[] = [];
  for (const t of traces) {
    const tag = traceTag(t);
    if (!tag) { out.push(t); continue; }
    const f = datasetFmt(format, tag.ds);
    const orig = seriesStyle(tag.ds, ctx.dark, ctx.scheme).color;
    const base = f.color ?? orig;
    styleTrace(t, tag, f, orig, base, chrome, ctx, xErrSrc.get(tag.ds), out);
  }
  traces = out;

  // ---- plotting order, hidden columns and spacing on category axes
  const visible = ctx.datasets.map((_, i) => i).filter((i) => !hidden.has(i));
  const ordered = orderOf(format.order, visible);
  const pos = new Map<number, number>();
  ordered.forEach((ds, k) => pos.set(ds, k));
  if (ctx.categorical) {
    const moved = ordered.some((ds, k) => ds !== k) || hidden.size > 0;
    if (moved) recategorize(traces, layout, pos, ctx.datasets.length);
    if (isNum(format.spacing)) {
      const w = Math.max(0.05, 1 - format.spacing);
      for (const t of traces) {
        const tag = traceTag(t);
        if (tag && (tag.role === "bar" || tag.role === "box" || tag.role === "violin")) {
          t.width = w;
        }
      }
    }
  }
  if (format.order && format.order.length) {
    const rank = (t: Trace) => { const g = traceTag(t); return g ? (pos.get(g.ds) ?? 1e6) : -1; };
    traces = traces.map((t, i) => ({ t, i, r: rank(t) }))
      .sort((a, b) => a.r - b.r || a.i - b.i).map((e) => e.t);
  }
  // nudges (after positions are final)
  for (const t of traces) {
    const tag = traceTag(t);
    const n = tag ? datasetFmt(format, tag.ds).nudge : undefined;
    if (tag && isNum(n) && n !== 0) shiftX(t, n);
  }

  // ---- lines joining columns (category graphs)
  if (ctx.categorical && format.connect && format.connect !== "none") {
    const center = (ds: number) => (pos.get(ds) ?? ds) + (datasetFmt(format, ds).nudge ?? 0);
    traces = connectColumns(traces, format.connect, chrome, center);
  }

  // ---- data extents (data units), before any transform
  const ext = {
    x: extent(traces, "x"), y: extent(traces, "y"), y2: extent(traces, "y2"),
  };

  // ---- reference lines (data units -> axis units)
  if (format.identityLine) {
    const lo = Math.min(ext.x.min, ext.y.min), hi = Math.max(ext.x.max, ext.y.max);
    const x0 = maps.x.to(lo), x1 = maps.x.to(hi), y0 = maps.y.to(lo), y1 = maps.y.to(hi);
    if ([x0, x1, y0, y1].every(isNum)) {
      layout.shapes.push({ type: "line", xref: "x", yref: "y", x0, x1, y0, y1,
        line: { color: chrome.muted, width: 1, dash: "dash" }, layer: "below" });
    }
  }
  if (format.centralLine && format.centralLine !== "none") {
    const vals = traces.filter((t) => traceTag(t)?.role === "points" && yOf(t) === "y")
      .flatMap((t) => arr(t.y).filter(isNum));
    if (vals.length) {
      const c = format.centralLine === "mean"
        ? vals.reduce((a, b) => a + b, 0) / vals.length : median(vals);
      const yv = maps.y.to(c);
      if (isNum(yv)) {
        layout.shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1,
          y0: yv, y1: yv, line: { color: chrome.inkSecondary, width: 1.25, dash: "dash" },
          layer: "below" });
      }
    }
  }

  // ---- right Y axis
  const hasY2 = traces.some((t) => t.yaxis === "y2");
  if (hasY2) {
    const y = layout.yaxis ?? {};
    layout.yaxis2 = {
      overlaying: "y", side: "right", showgrid: false, zeroline: false,
      linecolor: y.linecolor ?? chrome.axis, tickcolor: y.tickcolor ?? chrome.axis,
      tickfont: { ...(y.tickfont ?? {}) },
      title: { text: format.y2?.title ?? "", font: { ...(y.title?.font ?? {}) } },
    };
    layout.margin = { ...(layout.margin ?? {}), r: Math.max(layout.margin?.r ?? 16, 64) };
  }

  // ---- transformed scales: rewrite the data
  for (const which of ["x", "y", "y2"] as const) {
    const m = maps[which];
    if (m.native) continue;
    for (const t of traces) {
      if (which === "x") transformTrace(t, "x", m);
      else if (yOf(t) === which) transformTrace(t, "y", m);
    }
  }

  // ---- axes
  const axisKey = { x: "xaxis", y: "yaxis", y2: "yaxis2" } as const;
  const axisRanges: Partial<Record<"x" | "y" | "y2", [number, number]>> = {};
  for (const which of ["x", "y", "y2"] as const) {
    const a = format[which];
    const key = axisKey[which];
    if (which === "y2" && !layout.yaxis2) continue;
    const range = axisRange(a, ext[which], maps[which]);
    if (range) axisRanges[which] = range;
    if (a) layout[key] = formatAxis(layout[key] ?? {}, a, maps[which], range, chrome);
  }

  // ---- extra ticks
  for (const which of ["x", "y"] as const) {
    for (const tk of format[which]?.extraTicks ?? []) {
      const v = maps[which].to(tk.value);
      if (!isNum(v)) continue;
      extraTick(layout, which, v, tk.label || shortNumber(tk.value), !!tk.grid, chrome);
    }
  }

  // ---- comparisons: brackets and letters
  const groupX = ctx.groupX ?? (ctx.categorical
    ? (name: string, family?: string) => {
      if (family) return null;
      const i = ctx.datasets.indexOf(name);
      return i >= 0 && pos.has(i) ? pos.get(i)! : null;
    } : undefined);
  if (groupX && ctx.comparisons?.length) {
    const yr = axisRanges.y;
    const span = (yr ? yr[1] - yr[0] : 0) || spanOf(traces, maps.y) || 1;
    const half = ctx.groupHalf ?? 0.45;
    const top = (lo: number, hi: number, xref = "x") =>
      topBetween(traces, lo - half, hi + half, yr, maps.y, xref);
    if (format.comparisons?.show) {
      drawBrackets(layout, format, ctx.comparisons, groupX, top, span, chrome);
    }
    if (format.letters?.show) {
      drawLetters(layout, format, ctx, groupX, top, span, ordered, chrome);
    }
  }

  // ---- number at risk table
  if (format.atRisk?.show && ctx.riskSets?.length) {
    drawAtRisk(layout, format, ctx, ext.x, chrome);
  }

  // ---- user annotations
  const userAnns = format.annotations ?? [];
  for (const a of userAnns) addAnnotation(layout, a, maps, ctx, chrome);
  if (userAnns.length) layout.editrevision = String(ctx.editRevision ?? 0);

  // ---- discontinuous Y axis
  const gap = format.y?.gap;
  if (gap && gap.to > gap.from) splitAxis(layout, traces, gap, maps.y, ext.y, format.y!);

  // ---- frame and origin
  if (format.frame && format.frame !== "auto") frame(layout, format.frame, chrome);
  if (format.origin === "zero") {
    for (const k of ["xaxis", "yaxis"]) {
      layout[k] = { ...(layout[k] ?? {}), zeroline: true,
        zerolinecolor: chrome.inkSecondary, zerolinewidth: 1 };
    }
  }

  // ---- fonts, legend, title
  fonts(layout, format);
  legend(layout, traces, format, ctx, chrome);
  if (format.title) {
    const size = format.font?.titleSize ?? 16;
    layout.title = { text: format.title, x: 0.5, xanchor: "center",
      yref: "container", y: 0.985, yanchor: "top",
      font: { size, color: chrome.ink } };
    layout.margin = { ...(layout.margin ?? {}), t: Math.max(layout.margin?.t ?? 8, size + 26) };
  }

  if (layout.shapes.length === 0 && shapesBefore === 0 && !("shapes" in layoutIn)) delete layout.shapes;
  if (layout.annotations.length === 0 && annBefore === 0 && !("annotations" in layoutIn)) {
    delete layout.annotations;
  }
  return { traces, layout };
}

// ============================================================ datasets

function pointValuesByRow(traces: Trace[], ds: number): Map<number, number> {
  const m = new Map<number, number>();
  for (const t of traces) {
    const tag = traceTag(t);
    if (!tag || tag.ds !== ds || tag.role !== "points" || !tag.rows) continue;
    tag.rows.forEach((r, k) => { const v = t.y?.[k]; if (isNum(v)) m.set(r, v); });
  }
  return m;
}

function recolor(v: unknown, orig: string, next: string): unknown {
  // Per-point colour arrays (grouped bars) recolour element by element.
  if (Array.isArray(v)) return v.map((c) => recolor(c, orig, next));
  if (typeof v !== "string" || orig === next) return v;
  return v.toLowerCase().startsWith(orig.toLowerCase()) ? next + v.slice(orig.length) : v;
}

function recolorTrace(t: Trace, orig: string, next: string) {
  if (t.marker) {
    t.marker.color = recolor(t.marker.color, orig, next);
    if (t.marker.line) t.marker.line.color = recolor(t.marker.line.color, orig, next);
  }
  if (t.line) t.line.color = recolor(t.line.color, orig, next);
  t.fillcolor = recolor(t.fillcolor, orig, next);
  if (t.fillcolor === undefined) delete t.fillcolor;
  if (t.error_y) t.error_y.color = recolor(t.error_y.color, orig, next);
  if (t.error_x) t.error_x.color = recolor(t.error_x.color, orig, next);
}

/** Reorder every per-point array of a trace. */
function permutePoints(t: Trace, idx: number[], tag: TraceTag) {
  const p = (a: unknown) => (Array.isArray(a) && a.length === idx.length ? idx.map((i) => a[i]) : a);
  t.x = p(t.x); t.y = p(t.y); t.text = p(t.text); t.customdata = p(t.customdata);
  if (t.customdata === undefined) delete t.customdata;
  if (t.text === undefined) delete t.text;
  for (const e of ["error_y", "error_x"]) {
    if (t[e]) { t[e].array = p(t[e].array); t[e].arrayminus = p(t[e].arrayminus); }
    if (t[e] && t[e].arrayminus === undefined) delete t[e].arrayminus;
  }
  if (tag.rows) tag.rows = p(tag.rows) as number[];
  if (tag.keys) tag.keys = p(tag.keys) as string[];
}

function styleTrace(t: Trace, tag: TraceTag, f: DatasetFormat, orig: string, base: string,
  chrome: Chrome, ctx: FormatContext, xErr: Map<number, number> | undefined, out: Trace[]) {
  if (f.color) recolorTrace(t, orig, f.color);
  const role = tag.role;
  const alpha = f.fillAlpha;

  if (role === "points") {
    t.marker = t.marker ?? {};
    if (f.symbol) t.marker.symbol = f.symbol;
    if (isNum(f.size)) t.marker.size = f.size;
    if (isNum(alpha)) {
      t.marker.color = rgba(base, alpha);
      // A see-through marker needs a visible edge in its own colour.
      if (!f.borderColor && alpha < 0.5) {
        t.marker.line = { ...(t.marker.line ?? {}), color: base,
          width: Math.max(1.5, t.marker.line?.width ?? 0) };
      }
    }
    if (f.borderColor || isNum(f.borderWidth)) {
      t.marker.line = { ...(t.marker.line ?? {}) };
      if (f.borderColor) t.marker.line.color = f.borderColor;
      if (isNum(f.borderWidth)) t.marker.line.width = f.borderWidth;
    }
    if (f.connect && f.connect !== "none") {
      const xs = arr(t.x);
      const idx = xs.map((_, i) => i).sort((a, b) => (xs[a] ?? 0) - (xs[b] ?? 0));
      permutePoints(t, idx, tag);
      t.mode = String(t.mode ?? "markers").includes("lines") ? t.mode : `lines+${t.mode ?? "markers"}`;
      t.line = { ...(t.line ?? {}), color: base, width: f.lineWidth ?? 1.5,
        dash: f.lineDash ?? "solid", shape: f.connect };
    }
    if (f.labelPoints && tag.rows && ctx.rowTitles) {
      t.text = tag.rows.map((r) => ctx.rowTitles?.[r] ?? "");
      t.mode = `${t.mode ?? "markers"}+text`;
      t.textposition = "top center";
      t.textfont = { size: 11, color: chrome.inkSecondary };
    }
    if (xErr && tag.rows) {
      t.error_x = { type: "data", array: tag.rows.map((r) => xErr.get(r) ?? 0),
        color: base, thickness: f.errorWidth ?? 1.5, width: f.errorCap ?? 4, visible: true };
    }
  }
  if (role === "bar") {
    t.marker = t.marker ?? {};
    if (isNum(alpha)) t.marker.color = rgba(base, alpha);
    if (f.borderColor || isNum(f.borderWidth)) {
      t.marker.line = { ...(t.marker.line ?? {}) };
      if (f.borderColor) t.marker.line.color = f.borderColor;
      if (isNum(f.borderWidth)) t.marker.line.width = f.borderWidth;
    }
    if (f.pattern) {
      t.marker.pattern = { shape: f.pattern, fgcolor: f.borderColor ?? base,
        fillmode: "overlay", solidity: 0.35 };
    }
  }
  if (role === "box" || role === "violin") {
    if (isNum(alpha)) t.fillcolor = rgba(base, alpha);
    if (f.borderColor || isNum(f.borderWidth)) {
      t.line = { ...(t.line ?? {}) };
      if (f.borderColor) t.line.color = f.borderColor;
      if (isNum(f.borderWidth)) t.line.width = f.borderWidth;
    }
    if (t.marker) {
      if (f.symbol) t.marker.symbol = f.symbol;
      if (isNum(f.size)) t.marker.size = f.size;
    }
  }
  if (role === "band" && isNum(alpha)) t.fillcolor = rgba(base, alpha);
  if (role === "fit" || role === "line") {
    t.line = { ...(t.line ?? {}) };
    if (f.lineDash) t.line.dash = f.lineDash;
    if (isNum(f.lineWidth)) t.line.width = f.lineWidth;
  }

  // error bars
  const ey = t.error_y;
  if (ey && ey.visible !== false && Array.isArray(ey.array)) {
    if (isNum(f.errorCap)) ey.width = f.errorCap;
    if (isNum(f.errorWidth)) ey.thickness = f.errorWidth;
    const plus: number[] = ey.array.map((v: unknown) => (isNum(v) ? v : 0));
    const minus: number[] = Array.isArray(ey.arrayminus)
      ? ey.arrayminus.map((v: unknown) => (isNum(v) ? v : 0)) : plus;
    if (f.errorDir === "up") { ey.symmetric = false; ey.arrayminus = plus.map(() => 0); }
    if (f.errorDir === "down") {
      ey.symmetric = false; ey.arrayminus = minus; ey.array = plus.map(() => 0);
    }
    if (f.errorDir === "none") ey.visible = false;
    if (f.errorStyle === "envelope" && f.errorDir !== "none") {
      const up = f.errorDir === "down" ? plus.map(() => 0) : plus;
      const dn = f.errorDir === "up" ? minus.map(() => 0) : minus;
      const xs = arr(t.x);
      const idx = xs.map((_, i) => i).filter((i) => isNum(xs[i]) && isNum(t.y?.[i]))
        .sort((a, b) => xs[a] - xs[b]);
      const bx = idx.map((i) => xs[i]);
      out.push({
        x: [...bx, ...[...bx].reverse()],
        y: [...idx.map((i) => t.y[i] + up[i]), ...[...idx].reverse().map((i) => t.y[i] - dn[i])],
        mode: "lines", fill: "toself",
        fillcolor: rgba(base, isNum(alpha) ? Math.min(alpha, 0.35) : 0.18),
        line: { width: 0 }, hoverinfo: "skip", showlegend: false,
        ...(t.yaxis ? { yaxis: t.yaxis } : {}),
        meta: { odTag: { ds: tag.ds, role: "band" } },
      });
      ey.visible = false;
    }
  }

  if (f.rightAxis) t.yaxis = "y2";
  if (f.legend !== undefined && t.name !== undefined) t.name = f.legend;
  out.push(t);
}

/** Indices of the datasets shown, in plotting order (hidden ones and X-
 *  error sources left out), for `n` datasets. */
export function plottedOrder(format: GraphFormat, n: number): number[] {
  const hidden = new Set<number>();
  for (let i = 0; i < n; i++) {
    const f = datasetFmt(format, i);
    if (f.show === false) hidden.add(i);
    if (isNum(f.xErrorFrom) && f.xErrorFrom !== i) hidden.add(f.xErrorFrom);
  }
  return orderOf(format.order, Array.from({ length: n }, (_, i) => i).filter((i) => !hidden.has(i)));
}

function orderOf(order: number[] | null | undefined, visible: number[]): number[] {
  const vis = new Set(visible);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const i of order ?? []) if (vis.has(i) && !seen.has(i)) { out.push(i); seen.add(i); }
  for (const i of visible) if (!seen.has(i)) out.push(i);
  return out;
}

/** Move dataset i's traces from x ≈ i to its new slot. */
function recategorize(traces: Trace[], layout: Layout, pos: Map<number, number>, n: number) {
  for (const t of traces) {
    const tag = traceTag(t);
    if (!tag) continue;
    const p = pos.get(tag.ds);
    if (p === undefined) continue;
    const d = p - tag.ds;
    if (d) shiftX(t, d);
  }
  const xa = layout.xaxis;
  if (xa && Array.isArray(xa.tickvals)) {
    const text = arr(xa.ticktext);
    const pairs = xa.tickvals.map((v: number, k: number) => ({ p: pos.get(v), t: text[k] }))
      .filter((e: { p?: number }) => e.p !== undefined)
      .sort((a: { p: number }, b: { p: number }) => a.p - b.p);
    xa.tickvals = pairs.map((e: { p: number }) => e.p);
    xa.ticktext = pairs.map((e: { t: string }) => e.t);
  }
  if (xa && Array.isArray(xa.range) && pos.size < n) {
    xa.range = [-0.6, Math.max(pos.size, 1) - 0.4];
  }
}

function shiftX(t: Trace, d: number) {
  if (Array.isArray(t.x)) t.x = t.x.map((v: unknown) => (isNum(v) ? v + d : v));
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function connectColumns(traces: Trace[], mode: "mean" | "median" | "spaghetti",
  chrome: Chrome, centerOf: (ds: number) => number): Trace[] {
  const pts = traces.filter((t) => traceTag(t)?.role === "points");
  if (mode === "spaghetti") {
    const byKey = new Map<string, { x: number; y: number }[]>();
    for (const t of pts) {
      const tag = traceTag(t)!;
      if (!tag.keys) continue;
      const center = centerOf(tag.ds);
      // Join the actual subjects: drop the jitter so lines meet the points.
      t.x = arr(t.x).map((v) => (isNum(v) ? center : v));
      tag.keys.forEach((k, i) => {
        const y = t.y?.[i];
        if (!isNum(y)) return;
        (byKey.get(k) ?? byKey.set(k, []).get(k)!).push({ x: center, y });
      });
    }
    const xs: (number | null)[] = [], ys: (number | null)[] = [];
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.x - b.x);
      for (const p of list) { xs.push(p.x); ys.push(p.y); }
      xs.push(null); ys.push(null);
    }
    if (!xs.length) return traces;
    return [{ x: xs, y: ys, mode: "lines", line: { color: chrome.muted, width: 1 },
      hoverinfo: "skip", showlegend: false, meta: { odTag: { ds: -1, role: "decor" } } },
    ...traces];
  }
  const centers: { x: number; y: number }[] = [];
  const groups = new Map<number, { x: number[]; y: number[] }>();
  for (const t of pts) {
    const tag = traceTag(t)!;
    const g = groups.get(tag.ds) ?? groups.set(tag.ds, { x: [], y: [] }).get(tag.ds)!;
    arr(t.x).forEach((x, i) => { const y = t.y?.[i]; if (isNum(x) && isNum(y)) { g.x.push(x); g.y.push(y); } });
  }
  for (const [ds, g] of groups) {
    if (!g.y.length) continue;
    const x = centerOf(ds);
    const y = mode === "mean" ? g.y.reduce((a, b) => a + b, 0) / g.y.length : median(g.y);
    centers.push({ x, y });
  }
  centers.sort((a, b) => a.x - b.x);
  if (centers.length < 2) return traces;
  return [...traces, { x: centers.map((c) => c.x), y: centers.map((c) => c.y), mode: "lines",
    line: { color: chrome.inkSecondary, width: 1.5 }, hoverinfo: "skip", showlegend: false,
    meta: { odTag: { ds: -1, role: "decor" } } }];
}

// ============================================================ extents

interface Extent { min: number; max: number; values: number[] }

function valuesOf(t: Trace, which: "x" | "y"): number[] {
  const v = arr(t[which]);
  const e = which === "y" ? t.error_y : t.error_x;
  const out: number[] = [];
  v.forEach((val, i) => {
    if (!isNum(val)) return;
    out.push(val);
    if (e && e.visible !== false && Array.isArray(e.array)) {
      const p = e.array[i], m = Array.isArray(e.arrayminus) ? e.arrayminus[i] : p;
      if (isNum(p)) out.push(val + p);
      if (isNum(m)) out.push(val - m);
    }
  });
  return out;
}

function extent(traces: Trace[], which: "x" | "y" | "y2"): Extent {
  let min = Infinity, max = -Infinity;
  const values: number[] = [];
  for (const t of traces) {
    if (which !== "x" && yOf(t) !== which) continue;
    for (const v of valuesOf(t, which === "x" ? "x" : "y")) {
      if (v < min) min = v;
      if (v > max) max = v;
      values.push(v);
    }
  }
  return { min, max, values };
}

/** Span of the primary Y data in axis units; bars count from their base
 *  (0), since that is what the axis shows. */
function spanOf(traces: Trace[], m: AxisMap): number {
  let lo = Infinity, hi = -Infinity;
  for (const t of traces) {
    if (yOf(t) !== "y") continue;
    const vals = valuesOf(t, "y");
    if (t.type === "bar") vals.push(0);
    for (const v of vals) {
      const w = m.native ? m.to(v) : v; // transformed traces are already in axis units
      if (!isNum(w)) continue;
      lo = Math.min(lo, w); hi = Math.max(hi, w);
    }
  }
  return Number.isFinite(hi - lo) ? hi - lo : 0;
}

/** Visible range in axis units: manual ends, the other end from the data. */
function axisRange(a: AxisFormat | undefined, e: Extent, m: AxisMap): [number, number] | null {
  const lo = a?.min, hi = a?.max;
  const needAuto = !isNum(lo) || !isNum(hi);
  let dlo = Infinity, dhi = -Infinity;
  if (needAuto) {
    // a log axis cannot show 0 or negatives: those values drop out here
    for (const v of e.values) {
      const w = m.to(v);
      if (!isNum(w)) continue;
      if (w < dlo) dlo = w;
      if (w > dhi) dhi = w;
    }
  }
  const pad = Number.isFinite(dhi - dlo) ? (dhi - dlo || Math.abs(dhi) || 1) * 0.05 : 0;
  const r0 = isNum(lo) ? m.to(lo) : (Number.isFinite(dlo) ? dlo - pad : null);
  const r1 = isNum(hi) ? m.to(hi) : (Number.isFinite(dhi) ? dhi + pad : null);
  if (!isNum(r0) || !isNum(r1) || r0 === r1) return null;
  if (!isNum(lo) && !isNum(hi) && !needsRange(a)) return null;
  return [r0, r1];
}

/** Whether we must know the range ourselves (generated ticks, gaps). */
function needsRange(a: AxisFormat | undefined): boolean {
  if (!a) return false;
  const s = a.scale ?? "linear";
  return s === "log2" || s === "ln" || s === "probability"
    || a.numbers === "antilog" || a.numbers === "elapsed" || !!a.gap;
}

/** Highest point (axis units, primary Y) between two X positions. */
function topBetween(traces: Trace[], lo: number, hi: number,
  range: [number, number] | undefined, m: AxisMap, xref = "x"): number {
  let top = -Infinity;
  for (const t of traces) {
    if (yOf(t) !== "y") continue;
    if ((t.xaxis ?? "x") !== xref) continue;
    const tag = traceTag(t);
    if (tag?.role === "decor" || tag?.role === "band") continue;
    const xs = arr(t.x), ys = arr(t.y);
    const ey = t.error_y && t.error_y.visible !== false ? t.error_y : null;
    ys.forEach((y, i) => {
      const x = xs[i];
      if (!isNum(x) || !isNum(y) || x < lo || x > hi) return;
      const up = ey && Array.isArray(ey.array) && isNum(ey.array[i]) ? ey.array[i] : 0;
      // native axes keep data units in the traces; shapes need axis units
      const w = m.native ? m.to(y + up) : y + up;
      if (isNum(w)) top = Math.max(top, w);
    });
  }
  if (!Number.isFinite(top)) top = range ? range[0] : 0;
  return top;
}

// ============================================================ transforms

function transformTrace(t: Trace, which: "x" | "y", m: AxisMap) {
  const v = arr(t[which]);
  if (!v.length) return;
  const errKey = which === "y" ? "error_y" : "error_x";
  const e = t[errKey];
  if (e && Array.isArray(e.array)) {
    const plus = e.array, minus = Array.isArray(e.arrayminus) ? e.arrayminus : e.array;
    const np: number[] = [], nm: number[] = [];
    v.forEach((val, i) => {
      const c = isNum(val) ? m.to(val) : null;
      const hi = isNum(val) && isNum(plus[i]) ? m.to(val + plus[i]) : null;
      const lo = isNum(val) && isNum(minus[i]) ? m.to(val - minus[i]) : null;
      np.push(isNum(c) && isNum(hi) ? hi - c : 0);
      nm.push(isNum(c) && isNum(lo) ? c - lo : 0);
    });
    e.array = np; e.arrayminus = nm; e.symmetric = false;
  }
  if (which === "y" && typeof t.hovertemplate === "string" && t.hovertemplate.includes("%{y")
    && t.customdata === undefined) {
    t.customdata = v.slice();
    t.hovertemplate = t.hovertemplate.replace(/%\{y/g, "%{customdata");
  }
  t[which] = v.map((val) => (isNum(val) ? m.to(val) : val));
}

// ============================================================ axes

function formatAxis(axIn: Layout, a: AxisFormat, m: AxisMap, range: [number, number] | null,
  chrome: Chrome): Layout {
  const ax: Layout = { ...axIn };
  if (a.hide) return { ...ax, visible: false };
  if (m.scale === "log10") ax.type = "log";
  if (a.numbers === "date") ax.type = "date";
  const manual = isNum(a.min) || isNum(a.max);
  if (range && (manual || needsRange(a))) {
    ax.range = range;
    ax.autorange = false;
  }
  const gen = range ? generateTicks(a, Math.min(...range), Math.max(...range)) : null;
  if (gen) {
    ax.tickmode = "array";
    ax.tickvals = gen.tickvals;
    ax.ticktext = gen.ticktext;
    delete ax.dtick; delete ax.tick0;
  } else {
    Object.assign(ax, plotlyNumberAttrs(a));
    // Powers of ten read best one per decade (no 2, 5 subdivisions).
    const step = isNum(a.majorStep) && a.majorStep > 0 ? a.majorStep
      : m.scale === "log10" && a.numbers === "power10" ? 1 : null;
    if (step) {
      ax.tickmode = "linear";
      ax.dtick = step;
      ax.tick0 = 0;
    }
  }
  const tickDir = a.ticks === "in" ? "inside" : a.ticks === "none" ? "" : a.ticks === "out" ? "outside" : undefined;
  if (tickDir !== undefined) {
    ax.ticks = tickDir;
    ax.tickcolor = ax.tickcolor ?? chrome.axis;
  }
  if (isNum(a.tickLen)) ax.ticklen = a.tickLen;
  if (a.grid !== undefined) ax.showgrid = a.grid;
  const minorN = a.minorCount ?? 0;
  if (minorN > 0 || a.minorGrid) {
    const minor: Layout = {
      ticks: minorN > 0 ? (tickDir || "outside") : "",
      ticklen: Math.max(2, (isNum(a.tickLen) ? a.tickLen : 5) * 0.6),
      tickcolor: ax.tickcolor ?? chrome.axis,
      showgrid: !!a.minorGrid,
      gridcolor: chrome.grid,
      griddash: "dot",
    };
    if (gen?.minor) { minor.tickmode = "array"; minor.tickvals = gen.minor; }
    else if (m.scale === "log10") { minor.dtick = "D1"; }
    else if (isNum(a.majorStep) && a.majorStep > 0 && minorN > 0) {
      minor.dtick = a.majorStep / (minorN + 1);
    } else if (minorN > 0) minor.nticks = minorN + 1;
    ax.minor = minor;
  }
  if (isNum(a.titleSize)) {
    ax.title = { ...(ax.title ?? {}), font: { ...(ax.title?.font ?? {}), size: a.titleSize } };
  }
  return ax;
}

function extraTick(layout: Layout, which: "x" | "y", v: number, label: string, grid: boolean,
  chrome: Chrome) {
  const line = { color: chrome.inkSecondary, width: 1 };
  if (which === "x") {
    layout.shapes.push({ type: "line", xref: "x", yref: "paper", x0: v, x1: v,
      ysizemode: "pixel", yanchor: 0, y0: 0, y1: -6, line });
    if (grid) {
      layout.shapes.push({ type: "line", xref: "x", yref: "paper", x0: v, x1: v, y0: 0, y1: 1,
        line: { color: chrome.muted, width: 1, dash: "dot" }, layer: "below" });
    }
    layout.annotations.push({ xref: "x", yref: "paper", x: v, y: 0, yanchor: "top",
      yshift: -8, text: label, showarrow: false, font: { color: chrome.ink, size: 12 } });
  } else {
    layout.shapes.push({ type: "line", xref: "paper", yref: "y", y0: v, y1: v,
      xsizemode: "pixel", xanchor: 0, x0: 0, x1: -6, line });
    if (grid) {
      layout.shapes.push({ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: v, y1: v,
        line: { color: chrome.muted, width: 1, dash: "dot" }, layer: "below" });
    }
    layout.annotations.push({ xref: "paper", yref: "y", x: 0, y: v, xanchor: "right",
      xshift: -8, text: label, showarrow: false, font: { color: chrome.ink, size: 12 } });
  }
}

// ============================================================ comparisons

function drawBrackets(layout: Layout, format: GraphFormat, comparisons: Comparison[],
  groupX: (name: string, family?: string) => GroupPos,
  top: (lo: number, hi: number, xref?: string) => number, span: number, chrome: Chrome) {
  const c = format.comparisons!;
  const hidden = new Set(c.hidden ?? []);
  const items = comparisons
    .filter((cmp) => !hidden.has(pairKey(cmp)))
    .filter((cmp) => !isNum(c.threshold) || cmp.p < c.threshold)
    .map((cmp) => ({ cmp, p0: toPos(groupX(cmp.a, cmp.family)),
      p1: toPos(groupX(cmp.b, cmp.family)) }))
    .filter((e) => e.p0 && e.p1 && e.p0.xref === e.p1.xref && e.p0.x !== e.p1.x)
    .map((e) => ({
      key: pairKey(e.cmp), x0: e.p0!.x, x1: e.p1!.x, xref: e.p0!.xref,
      label: c.display === "p" ? formatP(e.cmp.p, c.prefix ?? "P = ") : pStars(e.cmp.p),
    }));
  if (!items.length) return;
  // One tier must clear a label (~16 px) on a plot a few hundred px tall.
  const step = span * 0.1;
  // Each X axis (panel) stacks its own brackets.
  const placed = [...new Set(items.map((i) => i.xref))].flatMap((xref) =>
    stackBrackets(items.filter((i) => i.xref === xref),
      (lo, hi) => top(lo, hi, xref), step).map((b) => ({ ...b, xref })));
  const color = c.color ?? chrome.ink;
  const line = { color, width: c.lineWidth ?? 1.2 };
  const tick = c.style === "tall" ? step * 0.6 : step * 0.22;
  for (const b of placed) {
    layout.shapes.push({ type: "line", xref: b.xref, yref: "y", x0: b.lo, x1: b.hi,
      y0: b.y, y1: b.y, line, name: "bracket" });
    if (c.style !== "line") {
      for (const x of [b.lo, b.hi]) {
        layout.shapes.push({ type: "line", xref: b.xref, yref: "y", x0: x, x1: x,
          y0: b.y, y1: b.y - tick, line, name: "bracket" });
      }
    }
    layout.annotations.push({ xref: b.xref, yref: "y", x: (b.lo + b.hi) / 2, y: b.y,
      yanchor: "bottom", yshift: c.display === "p" ? 2 : -1, showarrow: false,
      text: b.label, name: "bracket-label",
      font: { size: c.textSize ?? (c.display === "p" ? 11 : 14), color } });
  }
}

function drawLetters(layout: Layout, format: GraphFormat, ctx: FormatContext,
  groupX: (name: string, family?: string) => GroupPos,
  top: (lo: number, hi: number, xref?: string) => number, span: number, ordered: number[],
  chrome: Chrome) {
  const l = format.letters!;
  const alpha = l.alpha ?? 0.05;
  const groups = ordered.map((i) => ctx.datasets[i]);
  const cmps = (ctx.comparisons ?? []).filter((c) => !c.family);
  const letters = lettersFor(groups, cmps, alpha, l.style ?? "lower", l.engine);
  groups.forEach((name, k) => {
    const p = toPos(groupX(name));
    if (!p || !letters[k]) return;
    const { x, xref } = p;
    layout.annotations.push({ xref, yref: "y", x, y: top(x, x, xref) + span * 0.03,
      yanchor: "bottom", showarrow: false, text: letters[k], name: "letters",
      font: { size: l.size ?? 14, color: l.color ?? chrome.ink } });
  });
}

/** Letters for `groups` (in plotting order): the engine's answer when it
 *  is cached for exactly this input, else the client-side algorithm. */
export function lettersFor(groups: string[], comparisons: Comparison[], alpha: number,
  style: "lower" | "upper" | "numbers" = "lower",
  engine?: { input: string; letters: string[] } | null): string[] {
  if (engine && engine.input === lettersInputKey(groups, comparisons, alpha)
    && engine.letters.length === groups.length) {
    return engine.letters.map((s) => (style === "upper" ? s.toUpperCase()
      : style === "lower" ? s.toLowerCase() : s));
  }
  const idx = new Map(groups.map((g, i) => [g, i]));
  const sig: [number, number][] = [];
  for (const c of comparisons) {
    const i = idx.get(c.a), j = idx.get(c.b);
    if (i !== undefined && j !== undefined && c.p < alpha) sig.push([i, j]);
  }
  return compactLetters(groups.length, sig, style);
}

// ============================================================ at risk

function drawAtRisk(layout: Layout, format: GraphFormat, ctx: FormatContext, ex: Extent,
  chrome: Chrome) {
  const r = format.atRisk!;
  const sets = ctx.riskSets!;
  const xa = format.x ?? {};
  const maxT = isNum(xa.max) ? xa.max : Math.max(...sets.flatMap((s) => s.times), ex.max);
  const minT = isNum(xa.min) ? xa.min : 0;
  let step = isNum(xa.majorStep) && xa.majorStep > 0 ? xa.majorStep : niceTick(maxT - minT);
  if (!(step > 0)) step = 1;
  const ticks: number[] = [];
  for (let t = Math.ceil(minT / step) * step; t <= maxT + 1e-9 && ticks.length < 40; t += step) {
    ticks.push(Number(t.toPrecision(12)));
  }
  // Pin the axis ticks to the table's columns.
  layout.xaxis = { ...(layout.xaxis ?? {}), tickmode: "linear", tick0: 0, dtick: step };
  const size = r.size ?? 11;
  const lh = Math.round(size * 1.55);
  const base = 58;
  const rows = sets.length + (r.title !== false ? 1 : 0);
  const font = (color: string) => ({ size, color });
  let row = 0;
  if (r.title !== false) {
    layout.annotations.push({ xref: "paper", yref: "paper", x: 0, y: 0, xanchor: "right",
      yanchor: "top", xshift: -6, yshift: -(base + row * lh), showarrow: false,
      text: "<b>Number at risk</b>", font: font(chrome.inkSecondary), name: "at-risk" });
    row++;
  }
  sets.forEach((s, gi) => {
    const di = ctx.datasets.indexOf(s.name);
    const idx = di >= 0 ? di : gi;
    const color = r.byGroup === false ? chrome.ink
      : datasetFmt(format, idx).color ?? seriesStyle(idx, ctx.dark, ctx.scheme).color;
    const y = -(base + row * lh);
    layout.annotations.push({ xref: "paper", yref: "paper", x: 0, y: 0, xanchor: "right",
      yanchor: "top", xshift: -6, yshift: y, showarrow: false, text: s.name,
      font: font(color), name: "at-risk" });
    for (const t of ticks) {
      const n = atRisk(s, t);
      const text = r.censored ? `${n} (${censoredBy(s, t)})` : String(n);
      layout.annotations.push({ xref: "x", yref: "paper", x: t, y: 0, yanchor: "top",
        yshift: y, showarrow: false, text, font: font(color), name: "at-risk" });
    }
    row++;
  });
  const longest = Math.max(...sets.map((s) => s.name.length), r.title !== false ? 14 : 0);
  layout.margin = {
    ...(layout.margin ?? {}),
    b: Math.max(layout.margin?.b ?? 48, base + rows * lh + 6),
    l: Math.max(layout.margin?.l ?? 60, Math.round(longest * size * 0.62) + 14),
  };
}

function niceTick(span: number): number {
  if (!(span > 0)) return 1;
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

// ============================================================ annotations

function addAnnotation(layout: Layout, a: Annotation, maps: { x: AxisMap; y: AxisMap },
  ctx: FormatContext, chrome: Chrome) {
  const data = a.ref === "data";
  const X = (v: number) => (data ? maps.x.to(v) ?? v : v);
  const Y = (v: number) => (data ? maps.y.to(v) ?? v : v);
  // Plot-area coordinates: "paper" (0-1 across the plotting area). An
  // arrow's tail needs an axis-based reference, so arrows use the axis
  // domain, which is the same area unless the axes are offset or split.
  const xref = data ? "x" : "paper", yref = data ? "y" : "paper";
  const color = a.color ?? chrome.ink;
  const name = `user:${a.id}`;
  if (a.kind === "text" || a.kind === "results") {
    const text = a.kind === "text"
      ? (a.text || " ").replace(/\n/g, "<br>")
      : (ctx.results?.[a.what] || "Results not available yet");
    const arrow = a.kind === "text" && !!a.arrow;
    layout.annotations.push({
      name, xref, yref, x: X(a.x), y: Y(a.y), text, align: "left",
      showarrow: arrow,
      ...(arrow ? { ax: a.ax ?? -40, ay: a.ay ?? -40, arrowcolor: color, arrowwidth: 1.2,
        arrowhead: 2 } : {}),
      font: { size: a.size ?? 13, color },
      ...(a.background ? { bgcolor: a.background } : {}),
      ...(a.border ? { bordercolor: color, borderwidth: 1, borderpad: 4 } : { borderpad: 2 }),
    });
    return;
  }
  const line = { color, width: a.width ?? 1.5, dash: a.dash ?? "solid" };
  if (a.kind === "arrow") {
    const ax = data ? "x" : "x domain", ay = data ? "y" : "y domain";
    layout.annotations.push({ name, xref: ax, yref: ay, axref: ax, ayref: ay,
      x: X(a.x1), y: Y(a.y1), ax: X(a.x0), ay: Y(a.y0), text: "", showarrow: true,
      arrowhead: 2, arrowsize: 1, arrowwidth: line.width, arrowcolor: color });
    return;
  }
  layout.shapes.push({
    name, editable: true, type: a.kind === "ellipse" ? "circle" : a.kind,
    xref, yref, x0: X(a.x0), x1: X(a.x1), y0: Y(a.y0), y1: Y(a.y1), line,
    ...(a.kind !== "line" ? { fillcolor: a.fill ? rgba(a.fill, 0.25) : "rgba(0,0,0,0)" } : {}),
  });
}

// ============================================================ gap

function splitAxis(layout: Layout, traces: Trace[], gap: { from: number; to: number },
  m: AxisMap, e: Extent, a: AxisFormat) {
  const g0 = m.to(gap.from), g1 = m.to(gap.to);
  const range = axisRange({ ...a, gap: null, min: a.min, max: a.max }, e, m)
    ?? axisRange({ scale: a.scale, gap }, e, m);
  if (!isNum(g0) || !isNum(g1) || !range) return;
  const [lo, hi] = range;
  if (!(g0 > lo && g1 < hi)) return;
  const lowSpan = g0 - lo, highSpan = hi - g1;
  const room = 0.95, sep = 0.05;
  const f = Math.min(0.8, Math.max(0.2, room * lowSpan / (lowSpan + highSpan)));
  const y = layout.yaxis ?? {};
  const title = y.title;
  layout.yaxis = { ...y, range: [lo, g0], autorange: false, domain: [0, f], title: undefined };
  delete layout.yaxis.title;
  layout.yaxis3 = { ...y, range: [g1, hi], autorange: false, domain: [f + sep, 1],
    anchor: "x" };
  delete layout.yaxis3.title;
  // Duplicate the primary-axis traces onto the upper segment.
  const dup: Trace[] = [];
  for (const t of traces) {
    if (yOf(t) !== "y") continue;
    dup.push({ ...structuredClone(t), yaxis: "y3", showlegend: false });
  }
  traces.push(...dup);
  // Items placed above the gap move to the upper axis.
  for (const s of layout.shapes ?? []) {
    if (s.yref === "y" && Math.max(s.y0 ?? -Infinity, s.y1 ?? -Infinity) >= g1) s.yref = "y3";
  }
  for (const an of layout.annotations ?? []) {
    if (an.yref === "y" && isNum(an.y) && an.y >= g1) an.yref = "y3";
  }
  // Break marks on the axis line, and one title for both segments.
  const mark = (py: number) => ({ type: "line", xref: "paper", yref: "paper",
    x0: -0.012, x1: 0.012, y0: py - 0.012, y1: py + 0.012,
    line: { color: y.linecolor ?? "#888", width: 1.5 } });
  layout.shapes.push(mark(f), mark(f + sep));
  if (title?.text) {
    layout.annotations.push({ xref: "paper", yref: "paper", x: 0, y: 0.5, xanchor: "center",
      yanchor: "middle", xshift: -((layout.margin?.l ?? 60) - 14), textangle: -90,
      showarrow: false, text: title.text, font: { ...(title.font ?? {}) } });
  }
}

// ============================================================ chrome

function frame(layout: Layout, style: "axes" | "box" | "offset" | "none", chrome: Chrome) {
  const axes = ["xaxis", "yaxis", "yaxis3"].filter((k) => k !== "yaxis3" || layout.yaxis3);
  for (const k of axes) {
    const ax = { ...(layout[k] ?? {}) };
    if (style === "none") { ax.showline = false; }
    else {
      ax.showline = true;
      ax.linecolor = chrome.inkSecondary;
      ax.linewidth = 1;
      ax.mirror = style === "box";
    }
    layout[k] = ax;
  }
  if (style === "offset") {
    layout.xaxis = { ...layout.xaxis, domain: [0.035, 1], anchor: "free", position: 0 };
    if (!layout.yaxis3) {
      layout.yaxis = { ...layout.yaxis, domain: [0.045, 1], anchor: "free", position: 0 };
    }
  }
}

function fonts(layout: Layout, format: GraphFormat) {
  const f = format.font;
  if (!f) return;
  layout.font = { ...(layout.font ?? {}) };
  if (f.family) layout.font.family = fontStack(f.family);
  if (isNum(f.size)) layout.font.size = f.size;
  for (const k of ["xaxis", "yaxis", "yaxis2", "yaxis3"]) {
    const ax = layout[k];
    if (!ax) continue;
    if (isNum(f.tickSize)) ax.tickfont = { ...(ax.tickfont ?? {}), size: f.tickSize };
    if (isNum(f.axisTitleSize) && ax.title) {
      ax.title = { ...ax.title, font: { ...(ax.title.font ?? {}), size: f.axisTitleSize } };
    }
  }
  for (const an of layout.annotations ?? []) {
    if (an.textangle === -90 && isNum(f.axisTitleSize)) {
      an.font = { ...(an.font ?? {}), size: f.axisTitleSize };
    }
  }
  if (isNum(f.legendSize)) {
    layout.legend = { ...(layout.legend ?? {}),
      font: { ...(layout.legend?.font ?? {}), size: f.legendSize } };
  }
}

// The trace that stands for a dataset in the legend, most telling first.
const PRIMARY: TraceRole[] = ["bar", "box", "violin", "line", "fit", "points"];

function legend(layout: Layout, traces: Trace[], format: GraphFormat, ctx: FormatContext,
  chrome: Chrome) {
  const lg = format.legend;
  const names = new Map<number, string>();
  for (let i = 0; i < ctx.datasets.length; i++) {
    const t = datasetFmt(format, i).legend;
    if (t !== undefined) names.set(i, t);
  }
  if (!lg && !names.size) return;
  if (lg?.show === "hide") { layout.showlegend = false; return; }
  if (lg?.show === "show") {
    layout.showlegend = true;
    const byDs = new Map<number, Trace[]>();
    for (const t of traces) {
      const tag = traceTag(t);
      if (tag && tag.ds >= 0) (byDs.get(tag.ds) ?? byDs.set(tag.ds, []).get(tag.ds)!).push(t);
    }
    for (const [ds, list] of byDs) {
      const shown = list.some((t) => t.showlegend !== false
        && PRIMARY.includes(traceTag(t)!.role));
      if (shown) continue;
      const primary = PRIMARY.map((r) => list.find((t) => traceTag(t)!.role === r))
        .find(Boolean);
      if (primary) {
        primary.showlegend = true;
        primary.name = names.get(ds) ?? (ctx.datasets[ds] || `Dataset ${ds + 1}`);
        primary.legendgroup = primary.legendgroup ?? `ds${ds}`;
      }
    }
  }
  for (const [ds, text] of names) {
    for (const t of traces) {
      if (traceTag(t)?.ds === ds && t.showlegend !== false) t.name = text;
    }
  }
  if (!lg) return;
  const pos = lg.position ?? "auto";
  const L: Layout = { ...(layout.legend ?? {}) };
  const inside = { bgcolor: rgba(chrome.surface, 0.85), bordercolor: chrome.grid, borderwidth: 1 };
  switch (pos) {
    case "top": Object.assign(L, { x: 0, y: 1.02, xanchor: "left", yanchor: "bottom", orientation: "h" }); break;
    case "top-left": Object.assign(L, { x: 0.01, y: 0.99, xanchor: "left", yanchor: "top", orientation: "v" }, inside); break;
    case "top-right": Object.assign(L, { x: 0.99, y: 0.99, xanchor: "right", yanchor: "top", orientation: "v" }, inside); break;
    case "bottom-left": Object.assign(L, { x: 0.01, y: 0.01, xanchor: "left", yanchor: "bottom", orientation: "v" }, inside); break;
    case "bottom-right": Object.assign(L, { x: 0.99, y: 0.01, xanchor: "right", yanchor: "bottom", orientation: "v" }, inside); break;
    case "right": Object.assign(L, { x: 1.02, y: 1, xanchor: "left", yanchor: "top", orientation: "v" }); break;
    case "bottom": Object.assign(L, { x: 0.5, y: -0.16, xanchor: "center", yanchor: "top", orientation: "h" }); break;
    default: break;
  }
  if (lg.orientation === "h" || lg.orientation === "v") L.orientation = lg.orientation;
  if (!L.font) L.font = { color: chrome.ink };
  layout.legend = L;
}
