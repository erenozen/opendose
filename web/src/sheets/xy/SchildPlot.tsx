// The Schild plot graph kind (P-49): log(DR − 1) against log[antagonist]
// from the EC50-shift fit, the straight line through the points, and the
// slope with its 95% CI written in the corner. Numbers: sheets/xy/schild.ts.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { seriesStyle } from "../../lib/palette";
import type { AnalysisResult, OptionsState } from "../../types";
import type { PlotProps } from "../types";
import { axis, chromeOf, layoutBase, messageLayout, useDark } from "../assays/plotkit";
import { readSchild } from "./schild";

const SCHILD_NAMES = ["log(DR − 1)"];

export function SchildPlot({ result, titles, scheme, format, onFormatChange }:
  PlotProps<OptionsState, AnalysisResult>) {
  const dark = useDark();
  const view = useMemo(() => readSchild(result), [result]);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!view) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        "A Schild plot needs the EC50 shift (Gaddum/Schild) model with antagonist concentrations") };
    }
    if (!view.points.length) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome, view.error ?? "No dose ratio above 1") };
    }
    const { color, symbol } = seriesStyle(0, dark, scheme);
    const xs = view.points.map((p) => p.x);
    const traces: Plotly.Data[] = [tagTrace({
      type: "scatter", mode: "markers", x: xs, y: view.points.map((p) => p.y), name: "log(DR − 1)",
      text: view.points.map((p) => p.name),
      marker: { color, symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
      hovertemplate: "%{text}<br>log[B] %{x:.4g}, log(DR − 1) %{y:.4g}<extra></extra>",
      showlegend: false,
    }, { ds: 0, role: "points" }) as Plotly.Data];
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (view.line) {
      const lo = Math.min(...xs), hi = Math.max(...xs), pad = (hi - lo) * 0.08 || 0.5;
      const lx = [lo - pad, hi + pad];
      traces.push(tagTrace({
        type: "scatter", mode: "lines", x: lx, y: lx.map((x) => view.line!.intercept + view.line!.slope * x),
        name: "Fitted line", line: { color, width: 2 }, hoverinfo: "skip", showlegend: false,
      }, { ds: 0, role: "fit" }) as Plotly.Data);
      annotations.push({
        xref: "paper", yref: "paper", x: 0.02, y: 0.98, xanchor: "left", yanchor: "top",
        showarrow: false, align: "left", font: { color: chrome.ink, size: 12 },
        text: view.slopeCI
          ? `Slope ${view.slope} (95% CI ${view.slopeCI})<br>pA2 from the plot ${view.pA2Plot ?? "n/a"}`
          : `Slope ${view.slope} (2 points: no CI)`,
      });
    }
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x),
      yaxis: axis(chrome, titles.y),
      annotations,
    });
    return { traces, layout };
  }, [view, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: SCHILD_NAMES }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="schild-plot" />
  );
}
