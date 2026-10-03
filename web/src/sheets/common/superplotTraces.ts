// Plotly traces of a SuperPlot: every value as a small symbol coloured
// (and shaped) by its replicate, each replicate's mean or median as a
// large symbol, and the grand mean ± error of the replicate means as a
// line with error bars. Shared by the column SuperPlot and the grouped
// graphs' SuperPlot overlay. Pure (no React, no DOM).
import { tagTrace } from "../../graph/apply.ts";
import { spreadOffsets, type PointSpread, type SpreadScale } from "../../graph/swarm.ts";
import { seriesStyle, type Chrome, type SchemeId } from "../../lib/palette.ts";
import type { DataTableModel } from "../../project/types.ts";
import type { CellStat } from "../grouped/stats.ts";
import {
  replicateSummary, type GroupReplicates, type SuperPlotSettings,
} from "./superplot.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Trace = Record<string, any>;

export interface ReplicateStyle { color: string; symbol: string }

/** Colour and symbol of replicate r under the chosen encoding. Colours
 *  come from the graph's scheme (validated for colour-vision deficiency
 *  in the colour-blind scheme); symbols are the secondary encoding. */
export function replicateStyle(r: number, s: SuperPlotSettings, scheme: SchemeId,
  dark: boolean, chrome: Chrome): ReplicateStyle {
  const st = seriesStyle(r, dark, scheme === "mono" ? "default" : scheme);
  return {
    color: s.encode === "shape" ? chrome.inkSecondary : st.color,
    symbol: s.encode === "color" ? "circle" : st.symbol,
  };
}

/** The error bar of the grand summary: [below, above]. */
export function grandError(g: CellStat, error: SuperPlotSettings["error"]): [number, number] {
  if (error === "sd") return [g.sd ?? 0, g.sd ?? 0];
  if (error === "sem") return [g.sem ?? 0, g.sem ?? 0];
  if (error === "ci") {
    return g.ciLo !== null && g.ciHi !== null ? [g.mean - g.ciLo, g.ciHi - g.mean] : [0, 0];
  }
  return [0, 0];
}

const ERROR_WORD: Record<SuperPlotSettings["error"], string> = {
  sd: "SD", sem: "SEM", ci: "95% CI", none: "",
};

export interface GroupSlot {
  group: GroupReplicates;
  /** Centre of the group on the X axis and the axis it is on. */
  x: number;
  xaxis?: string;
  /** Half the width the group may use (category units). */
  half: number;
  /** Tag index for the format layer (data set the marks belong to). */
  ds: number;
}

export interface SuperTracesInput {
  slots: GroupSlot[];
  names: string[];
  settings: SuperPlotSettings;
  spread: PointSpread;
  /** Pixel scale of the plot for beeswarm / symmetric spreading. */
  scale: SpreadScale | null;
  scheme: SchemeId;
  dark: boolean;
  chrome: Chrome;
  /** Draw the grand summary line and error bars (off when the graph's own
   *  bars already show it). */
  grand: boolean;
  /** One legend entry per replicate. */
  legend: boolean;
}

