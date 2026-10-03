// The Monte Carlo graph: a histogram of one tabulated value over the
// repeats, with the true value marked when the hit condition has one.
// Drawn through the graph-format layer (colour, fill, border, axes,
// title, annotations).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../lib/palette";
import type { PlotProps } from "../types";
import type { McOutput, MonteCarloOptions } from "./montecarlo";

/** The value the histogram shows: the chosen one, or the first tabulated. */
function histogramLabel(result: McOutput | null, options: MonteCarloOptions | null): string {
  if (!result) return "";
  return options?.histogram && result.labels.includes(options.histogram)
    ? options.histogram : result.labels[0] ?? "";
}

export default function HistogramPlot({ result, options, titles, scheme, format,
  onFormatChange }: PlotProps<MonteCarloOptions, McOutput | null>) {
  const dark = useDarkMode();
  const label = histogramLabel(result, options);
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const vals = (result?.values[label] ?? []).filter((v): v is number => v !== null);
    const { color } = seriesStyle(0, dark, scheme);
    const truth = options?.hit.kind === "contains" ? Number(options.hit.truth) : NaN;
    const shapes: Partial<Plotly.Shape>[] = [];
    // The true value, on the histogram of the estimate (not of its limits).
    if (options?.hit.kind === "contains" && Number.isFinite(truth)
      && label !== options.hit.lower && label !== options.hit.upper) {
      shapes.push({ type: "line", x0: truth, x1: truth, yref: "paper", y0: 0, y1: 1,
        line: { color: chrome.ink, width: 1.5, dash: "dash" } });
    }
    const traces: Plotly.Data[] = vals.length ? [tagTrace({
      x: vals, type: "histogram", marker: { color: color + "99", line: { color, width: 1 } },
      hovertemplate: "%{x}: %{y} repeats<extra></extra>", name: label,
    }, { ds: 0, role: "bar" }) as Plotly.Data] : [];
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 60, r: 16, t: 12, b: 48 },
      bargap: 0.04,
      shapes,
      xaxis: { title: { text: titles.x || label }, gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.muted } },
      yaxis: { title: { text: titles.y }, gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.muted } },
      annotations: vals.length ? [] : [{ text: "Run the simulations to see the distribution",
        showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5,
        font: { color: chrome.muted } }],
    };
    return { traces, layout, names: [label || "Values"] };
  }, [result, label, dark, scheme, titles, options]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names }), [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="monte-carlo"
      label={label ? `Histogram of ${label} over the Monte Carlo repeats` : undefined} />
  );
}
