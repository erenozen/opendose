// Shared plumbing for the multiple-variables graphs: theme-aware chrome
// and layout, the diverging and sequential color scales, and per-graph
// settings stored on the graph sheet.
import { useCallback, useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { useProject } from "../../app/context";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, SCHEMES, isDarkMode, onThemeChange,
  type Chrome,
} from "../../lib/palette";
import { updateSheet } from "../../project/ops";
import type { GraphSheet, Sheet } from "../../project/types";

export function useDark(): boolean {
  const [dark, setDark] = useState(isDarkMode());
  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);
  return dark;
}

export const chromeFor = (dark: boolean): Chrome => (dark ? CHROME_DARK : CHROME_LIGHT);

export function axis(chrome: Chrome, title: string,
  extra: Partial<Plotly.LayoutAxis> = {}): Partial<Plotly.LayoutAxis> {
  return {
    title: title ? { text: title, font: { color: chrome.inkSecondary } } : undefined,
    gridcolor: chrome.grid, zeroline: false,
    linecolor: chrome.axis, tickcolor: chrome.axis,
    tickfont: { color: chrome.muted },
    automargin: true,
    ...extra,
  };
}

export function baseLayout(chrome: Chrome, xTitle: string, yTitle: string,
  extra: Partial<Plotly.Layout> = {}): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: chrome.surface,
    plot_bgcolor: chrome.surface,
    font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
    margin: { l: 64, r: 16, t: 12, b: 52 },
    xaxis: axis(chrome, xTitle),
    yaxis: axis(chrome, yTitle),
    legend: {
      font: { color: chrome.ink, size: 12 },
      bgcolor: "rgba(0,0,0,0)",
      itemsizing: "trace",
    },
    hoverlabel: { font: { family: PLOT_FONT } },
    dragmode: "pan",
    uirevision: "keep",
    ...extra,
  };
}

// ------------------------------------------------------------ colors

/** Diverging scale for r in [-1, 1]: red (negative), neutral gray (0),
 *  blue (positive); dark mode gets its own steps. */
export function divergingScale(dark: boolean): [number, string][] {
  return dark
    ? [[0, "#e5534b"], [0.5, "#3a3a3c"], [1, "#3987e5"]]
    : [[0, "#d03b3b"], [0.5, "#ececf0"], [1, "#2a78d6"]];
}

/** Single-hue ramp (the sequential scheme) for a continuous color-by. */
export function sequentialScale(dark: boolean): [number, string][] {
  const ramp = dark ? [...SCHEMES.sequential.dark].reverse() : SCHEMES.sequential.light;
  return ramp.map((c, i) => [i / (ramp.length - 1), c]);
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Color at position t of a piecewise-linear scale (as Plotly draws it). */
export function scaleColor(scale: [number, string][], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < scale.length; i++) {
    if (x <= scale[i][0]) {
      const [t0, c0] = scale[i - 1];
      const [t1, c1] = scale[i];
      const u = t1 > t0 ? (x - t0) / (t1 - t0) : 0;
      const a = hexRgb(c0);
      const b = hexRgb(c1);
      return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * u)) as [number, number, number];
    }
  }
  return hexRgb(scale[scale.length - 1][1]);
}

/** Label ink with the better contrast on a cell of the given color. */
export function inkOn(rgb: [number, number, number]): string {
  const l = lum(rgb);
  const contrast = (c: string) => {
    const l2 = lum(hexRgb(c));
    return (Math.max(l, l2) + 0.05) / (Math.min(l, l2) + 0.05);
  };
  const dark = CHROME_LIGHT.ink;
  const light = "#ffffff";
  return contrast(light) >= contrast(dark) ? light : dark;
}

export function stars(p: number | null | undefined): string {
  if (typeof p !== "number") return "";
  if (p < 0.0001) return "****";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

// ------------------------------------------------------------ settings

/** Per-graph settings kept on the graph sheet (settings.mv), editable from
 *  the plot panel. Frozen graphs are read-only. */
export function useGraphSettings<T extends object>(graph: GraphSheet, defaults: T):
  [T, (patch: Partial<T>) => void, boolean] {
  const { apply } = useProject();
  const stored = graph.settings.mv;
  // Stable identity while neither the stored settings nor the defaults
  // change, so graphs do not redraw on unrelated edits.
  const dkey = JSON.stringify(defaults);
  const value = useMemo(() => ({
    ...(JSON.parse(dkey) as T),
    ...(stored && typeof stored === "object" ? stored as Partial<T> : {}),
  }), [dkey, stored]);
  const editable = !graph.frozen;
  const id = graph.id;
  const set = useCallback((patch: Partial<T>) => {
    apply((p) => updateSheet<Sheet>(p, id, (s) => {
      if (s.kind !== "graph" || s.frozen) return s;
      const prev = s.settings.mv && typeof s.settings.mv === "object" ? s.settings.mv : {};
      return { ...s, settings: { ...s.settings, mv: { ...prev, ...patch } } };
    }), `graph:${id}:mv`);
  }, [apply, id]);
  return [value, set, editable];
}

