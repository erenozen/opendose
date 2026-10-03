import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { getEngine } from "../../lib/engine";
import {
  CHROME_DARK, CHROME_LIGHT, isDarkMode, onThemeChange, PLOT_FONT, seriesStyle,
  type SchemeId,
} from "../../lib/palette";
import { numericData } from "../../project/table";
import { SUBCOLUMN_FORMAT_ENGINE, type DataTableModel } from "../../project/types";

interface Bar { mean: number | null; lo: number | null; hi: number | null; kind: string | null }

/**
 * Column graph of data entered as summaries (mean with SD / SEM / %CV /
 * CI / errors / limits): one bar or mean marker per group with the error
 * bar that was entered, read through the engine's summary_convert. Raw
 * points, box and violin plots need the raw values, so they are not
 * drawn. One group per dataset: its first row with a mean.
 */
export default function SummaryPlot({ table, graphType, scheme, yTitle }: {
  table: DataTableModel;
  graphType: string;
  scheme: SchemeId;
  yTitle: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const [bars, setBars] = useState<{ name: string; bar: Bar | null }[] | null>(null);

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  useEffect(() => {
    let live = true;
    void getEngine().then((engine) => {
      const sets = numericData(table).datasets;
      const r = engine.analyze({
        analysis: "summary_convert",
        data: { format: SUBCOLUMN_FORMAT_ENGINE[table.subcolumnFormat],
          datasets: sets.map((d) => ({ name: d.name, rows: d.ys })) },
        options: { error_bars: "entered" },
      }) as { error?: string; datasets?: { name: string; bars: Bar[] }[] };
      if (!live) return;
      setBars((r.datasets ?? []).map((d) => ({
        name: d.name, bar: d.bars.find((b) => b.mean !== null) ?? null,
      })));
    });
    return () => { live = false; };
  }, [table]);

  useEffect(() => {
    const div = el.current;
    if (!div || !bars) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    bars.forEach(({ name, bar }, i) => {
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
      traces.push(graphType === "bar" ? {
        x: [i], y: [bar.mean], type: "bar", width: 0.6, name, showlegend: false,
        marker: { color: color + "55", line: { color, width: 2 } },
        error_y: err, hovertemplate: hover,
      } as Plotly.Data : {
        x: [i], y: [bar.mean], mode: "markers", name, showlegend: false,
        marker: { color, symbol, size: 11, line: { color: chrome.surface, width: 1.5 } },
        error_y: err, hovertemplate: hover,
      } as Plotly.Data);
    });
    Plotly.react(div, traces, {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 60, r: 16, t: 12, b: 48 },
      xaxis: {
        tickvals: bars.map((_, i) => i), ticktext: bars.map((b) => b.name),
        zeroline: false, showgrid: false, linecolor: chrome.axis, tickcolor: chrome.axis,
        tickfont: { color: chrome.ink }, range: [-0.6, bars.length - 0.4],
      },
      yaxis: {
        title: { text: yTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false, linecolor: chrome.axis,
        tickcolor: chrome.axis, tickfont: { color: chrome.muted },
      },
      dragmode: "pan", uirevision: "keep",
    }, {
      responsive: true, scrollZoom: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "column-graph" },
    });
  }, [bars, dark, scheme, graphType, yTitle]);

  return <div className="plot" ref={el} />;
}
