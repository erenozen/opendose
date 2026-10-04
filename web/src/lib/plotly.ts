// Plotly (4.6 MB) loads when the first graph is about to be drawn, not
// with the page: the app shell paints without it, and the download
// overlaps with the engine's boot. Plot components ask for it with
// loadPlotly() in their draw effect; code that runs only after a graph
// exists (resize, purge) uses plotlyNow().
import type PlotlyType from "plotly.js-dist-min";

export type Plotly = typeof PlotlyType;

let mod: Plotly | null = null;
let pending: Promise<Plotly> | null = null;

export function loadPlotly(): Promise<Plotly> {
  pending ??= import("plotly.js-dist-min").then((m) => {
    mod = ((m as unknown as { default?: Plotly }).default ?? m) as Plotly;
    return mod;
  }).catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}

/** Plotly if it has loaded, else null. */
export function plotlyNow(): Plotly | null {
  return mod;
}
