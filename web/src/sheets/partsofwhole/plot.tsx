// Parts-of-whole graphs: pie, donut, stacked bars (absolute or 100%).
// They plot the data table itself; options (which data set, slice labels,
// legend, starting angle) live in the graph sheet's settings under "pow"
// and are edited from the graph's Settings panel (PowOptions). Format
// graph treats each part (row) as a "data set": colour, legend text,
// show / hide and order per part; title, legend, fonts and annotations
// for the whole graph.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptInput, OptSelect } from "../../components/GraphOptionControls";
import {
  datasetFmt, EMPTY_FORMAT, plottedOrder, rgba, tagTrace, type GraphFormat,
} from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import {
  CHROME_DARK, CHROME_LIGHT, PLOT_FONT, SCHEMES, seriesColor, type SchemeId,
} from "../../lib/palette";
import { formatSig } from "../../types";
import { asRecord, useGraphOptions } from "../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../types";
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

function partStyle(i: number, dark: boolean, scheme: SchemeId, format: GraphFormat) {
  const s = SCHEMES[scheme] ?? SCHEMES.default;
  const n = (dark ? s.dark : s.light).length;
  const f = datasetFmt(format, i);
  const base = f.color ?? seriesColor(i, dark, scheme);
  const color = f.fillAlpha != null ? rgba(base, f.fillAlpha) : base;
  const shape = f.pattern ?? (n === 1 ? PATTERNS[i % PATTERNS.length]
    : PATTERNS[Math.floor(i / n) % PATTERNS.length]);
  return { color, shape };
}

export function PowPlot({ graph, table, titles, scheme, format, onFormatChange }: PlotProps) {
  const dark = useDarkMode();
  const opts = sanitize(graph.settings.pow);
  const kind = graph.graphType;
  const isPie = kind === GRAPH_PIE || kind === GRAPH_DONUT;
  const dataset = Math.min(opts.dataset, Math.max(0, table.datasets.length - 1));
  const fmt = format ?? EMPTY_FORMAT;
  // Format graph's legend choice wins over the quick option.
  const legendOn = fmt.legend?.show === "hide" ? false
    : fmt.legend?.show === "show" ? true : opts.legend;

  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const names = partNames(table);
    const label = (r: number) => datasetFmt(fmt, r).legend ?? names[r];
    // Parts in plotting order, hidden ones left out.
    const order = plottedOrder(fmt, names.length);
    const traces: Plotly.Data[] = [];
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface,
      plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      showlegend: legendOn,
      legend: { font: { color: chrome.ink }, bgcolor: "rgba(0,0,0,0)" },
      uirevision: "keep",
    };
    let empty = false;

    if (isPie) {
      const values = columnValues(table, dataset);
      const idx = order.filter((r) => { const v = values[r]; return v !== null && v > 0; });
      empty = idx.length === 0;
      const total = idx.reduce((a, r) => a + (values[r] as number), 0);
      const styles = idx.map((r) => partStyle(r, dark, scheme, fmt));
      const info: Record<SliceLabels, string> = {
        percent: "percent", value: "value", both: "value+percent", none: "none",
      };
      let textinfo = info[opts.labels];
      if (!legendOn && textinfo !== "none") textinfo = `label+${textinfo}`;
      else if (!legendOn) textinfo = "label";
      const title = titles.y.trim() || datasetName(table, dataset);
      traces.push({
        type: "pie",
        labels: idx.map(label),
        values: idx.map((r) => values[r] as number),
        hole: kind === GRAPH_DONUT ? 0.5 : 0,
        sort: false,
        direction: "clockwise",
        rotation: opts.rotation,
        textinfo,
        textposition: "outside",
        automargin: true,
        // Family and size follow the layout font (Format graph > Fonts).
        outsidetextfont: { color: chrome.ink },
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
        text: title, font: { color: chrome.ink, size: fmt.font?.titleSize ?? 15 },
        x: 0.5, xanchor: "center", y: 0.98, yanchor: "top",
      } as Plotly.Layout["title"];
      layout.legend = { ...layout.legend, x: 1, xanchor: "left", y: 0.5, yanchor: "middle" };
      if (kind === GRAPH_DONUT && !empty) {
        layout.annotations = [{
          text: `Total<br><b>${formatSig(total)}</b>`, showarrow: false,
          font: { color: chrome.ink, size: 14 },
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
        const st = partStyle(r, dark, scheme, fmt);
        // Hidden parts, order, legend text, borders and patterns: applyFormat.
        traces.push(tagTrace({
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
        }, { ds: r, role: "bar" }) as unknown as Plotly.Data);
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
    return { traces, layout, names };
  }, [table, dark, scheme, titles.y, opts.labels, opts.rotation, legendOn, dataset, kind,
    isPie, fmt]);

  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names }), [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="parts-of-whole"
      scrollZoom={false} />
  );
}

/** Graph options in the Settings panel: data set, labels, legend, angle. */
export function PowOptions({ graph, table }: GraphOptionsProps) {
  const [opts, setOpts] = useGraphOptions(graph, "pow", sanitize);
  const isPie = graph.graphType === GRAPH_PIE || graph.graphType === GRAPH_DONUT;
  const dataset = Math.min(opts.dataset, Math.max(0, table.datasets.length - 1));
  return (
    <>
      {isPie && table.datasets.length > 1 && (
        <OptSelect label="Data set" value={String(dataset)}
          options={table.datasets.map((_, d) => [String(d), datasetName(table, d)] as const)}
          onChange={(v) => setOpts({ dataset: Number(v) })} />
      )}
      <OptSelect label={isPie ? "Slice labels" : "Labels"} value={opts.labels}
        options={(Object.keys(LABELS) as SliceLabels[]).map((k) => [k, LABELS[k]] as const)}
        onChange={(labels) => setOpts({ labels })} />
      {isPie && (
        <OptInput label="Start angle" type="number" min={0} max={345} step={15}
          value={opts.rotation} suffix="°"
          ariaLabel="Start angle in degrees, clockwise from 12 o'clock"
          onChange={(raw) => {
            const v = Number(raw);
            if (raw !== "" && Number.isFinite(v)) {
              setOpts({ rotation: ((Math.round(v) % 360) + 360) % 360 });
            }
          }} />
      )}
      <OptCheck label="Legend" checked={opts.legend}
        onChange={(legend) => setOpts({ legend })} />
    </>
  );
}
