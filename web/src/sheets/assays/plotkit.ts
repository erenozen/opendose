// Plot plumbing shared by the assay graphs: theme state, layout chrome,
// and per-graph settings kept on the graph sheet.
import { useCallback, useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { useProject } from "../../app/context";
import { updateSheet } from "../../project/ops";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, isDarkMode, onThemeChange, type Chrome,
} from "../../lib/palette";
import type { GraphSheet, Sheet } from "../../project/types";

/** Blue (low / antagonism) – neutral – red (high / synergy): ColorBrewer
 *  RdBu, readable under the common colour-vision deficiencies. */
export function divergingScale(dark: boolean): [number, string][] {
  return dark
    ? [[0, "#4393c3"], [0.5, "#3a3a3c"], [1, "#d6604d"]]
    : [[0, "#2166ac"], [0.25, "#92c5de"], [0.5, "#f7f7f7"], [0.75, "#f4a582"], [1, "#b2182b"]];
}

export function useDark(): boolean {
  const [dark, setDark] = useState(isDarkMode());
  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);
  return dark;
}

export const chromeOf = (dark: boolean): Chrome => (dark ? CHROME_DARK : CHROME_LIGHT);

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

export function layoutBase(chrome: Chrome, extra: Partial<Plotly.Layout> = {}): Partial<Plotly.Layout> {
  return {
    paper_bgcolor: chrome.surface,
    plot_bgcolor: chrome.surface,
    font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
    margin: { l: 64, r: 16, t: 16, b: 52 },
    legend: { font: { color: chrome.ink, size: 12 }, bgcolor: "rgba(0,0,0,0)" },
    hoverlabel: { font: { family: PLOT_FONT } },
    hovermode: "closest",
    dragmode: "pan",
    uirevision: "keep",
    ...extra,
  };
}

export function messageLayout(chrome: Chrome, text: string): Partial<Plotly.Layout> {
  return {
    ...layoutBase(chrome),
    xaxis: { visible: false }, yaxis: { visible: false },
    annotations: [{ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false,
      text, font: { color: chrome.muted } }],
  };
}

/** One settings object on a graph sheet (`settings[key]`), merged over
 *  defaults; frozen graphs get no setter. */
export function useGraphSettings<T extends object>(graph: GraphSheet, key: string,
  defaults: T): [T, ((patch: Partial<T>) => void) | null] {
  const { apply } = useProject();
  const stored = graph.settings[key];
  const dkey = JSON.stringify(defaults);
  const value = useMemo(() => ({
    ...(JSON.parse(dkey) as T),
    ...(stored && typeof stored === "object" ? stored as Partial<T> : {}),
  }), [dkey, stored]);
  const id = graph.id;
  const set = useCallback((patch: Partial<T>) => {
    apply((p) => updateSheet<Sheet>(p, id, (s) => {
      if (s.kind !== "graph" || s.frozen) return s;
      const prev = s.settings[key] && typeof s.settings[key] === "object"
        ? s.settings[key] as object : {};
      return { ...s, settings: { ...s.settings, [key]: { ...prev, ...patch } } };
    }), `graph:${id}:${key}`);
  }, [apply, id, key]);
  return [value, graph.frozen ? null : set];
}

/** Read a graph's settings object without React (graph-kind helpers). */
export function readGraphSettings<T extends object>(graph: GraphSheet, key: string, defaults: T): T {
  const stored = graph.settings[key];
  return { ...defaults, ...(stored && typeof stored === "object" ? stored as Partial<T> : {}) };
}
