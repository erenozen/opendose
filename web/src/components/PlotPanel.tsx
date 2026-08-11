import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import type { AnalysisResult } from "../types";
import {
  CHROME_DARK, CHROME_LIGHT, isDarkMode, onThemeChange, seriesColor, PLOT_FONT,
} from "../lib/palette";

interface Props {
  result: AnalysisResult | null;
  xTitle: string;
  yTitle: string;
}

export default function PlotPanel({ result, xTitle, yTitle }: Props) {
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
    if (!el.current || !result || result.error) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];

    result.datasets.forEach((ds, i) => {
      const color = seriesColor(i, dark);
      const bars = ds.points.bars;
      const xs: number[] = [];
      const ys: number[] = [];
      const plus: number[] = [];
      const minus: number[] = [];
      ds.points.x.forEach((xv, r) => {
        const b = bars[r];
        if (xv === null || b?.mean == null) return;
        xs.push(xv);
        ys.push(b.mean);
        plus.push(b.hi != null ? b.hi - b.mean : 0);
        minus.push(b.lo != null ? b.mean - b.lo : 0);
      });
      const hasBars = plus.some((v) => v > 0) || minus.some((v) => v > 0);

      if (ds.bands) {
        traces.push({
          x: [...ds.bands.x, ...[...ds.bands.x].reverse()],
          y: [...ds.bands.upper, ...[...ds.bands.lower].reverse()],
          fill: "toself",
          fillcolor: color + "22",
          line: { width: 0 },
          name: `${ds.name} band`,
          legendgroup: ds.name,
          showlegend: false,
          hoverinfo: "skip",
        } as Plotly.Data);
      }
      if (ds.fit) {
        traces.push({
          x: ds.fit.curve.x,
          y: ds.fit.curve.y,
          mode: "lines",
          line: { color, width: 2 },
          name: ds.name,
          legendgroup: ds.name,
          hoverinfo: "skip",
        });
      }
      if (ds.rout && ds.rout.outliers.length > 0) {
        traces.push({
          x: ds.rout.outliers.map((o) => o.x),
          y: ds.rout.outliers.map((o) => o.y),
          mode: "markers",
          marker: { color, size: 11, symbol: "x-thin",
                    line: { color, width: 2 } },
          name: `${ds.name} (outliers)`,
          legendgroup: ds.name,
          showlegend: false,
          hovertemplate: "eliminated by ROUT<extra></extra>",
        } as Plotly.Data);
      }
      traces.push({
        x: xs,
        y: ys,
        mode: "markers",
        marker: { color, size: 9, line: { color: chrome.surface, width: 2 } },
        name: ds.name,
        legendgroup: ds.name,
        showlegend: !ds.fit,
        error_y: hasBars
          ? {
              type: "data", array: plus, arrayminus: minus,
              color, thickness: 1.5, width: 4, visible: true,
            }
          : undefined,
        hovertemplate:
          `${ds.name}<br>log[C] = %{x:.3g}<br>response = %{y:.4g}<extra></extra>`,
      } as Plotly.Data);
    });

    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: {
        family: PLOT_FONT,
        color: chrome.inkSecondary,
        size: 13,
      },
      margin: { l: 60, r: 16, t: 8, b: 48 },
      xaxis: {
        title: { text: xTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid,
        zeroline: false,
        linecolor: chrome.axis,
        tickcolor: chrome.axis,
        tickfont: { color: chrome.muted },
      },
      yaxis: {
        title: { text: yTitle, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid,
        zeroline: false,
        linecolor: chrome.axis,
        tickcolor: chrome.axis,
        tickfont: { color: chrome.muted },
      },
      legend: {
        orientation: "h",
        y: 1.02, yanchor: "bottom", x: 0,
        font: { color: chrome.ink },
      },
      hovermode: "closest",
      // Hand-drag pans without changing zoom; wheel zooms; the view
      // survives re-fits (uirevision) and double-click resets it.
      dragmode: "pan",
      uirevision: "keep",
    };

    Plotly.react(el.current, traces, layout, {
      responsive: true,
      scrollZoom: true,
      displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "dose-response" },
    });
  }, [result, dark, xTitle, yTitle]);

  return <div className="plot" ref={el} />;
}