/** The SuperPlot marks for a set of group slots. */
export function superTraces(inp: SuperTracesInput): Trace[] {
  const { slots, names, settings: s, chrome, dark, scheme } = inp;
  const traces: Trace[] = [];
  const styles = names.map((_, r) => replicateStyle(r, s, scheme, dark, chrome));
  const meanX = names.map(() => [] as (number | null)[]);
  const meanY = names.map(() => [] as (number | null)[]);
  const meanText = names.map(() => [] as string[]);
  slots.forEach((slot, k) => {
    const { group: g } = slot;
    const scale = inp.scale ? { ...inp.scale, maxHalf: slot.half } : null;
    const off = spreadOffsets(g.points.map((p) => p.value), inp.spread,
      scale ? { ...scale, marker: 7.5 } : null, Math.min(0.045, slot.half / 5));
    names.forEach((rep, r) => {
      const idx = g.points.map((p, i) => (p.rep === r ? i : -1)).filter((i) => i >= 0);
      if (idx.length) {
        traces.push(tagTrace({
          type: "scatter", mode: "markers", xaxis: slot.xaxis ?? "x",
          x: idx.map((i) => slot.x + off[i]), y: idx.map((i) => g.points[i].value),
          name: rep, legendgroup: `rep${r}`, showlegend: inp.legend && k === 0,
          marker: { color: styles[r].color, symbol: styles[r].symbol, size: 6,
            line: { color: chrome.surface, width: 0.8 } },
          hovertemplate: `${g.name} · ${rep}: %{y:.4g}<extra></extra>`,
        }, { ds: slot.ds, role: "replicate" }));
      }
    });
    // Replicate means, spread so equal means stay visible.
    const present = g.means.map((m, r) => (m === null ? -1 : r)).filter((r) => r >= 0);
    const mOff = spreadOffsets(present.map((r) => g.means[r]!), inp.spread === "jitter"
      ? "symmetric" : inp.spread, scale ? { ...scale, marker: 15, maxHalf: slot.half * 0.6 } : null);
    present.forEach((r, j) => {
      meanX[r].push(slot.x + (scale ? mOff[j] : 0));
      meanY[r].push(g.means[r]);
      meanText[r].push(`${g.name} · ${names[r]}: ${s.center} %{y:.4g} (${g.counts[r]} values)`);
    });
    names.forEach((_, r) => {
      if (!present.includes(r)) { meanX[r].push(null); meanY[r].push(null); meanText[r].push(""); }
    });
    if (inp.grand && g.grand) {
      const [lo, hi] = grandError(g.grand, s.error);
      const word = ERROR_WORD[s.error];
      traces.push(tagTrace({
        type: "scatter", mode: "markers", xaxis: slot.xaxis ?? "x",
        x: [slot.x], y: [g.grand.mean],
        marker: { color: chrome.ink, symbol: "line-ew", size: Math.max(18, slot.half * 90),
          line: { color: chrome.ink, width: 2.5 } },
        error_y: lo > 0 || hi > 0 ? { type: "data", array: [hi], arrayminus: [lo],
          symmetric: lo === hi, color: chrome.ink, thickness: 1.5, width: 8, visible: true }
          : undefined,
        showlegend: false,
        hovertemplate: `${g.name}: mean of ${g.grand.n} experiment ${s.center}s %{y:.4g}`
          + (word ? ` (${word} ${(s.error === "ci" ? `${(g.grand.mean - lo).toPrecision(4)} to ${(g.grand.mean + hi).toPrecision(4)}` : hi.toPrecision(4))})` : "")
          + "<extra></extra>",
      }, { ds: slot.ds, role: "summary" }));
    }
  });
  names.forEach((rep, r) => {
    if (!meanY[r].some((v) => v !== null)) return;
    traces.push(tagTrace({
      type: "scatter", mode: s.link ? "lines+markers" : "markers",
      xaxis: slots[0]?.xaxis ?? "x",
      x: meanX[r], y: meanY[r], name: `${rep} ${s.center}`, legendgroup: `rep${r}`,
      showlegend: false, connectgaps: false,
      line: { color: styles[r].color, width: 1.5 },
      marker: { color: styles[r].color, symbol: styles[r].symbol, size: 15,
        line: { color: chrome.ink, width: 1.5 } },
      text: meanText[r], hovertemplate: "%{text}<extra></extra>",
    }, { ds: -1, role: "replicate" }));
    // Marks the replicate-mean overlay (tests, the e2e check).
    traces[traces.length - 1].meta.superplotMeans = true;
  });
  return traces;
}

export interface ColumnSuperPlot {
  traces: Trace[];
  layout: Record<string, any>;
  /** Group names in X order (the plotted groups). */
  groups: string[];
  /** X position of a group by name (brackets). */
  groupX: (name: string) => number | null;
  replicates: string[];
}

/** A column table as a SuperPlot. */
export function buildColumnSuperPlot(table: DataTableModel, s: SuperPlotSettings,
  spread: PointSpread, scale: SpreadScale | null, scheme: SchemeId, dark: boolean,
  chrome: Chrome, yTitle: string, font: string): ColumnSuperPlot {
  const { info, groups } = replicateSummary(table, s.center);
  const slots: GroupSlot[] = groups.map((g, k) => ({ group: g, x: k, half: 0.38, ds: g.ds }));
  const traces = superTraces({ slots, names: info.names, settings: s, spread, scale, scheme,
    dark, chrome, grand: true, legend: true });
  const names = groups.map((g) => g.name);
  const layout = {
    paper_bgcolor: chrome.surface,
    plot_bgcolor: chrome.surface,
    font: { family: font, color: chrome.inkSecondary, size: 13 },
    margin: { l: 60, r: 16, t: 36, b: 48 },
    xaxis: {
      tickvals: names.map((_, i) => i), ticktext: names,
      zeroline: false, showgrid: false,
      linecolor: chrome.axis, tickcolor: chrome.axis,
      tickfont: { color: chrome.ink },
      range: [-0.6, names.length - 0.4],
    },
    yaxis: {
      title: { text: yTitle, font: { color: chrome.inkSecondary } },
      gridcolor: chrome.grid, zeroline: false,
      linecolor: chrome.axis, tickcolor: chrome.axis,
      tickfont: { color: chrome.muted },
    },
    showlegend: info.names.length > 0,
    legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom",
      font: { color: chrome.ink, size: 12 }, bgcolor: "rgba(0,0,0,0)" },
    dragmode: "pan",
    uirevision: "keep",
  };
  return {
    traces, layout, groups: names, replicates: info.names,
    groupX: (name) => { const i = names.indexOf(name); return i >= 0 ? i : null; },
  };
}
