// Graphs of the synergy analysis: 2D synergy landscapes (one heat map per
// model on one diverging scale), monotherapy dose-response curves, and
// the Chou-Talalay Fa-CI plot. Drawn through the graph-format layer.
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptInput } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { parseCell } from "../../project/table";
import { seriesStyle } from "../../lib/palette";
import { formatSig } from "../../types";
import type { GraphOptionsProps, PlotProps } from "../types";
import { MODEL_LABEL, SYNERGY_MODELS, type SynergyOptions } from "./synergyModel";
import { axis, chromeOf, divergingScale, layoutBase, messageLayout, useDark, useGraphSettings } from "./plotkit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>;

interface LandscapeSettings { labels: boolean; max: string }
const LANDSCAPE_DEFAULTS: LandscapeSettings = { labels: true, max: "" };

function inkFor(t: number, dark: boolean): string {
  // strong colours at both ends take white text, the pale middle dark text
  if (dark) return "#f5f5f7";
  return Math.abs(t - 0.5) > 0.32 ? "#ffffff" : "#1d1d1f";
}

export function LandscapePlot({ graph, options, result, titles, scheme, format, onFormatChange }:
  PlotProps<SynergyOptions, R>) {
  const dark = useDark();
  const [s] = useGraphSettings(graph, "synergy", LANDSCAPE_DEFAULTS);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!result || result.error || !result.models) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No landscape: the analysis did not run" : "Scoring the matrix…") };
    }
    const shown = SYNERGY_MODELS.filter((m) => options?.models?.[m] ?? true);
    const models = shown.length ? shown : SYNERGY_MODELS;
    const c1 = result.conc1 as number[];
    const c2 = result.conc2 as number[];
    const all = models.flatMap((m) => (result.models[m].synergy as (number | null)[][]).flat())
      .filter((v): v is number => typeof v === "number");
    const auto = Math.max(1, ...all.map((v) => Math.abs(v)));
    const M = (parseCell(s.max) ?? 0) > 0 ? parseCell(s.max)! : Math.ceil(auto / 5) * 5;
    const cols = models.length > 1 ? 2 : 1;
    const rows = Math.ceil(models.length / cols);
    const gx = 0.1;
    const gy = 0.16;
    const w = (1 - gx * (cols - 1) - 0.06) / cols;   // room for the colour bar
    const h = (1 - gy * (rows - 1)) / rows;
    const traces: Plotly.Data[] = [];
    const layout: Partial<Plotly.Layout> & Record<string, unknown> = layoutBase(chrome, {
      margin: { l: 72, r: 24, t: 30, b: 56 }, dragmode: false, hovermode: "closest",
    });
    const annotations: Partial<Plotly.Annotations>[] = [];
    const scale = divergingScale(dark);
    models.forEach((m, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const ax = k === 0 ? "" : String(k + 1);
      const x0 = col * (w + gx);
      const y1 = 1 - row * (h + gy);
      const z = result.models[m].synergy as (number | null)[][];
      traces.push({
        type: "heatmap", z, x: c2.map((_, j) => j), y: c1.map((_, i) => i),
        xaxis: `x${ax}`, yaxis: `y${ax}`,
        zmin: -M, zmax: M, zauto: false, colorscale: scale,
        xgap: 1, ygap: 1,
        text: z.map((r, i) => r.map((v, j) => `${options?.drug1 ?? "Drug 1"} ${formatSig(c1[i])}, `
          + `${options?.drug2 ?? "Drug 2"} ${formatSig(c2[j])}: ${v === null ? "no value" : formatSig(v, 3)}`)),
        hovertemplate: `${MODEL_LABEL[m]}<br>%{text}<extra></extra>`,
        showscale: k === 0,
        colorbar: {
          title: { text: "Synergy (Δ % inhibition)", side: "right", font: { color: chrome.inkSecondary } },
          outlinewidth: 0, thickness: 12, len: 0.9, x: 1.0, xanchor: "left",
          tickfont: { color: chrome.muted },
        },
      } as unknown as Plotly.Data);
      if (s.labels) {
        z.forEach((r, i) => r.forEach((v, j) => {
          if (v === null || i === 0 || j === 0) return;
          const t = (v + M) / (2 * M);
          annotations.push({ xref: `x${ax}` as never, yref: `y${ax}` as never,
            x: j, y: i, text: formatSig(v, 2), showarrow: false,
            font: { size: 10, color: inkFor(t, dark) } });
        }));
      }
      const score = result.models[m].score;
      annotations.push({ xref: "paper", yref: "paper", x: x0 + w / 2, y: y1, yanchor: "bottom",
        xanchor: "center", showarrow: false,
        text: `<b>${MODEL_LABEL[m]}</b>  score ${typeof score === "number" ? formatSig(score, 3) : "n/a"}`,
        font: { size: 12, color: chrome.ink } });
      layout[`xaxis${ax}`] = {
        ...axis(chrome, row === rows - 1 ? titles.x : "", {
          domain: [x0, x0 + w], anchor: `y${ax}` as never, tickvals: c2.map((_, j) => j),
          ticktext: c2.map((c) => formatSig(c, 3)), showgrid: false, ticks: "", showline: false,
          tickangle: -45,
        }),
      };
      layout[`yaxis${ax}`] = {
        ...axis(chrome, col === 0 ? titles.y : "", {
          domain: [y1 - h, y1], anchor: `x${ax}` as never, tickvals: c1.map((_, i) => i),
          ticktext: c1.map((c) => formatSig(c, 3)), showgrid: false, ticks: "", showline: false,
        }),
      };
    });
    layout.annotations = annotations;
    return { traces, layout };
  }, [result, options, s, dark, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: [] as string[] }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="synergy-landscapes" scrollZoom={false} />
  );
}

