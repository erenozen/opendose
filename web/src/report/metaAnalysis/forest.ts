// The forest plot of a meta-analysis (pure): one row per experiment
// (estimate with its CI, the square's area in proportion to its weight in
// the random-effects pool), then the pooled common-effect and
// random-effects estimates as diamonds spanning their CIs and the
// prediction interval as a bar (Lewis & Clarke 2001, BMJ 322:1479;
// Riley, Higgins & Deeks 2011, BMJ 342:d549). Ratios are drawn on a log
// axis with the line of no effect at 1, everything else at 0. Every
// plotted number is the engine's (meta.py); nothing is recomputed here.
import type * as Plotly from "plotly.js";
import type { Chrome } from "../../lib/palette.ts";
import { formatSig } from "../../types.ts";
import { pctLevel, scaleIsRatio } from "./format.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

export type PooledShown = "both" | "random" | "fixed" | "none";

export interface ForestSettings {
  pooled: PooledShown;
  prediction: boolean;
}

export const FOREST_DEFAULTS: ForestSettings = { pooled: "both", prediction: true };

export interface ForestRow {
  label: string;
  kind: "study" | "fixed" | "random" | "prediction";
  /** On the plotted scale (ratios back-transformed). */
  value: number | null;
  lo: number;
  hi: number;
  /** Random-effects weight, percent (studies). */
  weight?: number;
}

/** The rows the forest plot draws, top to bottom, on the plotted scale. */
export function forestRows(r: R, s: ForestSettings): ForestRow[] {
  const ratio = scaleIsRatio(r.scale);
  const v = (blk: R | null | undefined, key = "estimate") => (blk ? (ratio ? blk.ratio : blk[key]) : null);
  const ci = (blk: R): [number, number] => (ratio ? blk.ratio_ci : blk.ci);
  const rows: ForestRow[] = (r.studies ?? []).map((st: R) => ({
    label: String(st.label), kind: "study" as const, value: v(st), lo: ci(st)[0], hi: ci(st)[1],
    weight: st.weight_random,
  }));
  if (s.pooled === "both" || s.pooled === "fixed") {
    rows.push({ label: "Common effect", kind: "fixed", value: v(r.fixed), lo: ci(r.fixed)[0], hi: ci(r.fixed)[1] });
  }
  if (s.pooled === "both" || s.pooled === "random") {
    rows.push({ label: "Random effects", kind: "random", value: v(r.random), lo: ci(r.random)[0], hi: ci(r.random)[1] });
    if (s.prediction && r.prediction) {
      const p = r.prediction;
      const [lo, hi] = ratio ? p.ratio_ci : p.ci;
      rows.push({ label: "Prediction interval", kind: "prediction", value: null, lo, hi });
    }
  }
  return rows;
}

export interface ForestInput {
  result: R;
  settings: ForestSettings;
  chrome: Chrome;
  font: string;
  /** Fill of the random-effects diamond (series 1 of the scheme). */
  accent: string;
  xTitle: string;
}

const DIAMOND_H = 0.32;

