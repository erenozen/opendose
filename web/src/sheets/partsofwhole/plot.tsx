// Parts-of-whole graphs: pie, donut, stacked bars (absolute or 100%).
// They plot the data table itself; options (which data set, slice labels,
// legend, starting angle) live in the graph sheet's settings under "pow".
import "../common/sheetKit.css";
import { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, SCHEMES, isDarkMode, onThemeChange,
  seriesColor, type SchemeId,
} from "../../lib/palette";
import { formatSig } from "../../types";
import { asRecord, useGraphOptions } from "../common/graphOptions";
import type { PlotProps } from "../types";
import {
  GRAPH_DONUT, GRAPH_PIE, GRAPH_STACKED100, columnValues, datasetName, partNames,
} from "./run";

export type SliceLabels = "percent" | "value" | "both" | "none";

export interface PowGraphOptions {
  dataset: number;
  labels: SliceLabels;
  legend: boolean;
  rotation: number;   // degrees clockwise from 12 o'clock
}

const LABELS: Record<SliceLabels, string> = {
  percent: "Percent", value: "Value", both: "Value and percent", none: "None",
};

function sanitize(raw: unknown): PowGraphOptions {
  const o = asRecord(raw);
  const rot = Number(o.rotation);
  return {
    dataset: Number.isInteger(o.dataset) && (o.dataset as number) >= 0 ? o.dataset as number : 0,
    labels: (Object.keys(LABELS) as string[]).includes(o.labels as string)
      ? o.labels as SliceLabels : "percent",
    legend: o.legend !== false,
    rotation: Number.isFinite(rot) ? ((Math.round(rot) % 360) + 360) % 360 : 0,
  };
}

// Pattern fills take over once a scheme's colors run out (and from the
// first slice in black and white), so neighbouring slices never look alike.
const PATTERNS = ["", "/", "\\", "x", ".", "-", "|", "+"];

function partStyle(i: number, dark: boolean, scheme: SchemeId) {
  const s = SCHEMES[scheme] ?? SCHEMES.default;
  const n = (dark ? s.dark : s.light).length;
  const color = seriesColor(i, dark, scheme);
  const shape = n === 1 ? PATTERNS[i % PATTERNS.length]
    : PATTERNS[Math.floor(i / n) % PATTERNS.length];
  return { color, shape };
}