export function LandscapeOptions({ graph }: GraphOptionsProps<SynergyOptions, R>) {
  const [s, set] = useGraphSettings(graph, "synergy", LANDSCAPE_DEFAULTS);
  if (!set) return null;
  return (
    <>
      <OptCheck label="Show the score in each cell" checked={s.labels}
        onChange={(labels) => set({ labels })} />
      <OptInput label="Colour scale reaches ±" inputMode="decimal" placeholder="auto"
        value={s.max} onChange={(max) => set({ max })} />
    </>
  );
}

export function MonoPlot({ options, result, titles, scheme, format, onFormatChange }:
  PlotProps<SynergyOptions, R>) {
  const dark = useDark();
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    if (!result || result.error || !result.monotherapy) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome,
        result?.error ? "No graph: the analysis did not run" : "Fitting…"), names: [] as string[] };
    }
    const c1 = result.conc1 as number[];
    const c2 = result.conc2 as number[];
    const R0 = result.response as (number | null)[][];
    const names = [options?.drug1 || "Drug 1", options?.drug2 || "Drug 2"];
    const traces: Plotly.Data[] = [];
    [["drug1", c1, R0.map((r) => r[0])], ["drug2", c2, R0[0]]].forEach(([key, conc, resp], i) => {
      const { color, symbol, dash } = seriesStyle(i, dark, scheme);
      const xs: number[] = [];
      const ys: number[] = [];
      (conc as number[]).forEach((c, j) => {
        const v = (resp as (number | null)[])[j];
        if (c > 0 && v !== null) { xs.push(c); ys.push(v); }
      });
      const m = result.monotherapy[key as string] as R;
      if (m.fitted) {
        traces.push(tagTrace({
          type: "scatter", mode: "lines", x: m.curve.x, y: m.curve.y, name: names[i],
          legendgroup: names[i], line: { color, width: 2, dash }, hoverinfo: "skip",
        }, { ds: i, role: "fit" }) as Plotly.Data);
      }
      traces.push(tagTrace({
        type: "scatter", mode: "markers", x: xs, y: ys, name: names[i], legendgroup: names[i],
        showlegend: !m.fitted,
        marker: { color, symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
        hovertemplate: `${names[i]} %{x:.4g}: %{y:.4g}%<extra></extra>`,
      }, { ds: i, role: "points" }) as Plotly.Data);
    });
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x, { type: "log" }),
      yaxis: axis(chrome, titles.y),
      showlegend: true,
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: chrome.ink } },
      annotations: [{ xref: "paper", yref: "paper", x: 1, xanchor: "right", y: 0, yanchor: "bottom",
        showarrow: false, text: "zero dose not shown (log axis)", font: { size: 11, color: chrome.muted } }],
    });
    return { traces, layout, names };
  }, [result, options, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: fig.names }), [dark, scheme, fig.names]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="monotherapy-curves" />
  );
}

export function FaCiPlot({ options, result, titles, scheme, format, onFormatChange }:
  PlotProps<SynergyOptions, R>) {
  const dark = useDark();
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    const combos = ((result?.chou_talalay?.combinations ?? []) as R[]).filter((c) => c.ci != null);
    if (!result || result.error || !combos.length) {
      return { traces: [] as Plotly.Data[], layout: messageLayout(chrome, result?.error
        ? "No graph: the analysis did not run"
        : "No combination index: Fa must lie between 0 and 1 and both median-effect fits must exist") };
    }
    const { color, symbol } = seriesStyle(0, dark, scheme);
    const traces: Plotly.Data[] = [tagTrace({
      type: "scatter", mode: "markers", x: combos.map((c) => c.fa), y: combos.map((c) => c.ci),
      name: "Combinations",
      text: combos.map((c) => `${options?.drug1 ?? "Drug 1"} ${formatSig(c.conc1)} + ${options?.drug2 ?? "Drug 2"} ${formatSig(c.conc2)}: ${c.interpretation}`),
      marker: { color, symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
      hovertemplate: "%{text}<br>Fa %{x:.3f}, CI %{y:.3g}<extra></extra>",
    }, { ds: 0, role: "points" }) as Plotly.Data];
    const layout = layoutBase(chrome, {
      xaxis: axis(chrome, titles.x, { range: [0, 1] }),
      yaxis: axis(chrome, titles.y, { rangemode: "tozero" }),
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 1, y1: 1,
        line: { color: chrome.muted, width: 1.2, dash: "dash" } }],
      annotations: [
        { xref: "paper", x: 1, xanchor: "right", yref: "y", y: 1, yanchor: "bottom", showarrow: false,
          text: "CI = 1 (additive)", font: { size: 11, color: chrome.muted } },
        { xref: "paper", x: 0, xanchor: "left", yref: "paper", y: 0, yanchor: "bottom", showarrow: false,
          text: "below: synergism · above: antagonism", font: { size: 11, color: chrome.muted } },
      ],
      showlegend: false,
    });
    return { traces, layout };
  }, [result, options, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: ["Combinations"] }), [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="fa-ci-plot" />
  );
}
