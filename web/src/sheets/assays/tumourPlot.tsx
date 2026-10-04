// Graphs of the tumour-growth analyses: mean ± SEM (or SD) per group over
// time with an optional spaghetti of individual subjects, the endpoint
// line, and a dot plot of each subject's AUC by group. Drawn through the
// graph-format layer.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptSelect } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import type { GraphOptionsProps, PlotProps } from "../types";
import { subjectSeries, tumourRecords, type TumourBase } from "./tumourModel";
import { axis, chromeOf, layoutBase, messageLayout, useDark, useGraphSettings } from "./plotkit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface CurveSettings {
  show: "mean" | "subjects" | "both";
  error: "sem" | "sd" | "none";
  scale: "auto" | "linear" | "log";
  endpoint: boolean;
}
const CURVE_DEFAULTS: CurveSettings = { show: "mean", error: "sem", scale: "auto", endpoint: true };

function meanSd(v: number[]) {
  const n = v.length;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

export function TumourCurvesPlot({ graph, table, options, titles, scheme, format,
  onFormatChange }: PlotProps<TumourBase & R, R>) {
  const dark = useDark();
  const [s] = useGraphSettings(graph, "tumour", CURVE_DEFAULTS);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!options?.columns) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome, "No data yet"), names: [] as string[] };
    }
    const rec = tumourRecords(table, options.columns);
    if (rec.error || !rec.records.length) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        rec.error ?? "No complete records yet"), names: [] as string[] };
    }
    const { groups, subjects } = subjectSeries(rec.records);
    const log = s.scale === "log" || (s.scale === "auto" && !!options.log);
    const traces: Plotly.Data[] = [];
    groups.forEach((g, gi) => {
      const { color, symbol } = seriesStyle(gi, dark, scheme);
      const subs = subjects.filter((x) => x.group === g);
      if (s.show !== "mean") {
        subs.forEach((x, k) => {
          traces.push(tagTrace({
            type: "scatter", mode: s.show === "subjects" ? "lines+markers" : "lines",
            x: x.t, y: x.y, name: g, legendgroup: g,
            showlegend: s.show === "subjects" && k === 0,
            line: { color: color + (s.show === "both" ? "59" : "b3"), width: 1.2 },
            marker: { color, size: 5, symbol },
            hovertemplate: `${x.label}<br>%{x:.4g}: %{y:.4g}<extra>${g}</extra>`,
          }, { ds: gi, role: "line" }) as Plotly.Data);
        });
      }
      if (s.show !== "subjects") {
        const times = [...new Set(subs.flatMap((x) => x.t))].sort((a, b) => a - b);
        const stats = times.map((tt) => meanSd(subs.flatMap((x) => {
          const i = x.t.indexOf(tt);
          return i >= 0 && (!log || x.y[i] > 0) ? [x.y[i]] : [];
        })));
        const err = stats.map((st) => (s.error === "sd" ? st.sd
          : s.error === "sem" ? st.sd / Math.sqrt(st.n) : 0));
        traces.push(tagTrace({
          type: "scatter", mode: "lines+markers", x: times, y: stats.map((st) => st.mean),
          name: g, legendgroup: g,
          line: { color, width: 2 },
          marker: { color, symbol, size: 8, line: { color: chrome.surface, width: 1.5 } },
          error_y: s.error === "none" ? undefined : {
            type: "data", array: err, color, thickness: 1.5, width: 4, visible: true,
          },
          customdata: stats.map((st) => st.n),
          hovertemplate: `${g}<br>%{x:.4g}: mean %{y:.4g} (n = %{customdata})<extra></extra>`,
        }, { ds: gi, role: "points" }) as Plotly.Data);
      }
    });
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    const thr = typeof options.threshold === "string" ? Number(options.threshold) : NaN;
    if (s.endpoint && Number.isFinite(thr) && thr > 0) {
      const y = log ? Math.log10(thr) : thr;
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: y, y1: y,
        line: { color: chrome.muted, width: 1.2, dash: "dash" } });
      annotations.push({ xref: "paper", x: 0, xanchor: "left", yref: "y", y, yanchor: "bottom",
        showarrow: false, text: `endpoint ${formatSig(thr)}`, font: { size: 11, color: chrome.muted } });
    }
    const errLabel = s.show === "subjects" || s.error === "none" ? ""
      : s.error === "sd" ? "Mean ± SD" : "Mean ± SEM";
    if (errLabel) {
      annotations.push({ xref: "paper", yref: "paper", x: 1, xanchor: "right", y: 1, yanchor: "bottom",
        showarrow: false, text: errLabel, font: { size: 11, color: chrome.muted } });
    }
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x),
      yaxis: axis(chrome, titles.y, log ? { type: "log" } : {}),
      shapes, annotations,
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: chrome.ink } },
      margin: { l: 64, r: 16, t: 36, b: 52 },
    });
    return { traces, layout, names: groups };
  }, [table, options, s, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names }), [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="tumour-growth" />
  );
}

