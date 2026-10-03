// Shared plumbing for the grouped graphs: the common layout chrome and the
// per-graph settings stored on the graph sheet.
import { useCallback, useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { useProject } from "../../app/context";
import { PLOT_FONT, type Chrome } from "../../lib/palette";
import { updateSheet } from "../../project/ops";
import type { GraphSheet, Sheet } from "../../project/types";

/** Layout chrome shared by every grouped graph. */
export function baseLayout(chrome: Chrome): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: chrome.surface,
    plot_bgcolor: chrome.surface,
    font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
    margin: { l: 64, r: 16, t: 16, b: 52 },
    hoverlabel: { font: { family: PLOT_FONT } },
  };
}

export function valueAxis(chrome: Chrome, title: string): Partial<Plotly.LayoutAxis> {
  return {
    title: title ? { text: title, font: { color: chrome.inkSecondary } } : undefined,
    gridcolor: chrome.grid, zeroline: false,
    linecolor: chrome.axis, tickcolor: chrome.axis,
    tickfont: { color: chrome.muted },
    automargin: true,
  };
}

export function categoryAxis(chrome: Chrome, tickvals: number[], ticktext: string[],
  range: [number, number], title = ""): Partial<Plotly.LayoutAxis> {
  return {
    title: title ? { text: title, font: { color: chrome.inkSecondary } } : undefined,
    tickvals, ticktext, range,
    zeroline: false, showgrid: false,
    linecolor: chrome.axis, tickcolor: chrome.axis,
    tickfont: { color: chrome.ink },
    automargin: true,
  };
}

/** Read / write one namespaced settings object on a graph sheet. Frozen
 *  graphs are read-only. */
export function useGraphSetting<T>(graph: GraphSheet, key: string,
  normalize: (raw: unknown) => T): [T, ((next: T) => void) | null] {
  const { apply } = useProject();
  const raw = graph.settings[key];
  const value = useMemo(() => normalize(raw), [normalize, raw]);
  const set = useCallback((next: T) => apply((p) => updateSheet<Sheet>(p, graph.id,
    (s) => (s.kind === "graph" ? { ...s, settings: { ...s.settings, [key]: next } } : s)),
  `graph:${graph.id}:${key}`), [apply, graph.id, key]);
  return [value, graph.frozen ? null : set];
}

/** Deterministic jitter offsets for n points, spread across ±half. */
export function jitter(n: number, half: number): number[] {
  if (n <= 1) return Array(n).fill(0);
  return Array.from({ length: n }, (_, j) => -half + (2 * half * j) / (n - 1));
}

export const withAlpha = (hex: string, alpha: string) =>
  (/^#[0-9a-f]{6}$/i.test(hex) ? hex + alpha : hex);
