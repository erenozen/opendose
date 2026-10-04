import { useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import {
  tagTrace, type Comparison, type GraphFormat, type ResultsBlock,
} from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { analyzeAsync } from "../../lib/engine";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle, type SchemeId,
} from "../../lib/palette";
import { numericData } from "../../project/table";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types";

interface Bar { mean: number | null; lo: number | null; hi: number | null; kind: string | null }

/**
 * Column graph of data entered as summaries (mean with SD / SEM / %CV /
 * CI / errors / limits): one bar or mean marker per group with the error
 * bar that was entered, read through the engine's summary_convert. Raw
 * points, box and violin plots need the raw values, so they are not
 * drawn. One group per dataset: its first row with a mean. Drawn through
 * the graph-format layer like the other column graphs (group i at x = i),
 * so brackets from t tests / ANOVA on the summaries apply.
 */
export default function SummaryPlot({ table, graphType, scheme, yTitle, format,
  onFormatChange, comparisons, results }: {
  table: DataTableModel;
  graphType: string;
  scheme: SchemeId;
  yTitle: string;
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  comparisons?: Comparison[];
  results?: Partial<Record<ResultsBlock, string>>;
}) {
  const dark = useDarkMode();
  const [bars, setBars] = useState<{ name: string; bar: Bar | null }[] | null>(null);

  useEffect(() => {
    let live = true;
    const sets = numericData(table).datasets;
    void analyzeAsync({
      analysis: "summary_convert",
      data: { format: SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat],
        datasets: sets.map((d) => ({ name: d.name, rows: d.ys })) },
      options: { error_bars: "entered" },
    }).then((res) => {
      const r = res as { error?: string; datasets?: { name: string; bars: Bar[] }[] };
      if (!live) return;
      setBars((r.datasets ?? []).map((d) => ({
        name: d.name, bar: d.bars.find((b) => b.mean !== null) ?? null,
      })));
    }, () => { /* no bars until the engine answers */ });
    return () => { live = false; };
  }, [table]);

  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const list = bars ?? [];
    const traces: Plotly.Data[] = [];
    list.forEach(({ name, bar }, i) => {
      if (!bar || bar.mean === null) return;
      const { color, symbol } = seriesStyle(i, dark, scheme);
      const plus = bar.hi !== null ? bar.hi - bar.mean : 0;
      const minus = bar.lo !== null ? bar.mean - bar.lo : 0;
      const err = plus > 0 || minus > 0 ? {
        type: "data" as const, array: [plus], arrayminus: [minus], symmetric: false,
        color: chrome.ink, thickness: 1.5, width: 8, visible: true,
      } : undefined;
      const hover = `${name}: mean %{y:.4g}${err ? ` (${bar.kind === "ci95" ? "95% CI"
        : bar.kind === "entered" ? "entered limits" : (bar.kind ?? "").toUpperCase()})` : ""}<extra></extra>`;
      traces.push(graphType === "bar" ? tagTrace({
        x: [i], y: [bar.mean], type: "bar", width: 0.6, name, showlegend: false,
        marker: { color: color + "55", line: { color, width: 2 } },
        error_y: err, hovertemplate: hover,
      }, { ds: i, role: "bar" }) as Plotly.Data : tagTrace({
        x: [i], y: [bar.mean], mode: "markers", name, showlegend: false,
        marker: { color, symbol, size: 11, line: { color: chrome.surface, width: 1.5 } },
        error_y: err, hovertemplate: hover,
      }, { ds: i, role: "points" }) as Plotly.Data);
    });
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 60, r: 16, t: 12, b: 48 },
      xaxis: {
        tickvals: list.map((_, i) => i), ticktext: list.map((b) => b.name),
        zeroline: false, showgrid: false, linecolor: chrome.axis, tickcolor: chrome.axis,
        tickfont: { color: chrome.ink }, range: [-0.6, list.length - 0.4],
      },
      yaxis: {
        title: { text: yTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis,
        tickcolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout };
  }, [bars, dark, scheme, graphType, yTitle]);

  const ctx = useMemo(() => ({
    dark, scheme, categorical: true, datasets: table.datasets.map((d) => d.name),
    comparisons, results,
  }), [dark, scheme, table.datasets, comparisons, results]);

  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="column-graph" />
  );
}
