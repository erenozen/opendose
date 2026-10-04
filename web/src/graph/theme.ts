// Graph themes (GraphFormat.theme). "classic" is the figure look many
// journals and most GraphPad Prism users recognise: white background,
// black axes and text, no grid, bold sans-serif labels, axes offset from
// each other that end at the last tick, minor ticks, no legend title.
// Applied by applyFormat to every graph kind, so exports carry it.
//
// Pure: works on the Plotly traces and layout applyFormat is building.
import { CHROME_DARK } from "../lib/palette.ts";
import type { GraphFormat } from "./format.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Trace = Record<string, any>;
type Layout = Record<string, any>;

export const CLASSIC_FONT = "Arial, Helvetica, sans-serif";

export const THEMES: readonly (readonly ["default" | "classic", string])[] = [
  ["default", "Default (app look)"],
  ["classic", "Classic (white, bold, offset axes)"],
];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Ink and paper of the classic look. In the dark app theme the graph
 *  stays dark on screen (exports in print colours map it to white). */
export function classicColors(dark: boolean): { ink: string; paper: string } {
  return dark ? { ink: CHROME_DARK.ink, paper: CHROME_DARK.surface }
    : { ink: "#000000", paper: "#ffffff" };
}

/** A range [lo, hi] snapped outwards to multiples of a nice step, and the
 *  step: the axis then starts and ends on a tick. */
export function snapToTicks(lo: number, hi: number, target = 5):
  { range: [number, number]; dtick: number } | null {
  if (!isNum(lo) || !isNum(hi)) return null;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
  const step = tickStep(hi - lo, target);
  const r0 = Math.floor(lo / step + 1e-9) * step;
  const r1 = Math.ceil(hi / step - 1e-9) * step;
  return { range: [Number(r0.toPrecision(12)), Number(r1.toPrecision(12))], dtick: step };
}

/** A 1, 2 or 5 × 10^k step giving about `target` intervals (the steps a
 *  printed axis uses; 2.5 makes awkward labels). */
