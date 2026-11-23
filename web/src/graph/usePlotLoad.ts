// Loading Plotly for one plot box, with what the box should say meanwhile
// (graph/PlotStatus.tsx).
import { useCallback, useState } from "react";
import type { Plotly } from "../lib/plotly";
import { loadPlotly, plotlyNow } from "../lib/plotly";

export type PlotLoad = "loading" | "ready" | "failed";

/**
 * Loads Plotly for a plot effect and tracks whether it arrived.
 * `draw(fn)` runs `fn` once Plotly is there (a failed download sets
 * "failed" instead of rejecting) and then marks the plot `drawn`;
 * `purge(div)` clears it; `retry()` asks again, and `attempt`
 * changes so the draw effect, which lists it as a dependency, runs again.
 */
export function usePlotLoad() {
  const [load, setLoad] = useState<PlotLoad>(() => (plotlyNow() ? "ready" : "loading"));
  const [attempt, setAttempt] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const draw = useCallback(<T,>(fn: (P: Plotly) => T | Promise<T>) => loadPlotly().then(
    async (P) => { setLoad("ready"); const out = await fn(P); setDrawn(true); return out; },
    () => { setLoad("failed"); return undefined; },
  ), []);
  /** Clears a drawn plot (its analysis failed: the old curve must not stay). */
  const purge = useCallback((div: HTMLElement) => {
    plotlyNow()?.purge(div);
    setDrawn(false);
  }, []);
  const retry = useCallback(() => { setLoad("loading"); setAttempt((a) => a + 1); }, []);
  return { load, attempt, drawn, draw, purge, retry };
}
