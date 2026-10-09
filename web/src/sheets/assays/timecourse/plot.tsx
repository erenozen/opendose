// Graph of the time-course mixed model: each group's model-estimated mean
// at each time with its confidence interval (error bars or a band), lines
// joining the means, optionally each subject's own curve underneath.
// Drawn through the graph-format layer.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptSelect } from "../../../components/GraphOptionControls";
import { tagTrace } from "../../../graph";
import FormattedPlot from "../../../graph/FormattedPlot";
import { seriesStyle } from "../../../lib/palette";
import { formatSig } from "../../../types";
import { levelPct } from "../../common/statFormat";
import type { GraphOptionsProps, PlotProps } from "../../types";
import { axis, chromeOf, layoutBase, messageLayout, useDark, useGraphSettings } from "../plotkit";
import { subjectSeries } from "../tumourModel";
import { meanSeries, prepare, type TcMixedOptions } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface MeansSettings { ci: "bars" | "band" | "none"; subjects: boolean }
const DEFAULTS: MeansSettings = { ci: "bars", subjects: false };

export function TcMeansPlot({ graph, table, options, result, titles, scheme, format,
  onFormatChange }: PlotProps<TcMixedOptions, R>) {
  const dark = useDark();
  const [s] = useGraphSettings(graph, "timecourse", DEFAULTS);
  const level = options?.ciLevel ?? 0.95;
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!result || result.error || !Array.isArray(result.group_at_time)) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No graph: the analysis did not run" : "Computing…"), names: [] as string[] };
    }
    const series = meanSeries(result);
    const names = series.map((x) => x.group);
    const traces: Plotly.Data[] = [];
    if (s.subjects && options?.columns) {
      const p = prepare(table, options);
      const subs = subjectSeries(p.records).subjects;
      subs.forEach((x) => {
        const gi = names.indexOf(x.group);
        if (gi < 0) return;
        const { color } = seriesStyle(gi, dark, scheme);
        traces.push(tagTrace({
          type: "scatter", mode: "lines", x: x.t, y: x.y, showlegend: false, name: x.group,
          line: { color: `${color}59`, width: 1 },
          hovertemplate: `${p.names.get(x.subject) ?? x.label}<br>%{x:.4g}: %{y:.4g}<extra>${x.group}</extra>`,
        }, { ds: gi, role: "line" }) as Plotly.Data);
      });
    }
    series.forEach((g, gi) => {
      const { color, symbol } = seriesStyle(gi, dark, scheme);
      if (s.ci === "band" && g.x.length) {
        traces.push(tagTrace({
          type: "scatter", mode: "lines", x: [...g.x, ...[...g.x].reverse()],
          y: [...g.hi, ...[...g.lo].reverse()], fill: "toself", fillcolor: `${color}33`,
          line: { color: `${color}00`, width: 0 }, hoverinfo: "skip", showlegend: false, name: g.group,
        }, { ds: gi, role: "band" }) as Plotly.Data);
      }
      traces.push(tagTrace({
        type: "scatter", mode: "lines+markers", x: g.x, y: g.mean, name: g.group,
        line: { color, width: 2 },
        marker: { color, symbol, size: 8, line: { color: chrome.surface, width: 1.5 } },
        error_y: s.ci === "bars" ? {
          type: "data", symmetric: false, array: g.hi.map((h, i) => h - g.mean[i]),
          arrayminus: g.lo.map((l, i) => g.mean[i] - l), color, thickness: 1.5, width: 4, visible: true,
        } : undefined,
        customdata: g.lo.map((l, i) => [formatSig(l), formatSig(g.hi[i]), g.n[i]]),
        hovertemplate: `${g.group}<br>%{x}: mean %{y:.4g} (${levelPct(level)} CI %{customdata[0]} to `
          + "%{customdata[1]}; n = %{customdata[2]})<extra>model estimate</extra>",
      }, { ds: gi, role: "points" }) as Plotly.Data);
    });
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x, typeof series[0]?.x[0] === "string" ? { type: "category" } : {}),
      yaxis: axis(chrome, titles.y),
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: chrome.ink } },
      annotations: s.ci === "none" ? [] : [{ xref: "paper", yref: "paper", x: 1, xanchor: "right", y: 1,
        yanchor: "bottom", showarrow: false, text: `Mean with ${levelPct(level)} CI (model)`,
        font: { size: 11, color: chrome.muted } }],
      margin: { l: 64, r: 16, t: 36, b: 52 },
    });
    return { traces, layout, names };
  }, [result, table, options, s, dark, scheme, titles.x, titles.y, level]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names }), [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="time-course" label="Group means over time" />
  );
}

export function TcMeansOptions({ graph }: GraphOptionsProps<TcMixedOptions, R>) {
  const [s, set] = useGraphSettings(graph, "timecourse", DEFAULTS);
  if (!set) return null;
  return (
    <>
      <OptSelect label="Confidence intervals" value={s.ci}
        options={[["bars", "Error bars"], ["band", "Shaded band"], ["none", "None"]]}
        onChange={(ci) => set({ ci })} />
      <OptCheck label="Each subject underneath" checked={s.subjects} onChange={(subjects) => set({ subjects })} />
    </>
  );
}