export function PowPlot({ graph, table, titles, scheme }: PlotProps) {
  const el = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(isDarkMode());
  const [opts, setOpts] = useGraphOptions(graph, "pow", sanitize);
  const kind = graph.graphType;
  const isPie = kind === GRAPH_PIE || kind === GRAPH_DONUT;
  const dataset = Math.min(opts.dataset, Math.max(0, table.datasets.length - 1));

  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  // Redraw when the island or column is resized (splitter drag, the card's
  // resize handle); Plotly's own listener only covers the window.
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
    const names = partNames(table);
    const traces: Plotly.Data[] = [];
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      showlegend: opts.legend,
      legend: { font: { color: chrome.ink }, bgcolor: "rgba(0,0,0,0)" },
      uirevision: "keep",
    };
    let empty = false;

    if (isPie) {
      const values = columnValues(table, dataset);
      const idx = values.map((v, r) => (v !== null && v > 0 ? r : -1)).filter((r) => r >= 0);
      empty = idx.length === 0;
      const total = idx.reduce((a, r) => a + (values[r] as number), 0);
      const styles = idx.map((r) => partStyle(r, dark, scheme));
      const info: Record<SliceLabels, string> = {
        percent: "percent", value: "value", both: "value+percent", none: "none",
      };
      let textinfo = info[opts.labels];
      if (!opts.legend && textinfo !== "none") textinfo = `label+${textinfo}`;
      else if (!opts.legend) textinfo = "label";
      const title = titles.y.trim() || datasetName(table, dataset);
      traces.push({
        type: "pie",
        labels: idx.map((r) => names[r]),
        values: idx.map((r) => values[r] as number),
        hole: kind === GRAPH_DONUT ? 0.5 : 0,
        sort: false,
        direction: "clockwise",
        rotation: opts.rotation,
        textinfo,
        textposition: "outside",
        automargin: true,
        outsidetextfont: { color: chrome.ink, family: PLOT_FONT, size: 13 },
        marker: {
          colors: styles.map((s) => s.color),
          line: { color: chrome.surface, width: 2 },
          pattern: {
            shape: styles.map((s) => s.shape),
            fgcolor: chrome.surface,
            bgcolor: styles.map((s) => s.color),
            solidity: 0.35,
          },
        },
        hovertemplate: "%{label}: %{value} (%{percent})<extra></extra>",
        name: title,
      } as unknown as Plotly.Data);
      layout.margin = { l: 24, r: 24, t: 44, b: 24 };
      layout.title = {
        text: title, font: { color: chrome.ink, size: 15, family: PLOT_FONT },
        x: 0.5, xanchor: "center", y: 0.98, yanchor: "top",
      } as Plotly.Layout["title"];
      layout.legend = { ...layout.legend, x: 1, xanchor: "left", y: 0.5, yanchor: "middle" };
      if (kind === GRAPH_DONUT && !empty) {
        layout.annotations = [{
          text: `Total<br><b>${formatSig(total)}</b>`, showarrow: false,
          font: { color: chrome.ink, size: 14, family: PLOT_FONT },
          x: 0.5, y: 0.5, xref: "paper", yref: "paper",
        }];
      }
    } else {
      const normalize = kind === GRAPH_STACKED100;
      const cols = table.datasets.map((_, d) => columnValues(table, d));
      const totals = cols.map((c) => c.reduce<number>((a, v) => a + (v ?? 0), 0));
      const xs = table.datasets.map((_, d) => datasetName(table, d));
      empty = !cols.some((c) => c.some((v) => v !== null));
      names.forEach((name, r) => {
        const raw = cols.map((c) => c[r]);
        if (raw.every((v) => v === null)) return;
        const pct = raw.map((v, d) => (v !== null && totals[d] ? 100 * v / totals[d] : null));
        const ys = normalize ? pct : raw;
        const text = raw.map((v, d) => {
          if (v === null) return "";
          const p = pct[d] !== null ? `${formatSig(pct[d] as number, 3)}%` : "";
          return opts.labels === "value" ? formatSig(v)
            : opts.labels === "percent" ? p
              : opts.labels === "both" ? `${formatSig(v)} (${p})` : "";
        });
        const st = partStyle(r, dark, scheme);
        traces.push({
          type: "bar",
          name,
          x: xs,
          y: ys,
          text,
          textposition: opts.labels === "none" ? "none" : "inside",
          insidetextanchor: "middle",
          customdata: raw.map((v, d) => [v ?? "", pct[d] !== null ? formatSig(pct[d] as number, 3) : ""]),
          hovertemplate: `${name}: %{customdata[0]} (%{customdata[1]}%)<extra>%{x}</extra>`,
          marker: {
            color: st.color,
            line: { color: chrome.surface, width: 1 },
            pattern: { shape: st.shape, fgcolor: chrome.surface, bgcolor: st.color, solidity: 0.35 },
          },
        } as unknown as Plotly.Data);
      });
      layout.barmode = "stack";
      layout.bargap = 0.45;
      layout.margin = { l: 64, r: 16, t: 12, b: 48 };
      layout.xaxis = {
        type: "category", showgrid: false, zeroline: false,
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.ink },
      };
      layout.yaxis = {
        title: { text: titles.y, font: { color: chrome.inkSecondary } },
        gridcolor: chrome.grid, zeroline: false, rangemode: "tozero",
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.muted },
        ...(normalize ? { range: [0, 100], ticksuffix: "%" } : {}),
      };
      layout.legend = { ...layout.legend, traceorder: "reversed" };
    }
    if (empty) {
      layout.annotations = [{
        text: "Enter values in the data table to draw this graph",
        showarrow: false, font: { color: chrome.muted, size: 13 },
        x: 0.5, y: 0.5, xref: "paper", yref: "paper",
      }];
      if (!isPie) {
        layout.xaxis = { ...layout.xaxis, visible: false };
        layout.yaxis = { ...layout.yaxis, visible: false };
      }
    }
    Plotly.react(el.current, traces, layout, {
      responsive: true, displaylogo: false,
      toImageButtonOptions: { format: "svg", filename: "parts-of-whole" },
    });
  }, [table, dark, scheme, titles.y, opts.labels, opts.legend, opts.rotation,
    dataset, kind, isPie]);

  return (
    <>
      {!graph.frozen && (
        <div className="graph-opts" role="group" aria-label="Graph options">
          {isPie && table.datasets.length > 1 && (
            <label>
              Data set
              <select value={dataset} onChange={(e) => setOpts({ dataset: Number(e.target.value) })}>
                {table.datasets.map((_, d) => (
                  <option key={d} value={d}>{datasetName(table, d)}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            {isPie ? "Slice labels" : "Labels"}
            <select value={opts.labels}
              onChange={(e) => setOpts({ labels: e.target.value as SliceLabels })}>
              {(Object.keys(LABELS) as SliceLabels[]).map((k) => (
                <option key={k} value={k}>{LABELS[k]}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={opts.legend}
              onChange={(e) => setOpts({ legend: e.target.checked })} />
            Legend
          </label>
          {isPie && (
            <label>
              Start angle
              <input type="number" min={0} max={345} step={15} value={opts.rotation}
                aria-label="Start angle in degrees, clockwise from 12 o'clock"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setOpts({ rotation: ((Math.round(v) % 360) + 360) % 360 });
                }} />
              °
            </label>
          )}
        </div>
      )}
      <div className="plot" ref={el} />
    </>
  );
}
