import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import type { ColumnGraphType, DatasetState } from "../types";
import { parseCell } from "../types";
import {
  CHROME_DARK, CHROME_LIGHT, DEFAULT_SCHEME, isDarkMode, onThemeChange,
  seriesStyle, PLOT_FONT, type SchemeId,
} from "../lib/palette";

interface Props {
  datasets: DatasetState[];
  xTitle?: string;
  yTitle?: string;
  graphType?: ColumnGraphType;
  scheme?: SchemeId;
}

// Prism-style column graphs: scatter (points + mean ± SD), bar, box, violin.
export default function ColumnPlot({
  datasets, xTitle = "", yTitle = "Value", graphType = "scatter",
  scheme = DEFAULT_SCHEME,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  // Redraw when the island or column is resized (splitter drag, the
  // card's resize handle); Plotly's own listener only covers the window.
  useEffect(() => {
    const div = el.current;
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
    if (!el.current) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];

    datasets.forEach((ds, i) => {
      const values = ds.rows.flat().map(parseCell)
        .filter((v): v is number => v !== null);
      if (!values.length) return;
      const { color, symbol } = seriesStyle(i, dark, scheme);
      const name = ds.name || `Dataset ${i + 1}`;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sd = values.length > 1
        ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1))
        : 0;

      if (graphType === "box") {
        traces.push({
          y: values, x: values.map(() => i),
          type: "box",
          name,
          marker: { color },
          line: { color, width: 2 },
          fillcolor: color + "33",
          boxpoints: "all", jitter: 0.35, pointpos: 0,
          showlegend: false,
          hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        } as Plotly.Data);
        return;
      }
      if (graphType === "violin") {
        traces.push({
          y: values, x: values.map(() => i),
          type: "violin",
          name,
          marker: { color },
          line: { color, width: 2 },
          fillcolor: color + "33",
          points: "all", jitter: 0.35, pointpos: 0,
          meanline: { visible: true },
          showlegend: false,
          hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        } as Plotly.Data);
        return;
      }
      if (graphType === "bar") {
        traces.push({
          x: [i], y: [mean],
          type: "bar",
          width: 0.6,
          marker: { color: color + "55",
                    line: { color, width: 2 } },
          error_y: sd > 0
            ? { type: "data", array: [sd], color: chrome.ink,
                thickness: 1.5, width: 8, visible: true }
            : undefined,
          name,
          showlegend: false,
          hovertemplate:
            `${name}: mean ${mean.toPrecision(4)} ± SD ${sd.toPrecision(4)}<extra></extra>`,
        } as Plotly.Data);
        const xs = values.map((_, j) =>
          i + (values.length > 1 ? ((j % 5) - 2) * 0.045 : 0));
        traces.push({
          x: xs, y: values,
          mode: "markers",
          marker: { color, symbol, size: 7,
                    line: { color: chrome.surface, width: 1.5 } },
          showlegend: false,
          hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        } as Plotly.Data);
        return;
      }

      // scatter (default): individual points with mean ± SD whiskers
      const xs = values.map((_, j) =>
        i + (values.length > 1 ? ((j % 5) - 2) * 0.045 : 0));
      traces.push({
        x: xs, y: values,
        mode: "markers",
        marker: {
          color, symbol, size: 8,
          line: { color: chrome.surface, width: 1.5 },
        },
        name,
        hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        showlegend: false,
      } as Plotly.Data);
      traces.push({
        x: [i], y: [mean],
        mode: "markers",
        marker: { color: chrome.ink, symbol: "line-ew", size: 26,
                  line: { color: chrome.ink, width: 2.5 } },
        error_y: sd > 0
          ? { type: "data", array: [sd], color: chrome.ink,
              thickness: 1.5, width: 8, visible: true }
          : undefined,
        hovertemplate: `mean ${mean.toPrecision(4)} ± SD ${sd.toPrecision(4)}<extra></extra>`,
        showlegend: false,
      } as Plotly.Data);
    });

    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: {
        family: PLOT_FONT,
        color: chrome.inkSecondary, size: 13,
      },
      margin: { l: 60, r: 16, t: 12, b: 48 },
      xaxis: {
        title: xTitle
          ? { text: xTitle, font: { color: chrome.inkSecondary } }
          : undefined,
        tickvals: datasets.map((_, i) => i),
        ticktext: datasets.map((d, i) => d.name || `Dataset ${i + 1}`),
        zeroline: false, showgrid: false,
        linecolor: chrome.axis, tickcolor: chrome.axis,
        tickfont: { color: chrome.ink },
        range: [-0.6, datasets.length - 0.4],
      },
      yaxis: {
        title: { text: yTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false,
        linecolor: chrome.axis, tickcolor: chrome.axis,
        tickfont: { color: chrome.muted },
      },
    };

    layout.dragmode = "pan";
    layout.uirevision = "keep";
    Plotly.react(el.current, traces, layout, {
      responsive: true, scrollZoom: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "column-graph" },
    });
  }, [datasets, dark, xTitle, yTitle, graphType, scheme]);

  return <div className="plot" ref={el} />;
}
