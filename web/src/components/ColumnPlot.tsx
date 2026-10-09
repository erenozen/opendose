import { useEffect, useRef, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import { loadPlotly, plotlyNow } from "../lib/plotly";
import type { ColumnGraphType, DatasetState } from "../types";
import { parseCell } from "../types";
import {
  CHROME_DARK, CHROME_LIGHT, DEFAULT_SCHEME, isDarkMode, onThemeChange,
  seriesStyle, PLOT_FONT, type SchemeId,
} from "../lib/palette";
import {
  applyFormat, EMPTY_FORMAT, plotConfig, tagTrace, usePlotEdits, type Comparison,
  type GraphFormat, type ResultsBlock,
} from "../graph";
import { laneJitter, spreadOffsets, type PointSpread } from "../graph/swarm";
import { densify } from "../graph/dense";
import { areaScale, estimateArea, usePlotArea } from "../graph/usePlotArea";
import { summaryOf, type ColumnSummary } from "../sheets/column/graphSettings";

interface Props {
  datasets: DatasetState[];
  xTitle?: string;
  yTitle?: string;
  graphType?: ColumnGraphType;
  scheme?: SchemeId;
  /** Format Graph / Format Axes settings (graph/README.md). */
  format?: GraphFormat;
  onFormatChange?: (f: GraphFormat) => void;
  rowTitles?: string[];
  /** Pairwise comparisons of the bound results, for brackets / letters. */
  comparisons?: Comparison[];
  results?: Partial<Record<ResultsBlock, string>>;
  /** Centre and error bars (scatter, bar); default mean ± SD. */
  summary?: ColumnSummary;
  /** How points spread sideways; default the fixed-lane jitter. */
  spread?: PointSpread;
  /** Bar graphs: draw the individual values (default true). */
  points?: boolean;
  /** Caption drawn inside the figure (legend sentence), if any. */
  caption?: string;
}

// Prism-style column graphs: scatter (points + mean ± SD), bar, box, violin.
export default function ColumnPlot({
  datasets, xTitle = "", yTitle = "Value", graphType = "scatter",
  scheme = DEFAULT_SCHEME, format = EMPTY_FORMAT, onFormatChange, rowTitles,
  comparisons, results, summary = "mean_sd", spread = "jitter", points = true, caption,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const { rev, attach } = usePlotEdits(format, onFormatChange);
  const [area, measure] = usePlotArea();
  const spreadRef = useRef(spread);
  useEffect(() => { spreadRef.current = spread; }, [spread]);

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
          void Promise.resolve(plotlyNow()?.Plots.resize(div)).then(() => {
            if (spreadRef.current !== "jitter") measure(div);
          });
        }
      });
    });
    ro.observe(div);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [measure]);

  useEffect(() => {
    if (!el.current) return;
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    // Pixel scale for beeswarm / symmetric spreading: the drawn plot area,
    // or an estimate from the container before the first draw.
    let scale = null;
    if (spread !== "jitter") {
      const all = datasets.flatMap((d) => d.rows.flatMap((r) => r.map(parseCell)))
        .filter((v): v is number => v !== null);
      const est = area ?? estimateArea(el.current, Math.min(...all), Math.max(...all),
        [-0.6, datasets.length - 0.4]);
      scale = areaScale(est, graphType === "bar" ? 8.5 : 9.5, 0.36);
    }
    const offsets = (values: number[]) => (spread === "jitter"
      ? laneJitter(values.length) : spreadOffsets(values, spread, scale));

    datasets.forEach((ds, i) => {
      // Values in row-major order, remembering where each came from (row
      // titles label points; spaghetti lines join equal row:subcolumn keys).
      const values: number[] = [];
      const rows: number[] = [];
      const keys: string[] = [];
      ds.rows.forEach((row, r) => row.forEach((cell, sub) => {
        const v = parseCell(cell);
        if (v === null) return;
        values.push(v); rows.push(r); keys.push(`${r}:${sub}`);
      }));
      if (!values.length) return;
      const pts = { ds: i, role: "points" as const, rows, keys };
      const { color, symbol } = seriesStyle(i, dark, scheme);
      const name = ds.name || `Dataset ${i + 1}`;
      const st = summaryOf(values, summary)!;
      const mean = st.center;
      // Same object as before for symmetric bars (mean ± SD/SEM/CI).
      const errorY = st.hi > 0 || st.lo > 0
        ? (st.lo === st.hi
          ? { type: "data" as const, array: [st.hi], color: chrome.ink,
              thickness: 1.5, width: 8, visible: true }
          : { type: "data" as const, array: [st.hi], arrayminus: [st.lo], symmetric: false,
              color: chrome.ink, thickness: 1.5, width: 8, visible: true })
        : undefined;

      if (graphType === "box") {
        traces.push(tagTrace({
          y: values, x: values.map(() => i),
          type: "box",
          name,
          marker: { color },
          line: { color, width: 2 },
          fillcolor: color + "33",
          boxpoints: "all", jitter: 0.35, pointpos: 0,
          showlegend: false,
          hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        }, { ds: i, role: "box", rows, keys }) as Plotly.Data);
        return;
      }
      if (graphType === "violin") {
        traces.push(tagTrace({
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
        }, { ds: i, role: "violin", rows, keys }) as Plotly.Data);
        return;
      }
      if (graphType === "bar") {
        traces.push(tagTrace({
          x: [i], y: [mean],
          type: "bar",
          width: 0.6,
          marker: { color: color + "55",
                    line: { color, width: 2 } },
          error_y: errorY,
          name,
          showlegend: false,
          hovertemplate: `${name}: ${st.label}<extra></extra>`,
        }, { ds: i, role: "bar" }) as Plotly.Data);
        if (!points) return;
        const off = offsets(values);
        const xs = values.map((_, j) => i + off[j]);
        traces.push(tagTrace({
          x: xs, y: values,
          mode: "markers",
          marker: { color, symbol, size: 7,
                    line: { color: chrome.surface, width: 1.5 } },
          showlegend: false,
          hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        }, pts) as Plotly.Data);
        return;
      }

      // scatter (default): individual points with mean ± SD whiskers
      const off = offsets(values);
      const xs = values.map((_, j) => i + off[j]);
      traces.push(tagTrace({
        x: xs, y: values,
        mode: "markers",
        marker: {
          color, symbol, size: 8,
          line: { color: chrome.surface, width: 1.5 },
        },
        name,
        hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        showlegend: false,
      }, pts) as Plotly.Data);
      traces.push(tagTrace({
        x: [i], y: [mean],
        mode: "markers",
        marker: { color: chrome.ink, symbol: "line-ew", size: 26,
                  line: { color: chrome.ink, width: 2.5 } },
        error_y: errorY,
        hovertemplate: `${st.label}<extra></extra>`,
        showlegend: false,
      }, { ds: i, role: "summary" }) as Plotly.Data);
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
    const out = applyFormat(traces as never, layout, format, {
      dark, scheme, categorical: true, datasets: datasets.map((d) => d.name),
      rowTitles, comparisons, results, editRevision: rev, caption,
    });
    const div = el.current;
    void loadPlotly().then((P) => P.react(div, densify(out.traces).traces as Plotly.Data[], out.layout, plotConfig({
      responsive: true, scrollZoom: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "column-graph" },
    }, format, !!onFormatChange))).then(() => {
      attach(div);
      if (spread !== "jitter") measure(div);
    });
  }, [datasets, dark, xTitle, yTitle, graphType, scheme, format, rev, rowTitles,
    comparisons, results, onFormatChange, attach, summary, spread, points, caption, area,
    measure]);

  return <div className="plot" ref={el} />;
}
