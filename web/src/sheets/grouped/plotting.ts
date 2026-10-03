// Shared plumbing for the grouped graphs: a Plotly div that follows the
// theme and its container's size, the common layout chrome, and the
// per-graph settings stored on the graph sheet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { useProject } from "../../app/context";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, isDarkMode, onThemeChange, type Chrome,
} from "../../lib/palette";
import { updateSheet } from "../../project/ops";
import type { GraphSheet, Sheet } from "../../project/types";

/** A Plotly host element plus the current dark-mode flag. The caller
 *  draws with `draw(traces, layout)` from an effect. */
export function usePlot(exportName: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  // Redraw when the card or column is resized (splitter drag, the card's
  // resize handle); Plotly's own listener only covers the window.
  useEffect(() => {
    const div = ref.current;
    if (!div) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if ((div as unknown as { _fullLayout?: unknown })._fullLayout) {
          Plotly.Plots.resize(div);
        }
      });
    });
    ro.observe(div);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    const div = ref.current;
    return () => { if (div) Plotly.purge(div); };
  }, []);

  const draw = useCallback((traces: Plotly.Data[], layout: Partial<Plotly.Layout>) => {
    if (!ref.current) return;
    Plotly.react(ref.current, traces, { dragmode: "pan", uirevision: "keep", ...layout }, {
      responsive: true, scrollZoom: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: exportName },
    });
  }, [exportName]);

  return { ref, dark, chrome: (dark ? CHROME_DARK : CHROME_LIGHT) as Chrome, draw };
}

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
