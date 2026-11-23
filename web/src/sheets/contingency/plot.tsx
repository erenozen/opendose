// Contingency-table graphs (bars.ts): stacked to 100% of each group, stacked
// counts, or grouped counts. Format graph treats each outcome (column) as
// a data set: colour, legend text, show / hide and order per outcome.
// Brackets join two rows' stacks with the adjusted P of the pairs of rows
// (P-14, brackets.ts); grouped bars refuse them and say why.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptNote, OptSelect } from "../../components/GraphOptionControls";
import { datasetFmt, EMPTY_FORMAT, tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesColor } from "../../lib/palette";
import { formatSig } from "../../types";
import { asRecord, useGraphOptions } from "../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../types";
import { contingencyBars, GRAPH_CT_GROUPED, GRAPH_CT_PERCENT, outcomeNames } from "./bars";
import { ctBracketRefusal, ctComparisons } from "./brackets";

type Labels = "percent" | "value" | "both" | "none";
const LABELS: Record<Labels, string> = { percent: "Percent", value: "Count", both: "Count and percent", none: "None" };

interface CtGraphOptions { labels: Labels; legend: boolean }

function sanitize(raw: unknown): CtGraphOptions {
  const o = asRecord(raw);
  return {
    labels: (Object.keys(LABELS) as string[]).includes(o.labels as string) ? o.labels as Labels : "percent",
    legend: o.legend !== false,
  };
}

/** Ticks of the percent axis when brackets lift its top above 100%. */
const PERCENT_TICKS = [0, 20, 40, 60, 80, 100];

export function CtPlot({ graph, table, result, titles, scheme, format, onFormatChange }: PlotProps) {
  const dark = useDarkMode();
  const opts = sanitize(graph.settings.ct);
  const kind = graph.graphType;
  const fmt = format ?? EMPTY_FORMAT;
  const legendOn = fmt.legend?.show === "hide" ? false : fmt.legend?.show === "show" ? true : opts.legend;
  const cmp = useMemo(() => ctComparisons(result, table, kind), [result, table, kind]);
  const brackets = !!fmt.comparisons?.show && !!cmp?.comparisons.length;
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const data = contingencyBars(table);
    const percentY = kind === GRAPH_CT_PERCENT;
    const traces: Plotly.Data[] = data.series.map((s, d) => {
      const base = datasetFmt(fmt, d).color ?? seriesColor(d, dark, scheme);
      const text = s.counts.map((v, k) => {
        if (v === null) return "";
        const p = s.percent[k] !== null ? `${formatSig(s.percent[k] as number, 3)}%` : "";
        return opts.labels === "value" ? formatSig(v) : opts.labels === "percent" ? p
          : opts.labels === "both" ? `${formatSig(v)} (${p})` : "";
      });
      return tagTrace({
        type: "bar", name: s.name, x: data.groups, y: percentY ? s.percent : s.counts, text,
        textposition: opts.labels === "none" ? "none" : kind === GRAPH_CT_GROUPED ? "outside" : "inside",
        insidetextanchor: "middle",
        customdata: s.counts.map((v, k) => [v ?? "", s.percent[k] !== null ? formatSig(s.percent[k] as number, 3) : ""]),
        hovertemplate: `${s.name}: %{customdata[0]} (%{customdata[1]}% of the group)<extra>%{x}</extra>`,
        marker: { color: base, line: { color: chrome.surface, width: 1 } },
      }, { ds: d, role: "bar" }) as unknown as Plotly.Data;
    });
    const empty = !data.groups.length;
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      showlegend: legendOn,
      // no bgcolor: the legend takes the paper colour (transparent in exports)
      legend: { font: { color: chrome.ink },
        ...(kind === GRAPH_CT_GROUPED ? {} : { traceorder: "reversed" as const }) },
      barmode: kind === GRAPH_CT_GROUPED ? "group" : "stack",
      bargap: kind === GRAPH_CT_GROUPED ? 0.25 : 0.45,
      margin: { l: 64, r: 16, t: 12, b: 48 },
      uirevision: "keep",
      xaxis: { type: "category", showgrid: false, zeroline: false, visible: !empty,
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.ink } },
      yaxis: { title: { text: titles.y, font: { color: chrome.inkSecondary } }, visible: !empty,
        gridcolor: chrome.grid, zeroline: false, rangemode: "tozero",
        linecolor: chrome.axis, tickcolor: chrome.axis, tickfont: { color: chrome.muted },
        // brackets sit above 100%: the axis grows to hold them, its ticks stop at 100%
        ...(percentY ? (brackets ? { tickvals: PERCENT_TICKS, ticksuffix: "%" }
          : { range: [0, 100], ticksuffix: "%" }) : {}) },
      ...(empty ? { annotations: [{ text: "Enter counts in the data table to draw this graph", showarrow: false,
        font: { color: chrome.muted, size: 13 }, x: 0.5, y: 0.5, xref: "paper" as const, yref: "paper" as const }] } : {}),
    };
    return { traces, layout, names: outcomeNames(table), groups: data.groups };
  }, [table, dark, scheme, titles.y, opts.labels, legendOn, kind, fmt, brackets]);
  // Rows sit at their category index; the comparisons name rows, not outcomes.
  const ctx = useMemo(() => ({
    dark, scheme, datasets: fig.names, comparisons: cmp?.comparisons,
    groupX: (name: string, family?: string) => {
      const i = fig.groups.indexOf(name);
      return family || i < 0 ? null : i;
    },
  }), [dark, scheme, fig.names, fig.groups, cmp]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="contingency" scrollZoom={false} />
  );
}

/** Graph options in the Settings panel: bar labels and legend; on a graph
 *  that cannot draw the results' pairs of rows, why. */
export function CtOptions({ graph, table, result }: GraphOptionsProps) {
  const [opts, setOpts] = useGraphOptions(graph, "ct", sanitize);
  const pairs = Array.isArray((result as { pairwise_rows?: { comparisons?: unknown } } | null)
    ?.pairwise_rows?.comparisons);
  const refusal = pairs ? ctBracketRefusal(graph.graphType, table) : null;
  return (
    <>
      <OptSelect label="Labels" value={opts.labels}
        options={(Object.keys(LABELS) as Labels[]).map((k) => [k, LABELS[k]] as const)}
        onChange={(labels) => setOpts({ labels })} />
      <OptCheck label="Legend" checked={opts.legend} onChange={(legend) => setOpts({ legend })} />
      {refusal && <OptNote>No brackets for the pairs of rows: {refusal}.</OptNote>}
    </>
  );
}
