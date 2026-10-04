// Standard curve graph: the standards (every replicate), the fitted curve,
// the quantification range (LLOQ to ULOQ) shaded with its limits marked,
// and the in-range unknowns placed on the curve. Drawn through the format
// layer like the curve-fit graph (standards = data set 1, unknowns = 2).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptSelect } from "../../../components/GraphOptionControls";
import { tagTrace } from "../../../graph";
import FormattedPlot from "../../../graph/FormattedPlot";
import { useDarkMode } from "../../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, PLOT_FONT, seriesStyle } from "../../../lib/palette";
import { asRecord, useGraphOptions } from "../../common/graphOptions";
import type { GraphOptionsProps, PlotProps } from "../../types";
import type { StdOptions, StdRun } from "./model";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface CurveOptions { plate: number; unknowns: boolean }

function sanitize(raw: unknown): CurveOptions {
  const o = asRecord(raw);
  return { plate: typeof o.plate === "number" ? Math.max(0, Math.floor(o.plate)) : 0, unknowns: o.unknowns !== false };
}

export function StdCurvePlot({ graph, options, result, titles, scheme, format, onFormatChange }:
  PlotProps<StdOptions, StdRun>) {
  const dark = useDarkMode();
  const opts = sanitize(graph.settings.assayStd);
  const fig = useMemo(() => {
    const chrome = dark ? CHROME_DARK : CHROME_LIGHT;
    const traces: Plotly.Data[] = [];
    const shapes: Partial<Plotly.Shape>[] = [];
    const annotations: Partial<Plotly.Annotations>[] = [];
    const plates = result?.plates ?? [];
    const res = plates[Math.min(opts.plate, Math.max(0, plates.length - 1))]?.res;
    const unit = options?.unit ?? "";
    const s0 = seriesStyle(0, dark, scheme);
    const s1 = seriesStyle(1, dark, scheme);
    let logX = true;
    if (res && !res.error) {
      logX = !!res.log_x;
      const toX = (v: number) => (res.curve.x_is_log ? 10 ** v : v);
      const sx: number[] = []; const sy: number[] = []; const st: string[] = [];
      const fx: number[] = []; const fy: number[] = [];
      for (const lv of res.standards ?? []) {
        if (!(lv.concentration > 0)) continue;
        for (const v of lv.signals ?? []) {
          if (typeof v !== "number") continue;
          const bad = lv.level_pass === false || !!lv.excluded;
          (bad ? fx : sx).push(lv.concentration);
          (bad ? fy : sy).push(v);
          st.push(`${lv.concentration} ${unit}: ${v}`);
        }
      }
      const q = res.quantification_range ?? {};
      if (q.lloq && q.uloq) {
        shapes.push({
          // shapes take data values on a log axis (annotations take log10)
          type: "rect", xref: "x", yref: "paper", x0: q.lloq, x1: q.uloq, y0: 0, y1: 1, line: { width: 0 },
          fillcolor: dark ? "rgba(41,151,255,0.10)" : "rgba(0,113,227,0.07)", layer: "below",
        });
        for (const [name, v] of [["LLOQ", q.lloq], ["ULOQ", q.uloq]] as const) {
          const x = logX ? Math.log10(v) : v;
          shapes.push({ type: "line", xref: "x", yref: "paper", x0: v, x1: v, y0: 0, y1: 1,
            line: { color: chrome.muted, width: 1, dash: "dot" } });
          annotations.push({ text: `${name} ${Number(v.toPrecision(4))}`, x, xref: "x", y: 1, yref: "paper",
            yanchor: "bottom", showarrow: false, font: { size: 11, color: chrome.muted, family: PLOT_FONT } });
        }
      }
      traces.push(tagTrace({
        type: "scatter", mode: "lines", name: "Fitted curve",
        x: res.curve.x.map(toX), y: res.curve.y, line: { color: s0.color, width: 2 },
        hoverinfo: "skip", showlegend: false,
      }, { ds: 0, role: "fit" }) as Plotly.Data);
      traces.push(tagTrace({
        type: "scatter", mode: "markers", name: "Standards", x: sx, y: sy, text: st,
        hovertemplate: "%{text}<extra>standard</extra>",
        marker: { color: s0.color, symbol: s0.symbol, size: 8, line: { color: chrome.surface, width: 1 } },
      }, { ds: 0, role: "points" }) as Plotly.Data);
      if (fx.length) {
        traces.push(tagTrace({
          type: "scatter", mode: "markers", name: "Failing or left-out standards", x: fx, y: fy,
          // open symbols take their colour from marker.color
          marker: { color: dark ? "#ff6961" : "#d70015", symbol: "circle-open", size: 11, line: { width: 2 } },
          hovertemplate: "%{x} " + unit + ": %{y}<extra>failing / left out</extra>",
        }, { ds: 0, role: "outliers" }) as Plotly.Data);
      }
      if (opts.unknowns) {
        const ux: number[] = []; const uy: number[] = []; const ut: string[] = [];
        for (const u of res.unknowns ?? []) {
          if (u.status !== "ok" || typeof u.concentration !== "number") continue;
          ux.push(u.concentration); uy.push(u.mean_signal);
          ut.push(`${u.name} (1:${u.dilution}): ${Number(u.concentration.toPrecision(4))} ${unit}`);
        }
        if (ux.length) {
          traces.push(tagTrace({
            type: "scatter", mode: "markers", name: "Unknowns", x: ux, y: uy, text: ut,
            hovertemplate: "%{text}<extra>unknown</extra>",
            marker: { color: s1.color, symbol: "diamond-open", size: 10, line: { width: 2 } },
          }, { ds: 1, role: "points" }) as Plotly.Data);
        }
      }
    } else {
      annotations.push({ text: res?.error ? String(res.error) : (result?.error ?? "Enter standards to draw the curve"),
        showarrow: false, x: 0.5, y: 0.5, xref: "paper", yref: "paper", font: { color: chrome.muted, size: 13 } });
    }
    const layout: Partial<Plotly.Layout> = {
      paper_bgcolor: chrome.surface, plot_bgcolor: chrome.surface,
      font: { family: PLOT_FONT, color: chrome.inkSecondary, size: 13 },
      margin: { l: 64, r: 16, t: 28, b: 56 },
      showlegend: true, legend: { orientation: "h", y: -0.2 },
      xaxis: {
        type: logX ? "log" : "linear", title: { text: titles.x }, gridcolor: chrome.grid,
        linecolor: chrome.axis, zeroline: false, tickfont: { color: chrome.muted },
      },
      yaxis: { title: { text: titles.y }, gridcolor: chrome.grid, linecolor: chrome.axis,
        zeroline: false, tickfont: { color: chrome.muted } },
      shapes, annotations, dragmode: "pan", uirevision: "keep",
    };
    return { traces, layout };
  }, [dark, result, options, opts.plate, opts.unknowns, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: ["Standards", "Unknowns"] }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="standard-curve" label="Standard curve" />
  );
}

export function StdCurveOptions({ graph, result }: GraphOptionsProps<StdOptions, StdRun>) {
  const [opts, setOpts] = useGraphOptions(graph, "assayStd", sanitize);
  const plates = result?.plates ?? [];
  return (
    <>
      {plates.length > 1 && (
        <OptSelect label="Plate" value={String(Math.min(opts.plate, plates.length - 1))}
          options={plates.map((p, i) => [String(i), `Plate ${p.plate}`] as const)}
          onChange={(v) => setOpts({ plate: Number(v) })} />
      )}
      <OptCheck label="Show the unknowns on the curve" checked={opts.unknowns}
        onChange={(unknowns) => setOpts({ unknowns })} />
    </>
  );
}