export function tickStep(span: number, target = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/** Lowest and highest Y (or X) a trace draws, error bars included. */
function traceExtent(t: Trace, which: "x" | "y"): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  const e = which === "y" ? t.error_y : t.error_x;
  arr(t[which]).forEach((v, i) => {
    if (!isNum(v)) return;
    let a = v, b = v;
    if (e && e.visible !== false && Array.isArray(e.array)) {
      const p = e.array[i], m = Array.isArray(e.arrayminus) ? e.arrayminus[i] : p;
      if (isNum(p)) b = v + p;
      if (isNum(m)) a = v - m;
    }
    lo = Math.min(lo, a); hi = Math.max(hi, b);
  });
  // box traces given by precomputed statistics
  if (which === "y") {
    for (const k of ["lowerfence", "upperfence", "q1", "q3"]) {
      for (const v of arr(t[k])) if (isNum(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
  }
  if (which === "y" && t.type === "bar") { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}

/** Whether a numeric axis may be snapped: automatic, linear, not split. */
function snappable(ax: Layout | undefined, fmtAxis: GraphFormat["x"]): boolean {
  if (!ax || ax.visible === false) return false;
  if (ax.type && ax.type !== "linear" && ax.type !== "-") return false;
  if (Array.isArray(ax.range) || ax.autorange === false) return false;
  if (Array.isArray(ax.tickvals) || ax.tickmode === "array") return false;
  if (fmtAxis && (fmtAxis.scale && fmtAxis.scale !== "linear")) return false;
  if (fmtAxis && (isNum(fmtAxis.min) || isNum(fmtAxis.max) || fmtAxis.gap)) return false;
  return true;
}

/** Apply the classic look in place. `traces` are the final traces (data
 *  units on linear axes), the layout already carries brackets and
 *  annotations (they must stay inside the snapped range). */
export function applyClassic(layout: Layout, traces: Trace[], format: GraphFormat,
  dark: boolean) {
  const { ink, paper } = classicColors(dark);
  layout.paper_bgcolor = paper;
  layout.plot_bgcolor = paper;
  layout.font = {
    ...(layout.font ?? {}),
    family: format.font?.family ? layout.font?.family : CLASSIC_FONT,
    color: ink,
    weight: "bold",
  };
  const split = !!layout.yaxis3;   // discontinuous Y axis: two stacked panels
  for (const k of ["xaxis", "xaxis2", "yaxis", "yaxis2", "yaxis3"]) {
    const ax0 = layout[k];
    if (!ax0) continue;
    const which = k.startsWith("x") ? "x" : k === "yaxis2" ? "y2" : "y";
    const fa = format[which as "x" | "y" | "y2"];
    const ax: Layout = { ...ax0 };
    ax.showline = ax.visible !== false;
    ax.linecolor = ink;
    ax.linewidth = 1.5;
    ax.mirror = false;
    if (fa?.ticks === undefined) ax.ticks = "outside";
    ax.tickcolor = ink;
    ax.tickwidth = 1.5;
    if (!isNum(fa?.tickLen)) ax.ticklen = 6;
    if (fa?.grid !== true) ax.showgrid = false;
    if (format.origin !== "zero") ax.zeroline = false;
    ax.tickfont = { ...(ax.tickfont ?? {}), color: ink, weight: "bold" };
    if (ax.title) {
      const title = typeof ax.title === "string" ? { text: ax.title } : ax.title;
      ax.title = { ...title, font: { ...(title.font ?? {}), color: ink, weight: "bold" } };
    }
    // Minor ticks on numeric axes (not on category axes labelled by text).
    const category = Array.isArray(ax.ticktext) && !ax.minor;
    if (!ax.minor && !category && ax.type !== "category" && ax.type !== "date") {
      ax.minor = { ticks: "outside", ticklen: 3, tickcolor: ink, tickwidth: 1,
        showgrid: false };
    }
    if (!split && (k === "xaxis" || k === "yaxis") && snappable(ax0, fa)) {
      const ex = axisExtent(layout, traces, which as "x" | "y");
      const snap = ex ? snapToTicks(ex[0], ex[1]) : null;
      if (snap) {
        ax.range = snap.range;
        ax.autorange = false;
        if (!ax.dtick) { ax.tickmode = "linear"; ax.tick0 = 0; ax.dtick = snap.dtick; }
      }
    }
    layout[k] = ax;
  }
  // Offset axes: the X and Y axis lines do not meet at the corner.
  if (!format.frame || format.frame === "auto") {
    layout.xaxis = { ...layout.xaxis, domain: [0.035, 1], anchor: "free", position: 0 };
    if (!split) layout.yaxis = { ...layout.yaxis, domain: [0.045, 1], anchor: "free", position: 0 };
  }
  // Markers sitting on the last tick are drawn whole.
  for (const t of traces) {
    if (!t.type || t.type === "scatter" || t.type === "scattergl") t.cliponaxis = false;
  }
  layout.legend = { ...(layout.legend ?? {}), title: { text: "" },
    font: { ...(layout.legend?.font ?? {}), color: ink } };
  layout.hoverlabel = { ...(layout.hoverlabel ?? {}), font: { family: CLASSIC_FONT } };
}

/** Data extent on the main X or Y axis, including brackets and labels
 *  placed in data units, so a snapped range keeps them in view. */
function axisExtent(layout: Layout, traces: Trace[], which: "x" | "y"): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const t of traces) {
    if (which === "y" && t.yaxis && t.yaxis !== "y") continue;
    if (which === "x" && t.xaxis && t.xaxis !== "x") continue;
    if (t.type === "heatmap" || t.type === "pie") return null;
    const e = traceExtent(t, which);
    if (e) { lo = Math.min(lo, e[0]); hi = Math.max(hi, e[1]); }
  }
  if (which === "y") {
    for (const s of arr(layout.shapes)) {
      if (s.yref !== "y") continue;
      for (const v of [s.y0, s.y1]) if (isNum(v)) hi = Math.max(hi, v);
    }
    // labels above brackets need about a tier of room
    const labels = arr(layout.annotations).filter((a) => a.yref === "y" && isNum(a.y)
      && (a.name === "bracket-label" || a.name === "letters"));
    if (labels.length && Number.isFinite(hi - lo)) {
      const top = Math.max(...labels.map((a) => a.y));
      hi = Math.max(hi, top + (hi - lo) * 0.06);
    }
    if (layout.yaxis?.rangemode === "tozero") lo = Math.min(lo, 0);
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}
