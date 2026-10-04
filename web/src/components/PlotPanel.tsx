import { useEffect, useRef, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { loadPlotly, plotlyNow } from "../lib/plotly";
import { graphPStyle } from "../graph/significance";
import type { AnalysisResult } from "../types";
import { niceTicks } from "../project/xformat";
import {
  CHROME_DARK, CHROME_LIGHT, DEFAULT_SCHEME, isDarkMode, onThemeChange,
  seriesStyle, PLOT_FONT, type SchemeId,
} from "../lib/palette";
import {
  applyFormat, EMPTY_FORMAT, plotConfig, resultBlocks, tagTrace, usePlotEdits,
  type GraphFormat,
} from "../graph";

/** An extra fitted curve drawn with a data set (`altCurves` on a data
 *  set of the result): dotted, in the data set's colour or in ink. */
interface AltCurve {
  label: string;
  curve: { x: number[]; y: number[] };
  ink?: boolean;
}

interface Props {
  result: AnalysisResult | null;
  xTitle: string;
  yTitle: string;
  scheme?: SchemeId;
  /** X tick labels for date / elapsed-time X columns (data table format). */
  xTickFormat?: (v: number) => string;
  /** Format Graph / Format Axes settings (graph/README.md). */
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  /** Row titles of the table, for point labels. */
  rowTitles?: string[];
}

export default function PlotPanel({
  result, xTitle, yTitle, scheme = DEFAULT_SCHEME, xTickFormat, format = EMPTY_FORMAT,
  onFormatChange, rowTitles,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const { rev, attach } = usePlotEdits(format, onFormatChange);

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
        // Not while hidden (a Suspense fallback shows): Plotly refuses.
        if ((div as unknown as { _fullLayout?: unknown })._fullLayout
          && div.getClientRects().length) {
          plotlyNow()?.Plots.resize(div);
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
      const { color, symbol, dash } = seriesStyle(i, dark, scheme);
      const bars = ds.points.bars;
      const xs: number[] = [];
      const ys: number[] = [];
      const rows: number[] = [];
      const plus: number[] = [];
      const minus: number[] = [];
      ds.points.x.forEach((xv, r) => {
        const b = bars[r];
        if (xv === null || b?.mean == null) return;
        xs.push(xv);
        ys.push(b.mean);
        rows.push(r);
        plus.push(b.hi != null ? b.hi - b.mean : 0);
        minus.push(b.lo != null ? b.mean - b.lo : 0);
      });
      const hasBars = plus.some((v) => v > 0) || minus.some((v) => v > 0);

      if (ds.bands) {
        traces.push(tagTrace({
          x: [...ds.bands.x, ...[...ds.bands.x].reverse()],
          y: [...ds.bands.upper, ...[...ds.bands.lower].reverse()],
          fill: "toself",
          fillcolor: color + "22",
          line: { width: 0 },
          name: `${ds.name} band`,
          legendgroup: ds.name,
          showlegend: false,
          hoverinfo: "skip",
        }, { ds: i, role: "band" }) as Plotly.Data);
      }
      if (ds.fit) {
        traces.push(tagTrace({
          x: ds.fit.curve.x,
          y: ds.fit.curve.y,
          mode: "lines",
          line: { color, width: 2, dash },
          name: ds.name,
          legendgroup: ds.name,
          hoverinfo: "skip",
        }, { ds: i, role: "fit" }) as Plotly.Data);
      }
      // Other curves drawn with this data set (comparison of fits: model 2,
      // or one curve for all data sets), dotted.
      const alts = (ds as { altCurves?: AltCurve[] }).altCurves ?? [];
      for (const a of alts) {
        traces.push(tagTrace({
          x: a.curve.x,
          y: a.curve.y,
          mode: "lines",
          line: { color: a.ink ? chrome.ink : color, width: 2, dash: "dot" },
          name: a.label,
          legendgroup: `${ds.name} ${a.label}`,
          hoverinfo: "skip",
        }, a.ink ? { ds: -1, role: "decor" } : { ds: i, role: "fit" }) as Plotly.Data);
      }
      if (ds.rout && ds.rout.outliers.length > 0) {
        traces.push(tagTrace({
          x: ds.rout.outliers.map((o) => o.x),
          y: ds.rout.outliers.map((o) => o.y),
          mode: "markers",
          marker: { color, size: 11, symbol: "x-thin",
                    line: { color, width: 2 } },
          name: `${ds.name} (outliers)`,
          legendgroup: ds.name,
          showlegend: false,
          hovertemplate: "eliminated by ROUT<extra></extra>",
        }, { ds: i, role: "outliers" }) as Plotly.Data);
      }
      traces.push(tagTrace({
        x: xs,
        y: ys,
        mode: "markers",
        marker: {
          color, symbol, size: 9,
          line: { color: chrome.surface, width: 2 },
        },
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
      }, { ds: i, role: "points", rows }) as Plotly.Data);
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

    if (xTickFormat && layout.xaxis) {
      const xs = traces.flatMap((tr) => ((tr as { x?: unknown[] }).x ?? []))
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (xs.length) {
        const vals = niceTicks(Math.min(...xs), Math.max(...xs), 6);
        layout.xaxis.tickvals = vals;
        layout.xaxis.ticktext = vals.map(xTickFormat);
      }
    }

    const out = applyFormat(traces as never, layout, format, {
      dark, scheme, datasets: result.datasets.map((d) => d.name), rowTitles,
      results: resultBlocks(result, graphPStyle(format)), editRevision: rev,
    });
    const div = el.current;
    void loadPlotly().then((P) => P.react(div, out.traces as Plotly.Data[], out.layout, plotConfig({
      responsive: true,
      scrollZoom: true,
      displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "dose-response" },
    }, format, !!onFormatChange))).then(() => attach(div));
  }, [result, dark, xTitle, yTitle, scheme, xTickFormat, format, rev, rowTitles, onFormatChange, attach]);

  return <div className="plot" ref={el} />;
}