export function forestFigure(inp: ForestInput): { traces: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const { result: r, chrome } = inp;
  const rows = forestRows(r, inp.settings);
  const ratio = scaleIsRatio(r.scale);
  const level = pctLevel(r.ci_level);
  const nStudies = rows.filter((x) => x.kind === "study").length;
  // a blank line between the experiments and the pooled rows
  const ys = rows.map((row, i) => (row.kind === "study" ? i : i + 1));
  const studies = rows.map((row, i) => ({ row, y: ys[i] })).filter((x) => x.row.kind === "study");
  const wmax = Math.max(...studies.map((x) => x.row.weight ?? 0), 1e-9);
  const traces: Plotly.Data[] = [];
  traces.push({
    type: "scatter", mode: "markers", name: "Experiments",
    x: studies.map((x) => x.row.value), y: studies.map((x) => x.y),
    marker: {
      color: chrome.ink, symbol: "square",
      // area in proportion to the weight
      size: studies.map((x) => 5 + 11 * Math.sqrt((x.row.weight ?? 0) / wmax)),
    },
    error_x: {
      type: "data", symmetric: false, color: chrome.ink, thickness: 1.5, width: 0,
      array: studies.map((x) => x.row.hi - (x.row.value ?? 0)),
      arrayminus: studies.map((x) => (x.row.value ?? 0) - x.row.lo),
    },
    hovertext: studies.map((x) => `${esc(x.row.label)}: ${formatSig(x.row.value)} (${level} CI `
      + `${formatSig(x.row.lo)} to ${formatSig(x.row.hi)}), weight ${formatSig(x.row.weight ?? null)}%`),
    hoverinfo: "text", showlegend: false,
  } as Plotly.Data);
  rows.forEach((row, i) => {
    const y = ys[i];
    if (row.kind === "fixed" || row.kind === "random") {
      const v = row.value ?? 0;
      traces.push({
        type: "scatter", mode: "lines", name: row.label, fill: "toself",
        x: [row.lo, v, row.hi, v, row.lo], y: [y, y - DIAMOND_H, y, y + DIAMOND_H, y],
        fillcolor: row.kind === "random" ? inp.accent : chrome.surface,
        line: { color: row.kind === "random" ? inp.accent : chrome.ink, width: 1.5 },
        hoveron: "fills", hoverinfo: "text",
        text: `${esc(row.label)}: ${formatSig(row.value)} (${level} CI ${formatSig(row.lo)} to ${formatSig(row.hi)})`,
        showlegend: false,
      } as Plotly.Data);
    } else if (row.kind === "prediction") {
      traces.push({
        type: "scatter", mode: "lines", name: row.label,
        x: [row.lo, row.hi], y: [y, y],
        line: { color: inp.accent, width: 2.5 },
        hoverinfo: "text",
        text: `${level} prediction interval ${formatSig(row.lo)} to ${formatSig(row.hi)}`,
        showlegend: false,
      } as Plotly.Data);
    }
  });
  const ref = ratio ? 1 : 0;
  const yMax = ys.length ? ys[ys.length - 1] : 0;
  const layout: Partial<Plotly.Layout> = {
    paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
    font: { family: inp.font, color: chrome.inkSecondary, size: 13 },
    showlegend: false, dragmode: "pan", uirevision: "keep", hovermode: "closest",
    margin: { l: 16, r: 24, t: 12, b: 52 },
    xaxis: {
      type: ratio ? "log" : "linear",
      title: { text: inp.xTitle, font: { color: chrome.inkSecondary } },
      gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis, tickcolor: chrome.axis,
      tickfont: { color: chrome.muted }, automargin: true,
    },
    yaxis: {
      tickvals: ys, ticktext: rows.map((row) => esc(row.label)),
      range: [yMax + 0.8, -0.8], showgrid: false, zeroline: false,
      linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.ink },
      automargin: true, fixedrange: true,
    },
    shapes: [
      { type: "line", xref: "x", yref: "paper", x0: ref, x1: ref, y0: 0, y1: 1,
        line: { color: chrome.muted, width: 1.5, dash: "dash" } },
      ...(nStudies && rows.length > nStudies ? [{
        type: "line" as const, xref: "paper" as const, yref: "y" as const, x0: 0, x1: 1,
        y0: nStudies, y1: nStudies, line: { color: chrome.grid, width: 1 } }] : []),
    ],
  };
  return { traces, layout };
}

/** The legend's "what is plotted" clause for the forest plot, as the
 *  settings draw it. */
export function forestPlotted(r: R, s: ForestSettings): string {
  const level = pctLevel(r.ci_level);
  const ratio = scaleIsRatio(r.scale);
  const k = r.k ?? (r.studies ?? []).length;
  const parts = [`Squares show the estimate of each of ${k} experiments with its ${level} CI; `
    + "the area of a square is in proportion to its weight in the random-effects pool."];
  const fixed = s.pooled === "both" || s.pooled === "fixed";
  const random = s.pooled === "both" || s.pooled === "random";
  if (fixed || random) {
    const which = [fixed ? "the common-effect (open)" : "", random
      ? `the random-effects (filled; τ² by ${r.random?.method === "DL" ? "DerSimonian-Laird" : "REML"}, `
        + `${r.random?.test === "knha" ? "Hartung-Knapp" : "normal"} CI)` : ""].filter(Boolean).join(" and ");
    parts.push(`Diamonds span the ${level} CI of ${which} pooled estimate${fixed && random ? "s" : ""}.`);
  }
  if (random && s.prediction && r.prediction) {
    parts.push(`The bar below is the ${level} prediction interval for the effect in a new experiment `
      + "(Riley, Higgins & Deeks 2011).");
  }
  parts.push(ratio ? "Ratios are drawn on a log axis; the dashed line marks no effect (1)."
    : "The dashed line marks no effect (0).");
  return parts.join(" ");
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