export function TumourCurvesOptions({ graph, options }: GraphOptionsProps<TumourBase & R, R>) {
  const [s, set] = useGraphSettings(graph, "tumour", CURVE_DEFAULTS);
  if (!set) return null;
  return (
    <>
      <OptSelect label="Show" value={s.show}
        options={[["mean", "Group means"], ["subjects", "Each subject (spaghetti)"],
          ["both", "Means over each subject"]]}
        onChange={(show) => set({ show })} />
      {s.show !== "subjects" && (
        <OptSelect label="Error bars" value={s.error}
          options={[["sem", "SEM"], ["sd", "SD"], ["none", "None"]]}
          onChange={(error) => set({ error })} />
      )}
      <OptSelect label="Y axis" value={s.scale}
        options={[["auto", "Log when the analysis uses logs"], ["linear", "Linear"], ["log", "Logarithmic"]]}
        onChange={(scale) => set({ scale })} />
      {typeof options?.threshold === "string" && (
        <OptCheck label="Line at the endpoint" checked={s.endpoint}
          onChange={(endpoint) => set({ endpoint })} />
      )}
    </>
  );
}

/** Horizontal offsets that spread points of similar value symmetrically
 *  about the group's centre (0, +d, −d, +2d, … within each run of close
 *  values); points far from their neighbours stay on the centre line. */
function spread(vals: number[]): number[] {
  const order = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const range = (order[order.length - 1]?.v ?? 0) - (order[0]?.v ?? 0) || 1;
  const off = Array(vals.length).fill(0);
  let k = 0;
  order.forEach((p, j) => {
    k = j > 0 && p.v - order[j - 1].v < range * 0.06 ? k + 1 : 0;
    off[p.i] = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.07;
  });
  return off;
}

export function TumourAucPlot({ result, titles, scheme, format, onFormatChange }: PlotProps<R, R>) {
  const dark = useDark();
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!result || result.error || !Array.isArray(result.table?.datasets)) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No graph: the analysis did not run" : "Computing…"), names: [] as string[] };
    }
    const ds = result.table.datasets as { name: string; ys: number[][] }[];
    const labels = (result.labels ?? {}) as Record<string, string>;
    const subjects = (result.subjects ?? []) as R[];
    const traces: Plotly.Data[] = [];
    ds.forEach((d, i) => {
      const { color, symbol } = seriesStyle(i, dark, scheme);
      const vals = d.ys.map((r) => r[0]);
      const who = subjects.filter((x) => x.group === d.name && x.auc != null)
        .map((x) => labels[x.subject] ?? x.subject);
      const off = spread(vals);
      traces.push(tagTrace({
        type: "scatter", mode: "markers", x: vals.map((_, j) => i + off[j]), y: vals,
        name: d.name, text: who,
        marker: { color, symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
        hovertemplate: "%{text}: %{y:.4g}<extra></extra>", showlegend: false,
      }, { ds: i, role: "points", rows: vals.map((_, j) => j) }) as Plotly.Data);
      if (vals.length) {
        const st = meanSd(vals);
        traces.push(tagTrace({
          type: "scatter", mode: "markers", x: [i], y: [st.mean], showlegend: false,
          marker: { symbol: "line-ew-open", size: 34, color, line: { width: 2.5, color } },
          error_y: { type: "data", array: [st.sd], color, thickness: 1.5, width: 10, visible: true },
          hovertemplate: `${d.name}: mean %{y:.4g} ± SD ${formatSig(st.sd)}<extra></extra>`,
        }, { ds: i, role: "summary" }) as Plotly.Data);
      }
    });
    const names = ds.map((d) => d.name);
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, "", {
        tickvals: names.map((_, i) => i), ticktext: names, range: [-0.6, names.length - 0.4],
        showgrid: false, tickfont: { color: chrome.ink },
      }),
      yaxis: axis(chrome, titles.y),
      showlegend: false,
      annotations: [{ xref: "paper", yref: "paper", x: 1, xanchor: "right", y: 1, yanchor: "bottom",
        showarrow: false, text: "Mean ± SD", font: { size: 11, color: chrome.muted } }],
      margin: { l: 64, r: 16, t: 28, b: 52 },
    });
    return { traces, layout, names };
  }, [result, dark, scheme, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names, categorical: true }),
    [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="auc-per-subject" />
  );
}
