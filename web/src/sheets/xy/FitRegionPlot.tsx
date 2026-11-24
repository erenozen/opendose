// The joint confidence region graph kind (P-102): for each fitted data set
// the profile-likelihood region of two parameters (solid), the linear
// approximation's ellipse (dashed) and the estimate. Numbers: the engine's
// fitregion.JointRegion, read by fitRegion.ts.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { seriesStyle } from "../../lib/palette";
import type { AnalysisResult, OptionsState } from "../../types";
import type { PlotProps } from "../types";
import { axis, chromeOf, layoutBase, messageLayout, useDark } from "../assays/plotkit";
import { regionView } from "./fitRegion";

export function FitRegionPlot({ result, titles, scheme, format, onFormatChange }:
  PlotProps<OptionsState, AnalysisResult>) {
  const dark = useDark();
  const view = useMemo(() => regionView(result), [result]);
  const names = useMemo(() => view?.sets.map((s) => s.name) ?? [], [view]);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    const drawn = view?.sets.filter((s) => s.contour) ?? [];
    if (!view || !drawn.length) {
      const why = view?.sets.find((s) => s.error)?.error;
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome, why
        ? why.replace(/\.$/, "")
        : "Choose two parameters under “Joint confidence region” in the fit’s results") };
    }
    const many = view.sets.length > 1;
    const traces: Plotly.Data[] = [];
    view.sets.forEach((s, ds) => {
      if (!s.contour || !s.ellipse || !s.estimate) return;
      const { color, symbol } = seriesStyle(ds, dark, scheme);
      const label = many ? `${s.name}: ` : "";
      traces.push(tagTrace({
        type: "scatter", mode: "lines", x: s.contour.x, y: s.contour.y, name: `${label}95% joint region`,
        line: { color, width: 2 }, connectgaps: false, hoverinfo: "skip", showlegend: true,
      }, { ds, role: "fit" }) as Plotly.Data);
      traces.push(tagTrace({
        type: "scatter", mode: "lines", x: s.ellipse.x, y: s.ellipse.y,
        name: `${label}Linear approximation`,
        line: { color, width: 1.5, dash: "dash" }, hoverinfo: "skip", showlegend: true,
      }, { ds, role: "decor" }) as Plotly.Data);
      traces.push(tagTrace({
        type: "scatter", mode: "markers", x: [s.estimate[0]], y: [s.estimate[1]],
        name: `${label}Best fit`,
        marker: { color, symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
        hovertemplate: `${s.name}<br>%{x:.4g}, %{y:.4g}<extra></extra>`, showlegend: true,
      }, { ds, role: "points" }) as Plotly.Data);
    });
    const [a, b] = view.params ?? ["", ""];
    // lines get no autorange padding: 6% each way keeps the region's edge
    // off the frame
    const pad = (vals: (number | null)[]): [number, number] | undefined => {
      const v = vals.filter((x): x is number => x !== null && Number.isFinite(x));
      if (!v.length) return undefined;
      const lo = Math.min(...v), hi = Math.max(...v), d = (hi - lo) * 0.06 || Math.abs(lo) * 0.06 || 1;
      return [lo - d, hi + d];
    };
    const xs = drawn.flatMap((s) => [...s.contour!.x, ...(s.ellipse?.x ?? [])]);
    const ys = drawn.flatMap((s) => [...s.contour!.y, ...(s.ellipse?.y ?? [])]);
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x || a, { range: pad(xs) }),
      yaxis: axis(chrome, titles.y || b, { range: pad(ys) }),
      showlegend: true,
    });
    layout.legend = { ...layout.legend, orientation: "h", y: -0.18 };
    return { traces, layout };
  }, [view, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: names }), [dark, scheme, names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="joint-region" />
  );
}
