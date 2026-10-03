// Graphs for multiple-variables tables: graphs of the data (XY / bubble
// with color, size, labels, connecting lines, data ellipses, convex hulls
// and summary symbols; categorical strip / bar / box / violin) and the
// graphs of each analysis' results. Each draws through the graph-format
// layer; their own options (which variable on X, color by, ...) are kept
// in graph.settings.mv and edited in the graph's Settings panel (the
// *Options components below).
import { useMemo, type ReactNode } from "react";
import type Plotly from "plotly.js-dist-min";
import ColumnPlot from "../../components/ColumnPlot";
import { OptCheck, OptNote, OptSelect } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import type { DataTableModel } from "../../project/types";
import { COLUMN_GRAPH_LABELS, formatSig, type ColumnGraphType } from "../../types";
import type { GraphOptionsProps, PlotProps } from "../types";
import {
  convexHull, dataEllipse, meanSd, mvVariables, num, pcaScores, rowLabel,
  variableInfo, type MvValue, type VarInfo,
} from "./model";
import {
  biplotDefaults, biplotGroups, catDefaults, ROW_TITLE, xyDefaults, xyGroups,
  type CatSettings, type PcSettings, type XYSettings,
} from "./graphSettings";
import {
  axis, baseLayout, chromeFor, divergingScale, inkOn, scaleColor,
  sequentialScale, stars, useDark, useGraphSettings,
} from "./chart";
import { PlotMessage, PlotlyChart } from "./plotkit";
import type {
  CorrelationResult, LogisticResult, PcaResult, RegressionResult,
} from "./run";

/* ------------------------------------------------------------ helpers */

function useVars(table: DataTableModel) {
  return useMemo(() => {
    const vars = mvVariables(table);
    const info = variableInfo(table);
    const col = (name: string): MvValue[] =>
      vars.find((v) => v.name === name)?.values ?? [];
    return { vars, info, col };
  }, [table]);
}

function Pick({ label, value, onChange, options, none }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; none?: string;
}) {
  return (
    <OptSelect label={label} value={value} none={none} onChange={onChange}
      options={options.map((o) => [o.value, o.label] as const)} />
  );
}

const Check = OptCheck;

const names = (info: VarInfo[], pred: (v: VarInfo) => boolean) =>
  info.filter(pred).map((v) => ({ value: v.name, label: v.name }));

const isNum = (v: MvValue | undefined): v is number => typeof v === "number";

function withAlpha(hex: string, a: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex + a : hex;
}

/** Result failed or not computed yet: a message instead of a graph. */
function pending(result: { error?: string } | null): ReactNode | null {
  if (!result) return <PlotMessage>Calculating…</PlotMessage>;
  if (result.error) return <PlotMessage>No graph: {result.error}</PlotMessage>;
  return null;
}

/* ------------------------------------------------------------ XY / bubble */

export function MvXYPlot({ graph, table, titles, scheme, format, onFormatChange }: PlotProps) {
  const dark = useDark();
  const { info, col } = useVars(table);
  const [s] = useGraphSettings<XYSettings>(graph, xyDefaults(info));
  const colorVar = info.find((v) => v.name === s.colorBy);
  const sizeVar = info.find((v) => v.name === s.sizeBy && v.kind === "continuous");

  const fig = useMemo(() => {
    const chrome = chromeFor(dark);
    const xs = col(s.x);
    const ys = col(s.y);
    const rows = xs.map((_, i) => i).filter((i) => isNum(xs[i]) && isNum(ys[i]));
    if (!rows.length) return null;
    const traces: Plotly.Data[] = [];
    const labels = s.labelBy === ROW_TITLE ? rows.map((r) => rowLabel(table, r))
      : s.labelBy ? rows.map((r) => String(col(s.labelBy)[r] ?? "")) : null;
    const labelOf = new Map(rows.map((r, k) => [r, labels?.[k] ?? ""]));

    // size by: area proportional to the value
    const sizeVals = sizeVar ? col(sizeVar.name) : [];
    const sv = rows.map((r) => sizeVals[r]).filter(isNum);
    const smin = sv.length ? Math.min(...sv) : 0;
    const smax = sv.length ? Math.max(...sv) : 1;
    const sizeOf = (v: MvValue | undefined) => (sizeVar && isNum(v) && smax > smin
      ? 7 + 23 * Math.sqrt((v - smin) / (smax - smin)) : sizeVar ? 7 : 9);

    const groups: { name: string; rows: number[]; color: string; symbol: string; ds: number }[] = [];
    let continuousColor: MvValue[] | null = null;
    if (colorVar?.kind === "categorical") {
      const cv = col(colorVar.name);
      colorVar.levels.forEach((lev, i) => {
        const st = seriesStyle(i, dark, scheme);
        groups.push({ name: lev, rows: rows.filter((r) => cv[r] === lev), ...st, ds: i });
      });
      const rest = rows.filter((r) => cv[r] === null);
      if (rest.length) {
        groups.push({ name: "(blank)", rows: rest, color: chrome.muted, symbol: "circle-open",
          ds: colorVar.levels.length });
      }
    } else {
      const st = seriesStyle(0, dark, scheme);
      groups.push({ name: s.y, rows, ...st, ds: 0 });
      if (colorVar?.kind === "continuous") continuousColor = col(colorVar.name);
    }
    const legend = groups.length > 1;
    const hover = (r: number) => `${rowLabel(table, r)}<br>${s.x} = ${formatSig(xs[r] as number)}`
      + `<br>${s.y} = ${formatSig(ys[r] as number)}`
      + (colorVar ? `<br>${colorVar.name} = ${col(colorVar.name)[r] ?? "blank"}` : "")
      + (sizeVar ? `<br>${sizeVar.name} = ${sizeVals[r] ?? "blank"}` : "");

    for (const g of groups) {
      if (!g.rows.length) continue;
      const gx = g.rows.map((r) => xs[r] as number);
      const gy = g.rows.map((r) => ys[r] as number);
      if (s.hull && g.rows.length >= 3) {
        const h = convexHull(g.rows.map((_, k) => [gx[k], gy[k]]));
        traces.push(tagTrace({
          x: h.map((p) => p[0]), y: h.map((p) => p[1]), mode: "lines",
          line: { color: g.color, width: 1.5 }, fill: "toself",
          fillcolor: withAlpha(g.color, "14"), hoverinfo: "skip",
          showlegend: false, legendgroup: g.name,
        }, { ds: g.ds, role: "decor" }) as Plotly.Data);
      }
      if (s.ellipse) {
        const e = dataEllipse(gx, gy, Math.min(0.999, Math.max(0.5, num(s.ellipseLevel, 95) / 100)));
        if (e) {
          traces.push(tagTrace({
            x: e.x, y: e.y, mode: "lines",
            line: { color: g.color, width: 1.5, dash: "dot" }, fill: "toself",
            fillcolor: withAlpha(g.color, "10"), hoverinfo: "skip",
            showlegend: false, legendgroup: g.name,
          }, { ds: g.ds, role: "decor" }) as Plotly.Data);
        }
      }
      const cvals = continuousColor ? g.rows.map((r) => continuousColor![r]) : null;
      traces.push(tagTrace({
        x: gx, y: gy,
        mode: `markers${s.connect ? "+lines" : ""}${labels ? "+text" : ""}`,
        text: labels ? g.rows.map((r) => labelOf.get(r) ?? "") : undefined,
        textposition: "top center",
        textfont: { color: chrome.inkSecondary, size: 11 },
        name: g.name,
        legendgroup: g.name,
        showlegend: legend,
        line: { color: g.color, width: 1.5 },
        marker: {
          color: cvals ? cvals.map((v) => (isNum(v) ? v : null)) : g.color,
          ...(cvals ? {
            colorscale: sequentialScale(dark), showscale: true,
            colorbar: {
              title: { text: colorVar!.name, font: { color: chrome.inkSecondary } },
              tickfont: { color: chrome.muted }, outlinewidth: 0, thickness: 12,
            },
          } : {}),
          symbol: g.symbol,
          size: sizeVar ? g.rows.map((r) => sizeOf(sizeVals[r])) : 9,
          opacity: sizeVar ? 0.8 : 1,
          line: { color: chrome.surface, width: 1.5 },
        },
        hovertext: g.rows.map(hover),
        hoverinfo: "text",
      }, { ds: g.ds, role: "points", rows: g.rows }) as Plotly.Data);
      if (s.summary) {
        const mx = meanSd(gx);
        const my = meanSd(gy);
        traces.push(tagTrace({
          x: [mx.mean], y: [my.mean], mode: "markers",
          marker: { color: g.color, symbol: g.symbol, size: 15,
            line: { color: chrome.ink, width: 2 } },
          error_x: { type: "data", array: [mx.sd], color: chrome.ink, thickness: 1.5, width: 6 },
          error_y: { type: "data", array: [my.sd], color: chrome.ink, thickness: 1.5, width: 6 },
          showlegend: false, legendgroup: g.name,
          hovertemplate: `${g.name}: mean ${formatSig(mx.mean)}, ${formatSig(my.mean)}`
            + ` (SD ${formatSig(mx.sd)}, ${formatSig(my.sd)}; n = ${mx.n})<extra></extra>`,
        }, { ds: g.ds, role: "summary" }) as Plotly.Data);
      }
    }
    // size legend: three reference bubbles
    if (sizeVar && smax > smin) {
      [smin, (smin + smax) / 2, smax].forEach((v, i) => {
        traces.push({
          x: [null], y: [null], mode: "markers", name: formatSig(v, 3),
          legendgroup: "size",
          legendgrouptitle: i === 0 ? { text: sizeVar.name, font: { color: chrome.inkSecondary } } : undefined,
          marker: { color: withAlpha(chrome.muted, "99"), size: sizeOf(v), symbol: "circle",
            line: { color: chrome.muted, width: 1 } },
          showlegend: true, hoverinfo: "skip",
        } as Plotly.Data);
      });
    }
    const layout = baseLayout(chrome, titles.x || s.x, titles.y || s.y, {
      showlegend: legend || (!!sizeVar && smax > smin),
    });
    if (continuousColor) {
      // the color bar takes the right edge; the size legend goes below
      layout.legend = { ...layout.legend, orientation: "h", x: 0, y: -0.18, yanchor: "top" };
      layout.margin = { l: 64, r: 16, t: 12, b: 90 };
    }
    return { traces, layout, names: xyGroups(info, s) };
  }, [dark, col, s, colorVar, sizeVar, table, titles, scheme, info]);

  return fig ? (
    <PlotlyChart data={fig.traces} layout={fig.layout} filename="multiple-variables"
      label={`Scatter graph of ${s.y} against ${s.x}`} format={format}
      onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={fig.names}
      rowTitles={table.rowTitles} />
  ) : (
    <PlotMessage>
      Choose two continuous variables with values on the same rows to plot
      one against the other (Settings, Graph options).
    </PlotMessage>
  );
}

export function MvXYOptions({ graph, table }: GraphOptionsProps) {
  const { info } = useVars(table);
  const [s, set] = useGraphSettings<XYSettings>(graph, xyDefaults(info));
  const known = (n: string) => info.some((v) => v.name === n);
  const colorVar = info.find((v) => v.name === s.colorBy);
  const sizeVar = info.find((v) => v.name === s.sizeBy && v.kind === "continuous");
  return (
    <>
      <Pick label="X axis" value={known(s.x) ? s.x : ""} none="Choose…"
        options={names(info, (v) => v.kind === "continuous")}
        onChange={(x) => set({ x })} />
      <Pick label="Y axis" value={known(s.y) ? s.y : ""} none="Choose…"
        options={names(info, (v) => v.kind === "continuous")}
        onChange={(y) => set({ y })} />
      <Pick label="Color by" value={colorVar ? s.colorBy : ""} none="None"
        options={names(info, (v) => v.name !== s.x && v.name !== s.y)}
        onChange={(colorBy) => set({ colorBy })} />
      <Pick label="Size by" value={sizeVar ? s.sizeBy : ""} none="None"
        options={names(info, (v) => v.kind === "continuous")}
        onChange={(sizeBy) => set({ sizeBy })} />
      <Pick label="Labels" value={s.labelBy} none="None"
        options={[{ value: ROW_TITLE, label: "Row titles" }, ...names(info, () => true)]}
        onChange={(labelBy) => set({ labelBy })} />
      <Check label="Connect points" checked={s.connect} onChange={(connect) => set({ connect })} />
      <Check label="Mean ± SD per group" checked={s.summary} onChange={(summary) => set({ summary })} />
      <Check label="Convex hull" checked={s.hull} onChange={(hull) => set({ hull })} />
      <Check label="Data ellipse" checked={s.ellipse} onChange={(ellipse) => set({ ellipse })} />
      {s.ellipse && (
        <Pick label="Ellipse covers" value={s.ellipseLevel}
          options={["90", "95", "99"].map((v) => ({ value: v, label: `${v}%` }))}
          onChange={(ellipseLevel) => set({ ellipseLevel })} />
      )}
    </>
  );
}

/* ------------------------------------------------------------ categorical */

export function MvCategoricalPlot({ graph, table, titles, scheme, format, onFormatChange }:
  PlotProps) {
  const { info, col } = useVars(table);
  const [s] = useGraphSettings<CatSettings>(graph, catDefaults(info));
  const catVar = info.find((v) => v.name === s.cat && v.kind === "categorical");
  const yVar = info.find((v) => v.name === s.y && v.kind === "continuous");
  const datasets = useMemo(() => {
    if (!catVar || !yVar) return null;
    const c = col(catVar.name);
    const y = col(yVar.name);
    return catVar.levels.map((lev) => ({
      name: lev,
      rows: y.flatMap((v, r) => (c[r] === lev && isNum(v) ? [[String(v)]] : [])),
    }));
  }, [catVar, yVar, col]);

  return datasets ? (
    <ColumnPlot datasets={datasets} graphType={s.style} scheme={scheme}
      xTitle={titles.x || catVar!.name} yTitle={titles.y || yVar!.name}
      format={format} onFormatChange={onFormatChange} />
  ) : (
    <PlotMessage>
      A categorical graph needs one categorical variable (the groups)
      and one continuous variable (the values). Set a column&apos;s type
      to categorical in the table header.
    </PlotMessage>
  );
}

export function MvCatOptions({ graph, table }: GraphOptionsProps) {
  const { info } = useVars(table);
  const [s, set] = useGraphSettings<CatSettings>(graph, catDefaults(info));
  const catVar = info.find((v) => v.name === s.cat && v.kind === "categorical");
  const yVar = info.find((v) => v.name === s.y && v.kind === "continuous");
  return (
    <>
      <Pick label="Groups (X)" value={catVar ? s.cat : ""} none="Choose…"
        options={names(info, (v) => v.kind === "categorical")}
        onChange={(cat) => set({ cat })} />
      <Pick label="Values (Y)" value={yVar ? s.y : ""} none="Choose…"
        options={names(info, (v) => v.kind === "continuous")}
        onChange={(y) => set({ y })} />
      <Pick label="Show" value={s.style}
        options={(Object.keys(COLUMN_GRAPH_LABELS) as ColumnGraphType[])
          .map((k) => ({ value: k, label: COLUMN_GRAPH_LABELS[k] }))}
        onChange={(style) => set({ style: style as ColumnGraphType })} />
    </>
  );
}

/* ------------------------------------------------------------ correlation heat map */

interface HeatSettings { values: boolean; marks: boolean; lower: boolean }

const HEAT_DEFAULTS: HeatSettings = { values: true, marks: true, lower: false };

export function CorrHeatmap({ graph, result, scheme, format, onFormatChange }:
  PlotProps<unknown, CorrelationResult>) {
  const dark = useDark();
  const [s] = useGraphSettings<HeatSettings>(graph, HEAT_DEFAULTS);
  const fig = useMemo(() => {
    if (!result || result.error || !result.names) return null;
    const chrome = chromeFor(dark);
    const k = result.names.length;
    const scale = divergingScale(dark);
    const show = (i: number, j: number) => !s.lower || i >= j;
    const z = result.r.map((row, i) => row.map((v, j) => (show(i, j) ? v : null)));
    const sym = result.method === "spearman" ? "rs" : "r";
    const hover = result.r.map((row, i) => row.map((v, j) => (show(i, j)
      ? `${result.names[i]} vs ${result.names[j]}<br>${sym} = ${formatSig(v)}`
        + (i !== j ? `<br>P = ${formatSig(result.p[i][j])}<br>n = ${result.n[i][j]}` : "")
      : "")));
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (s.values || s.marks) {
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < k; j++) {
          const v = result.r[i][j];
          if (!show(i, j) || v === null) continue;
          const mark = s.marks && i !== j ? stars(result.p[i][j]) : "";
          const text = [s.values ? formatSig(v, 2) : "", mark].filter(Boolean).join("<br>");
          if (!text) continue;
          annotations.push({
            x: result.names[j], y: result.names[i], text, showarrow: false,
            font: { color: inkOn(scaleColor(scale, (v + 1) / 2)), size: 12 },
          });
        }
      }
    }
    const traces: Plotly.Data[] = [{
      type: "heatmap", z, x: result.names, y: result.names,
      zmin: -1, zmax: 1, colorscale: scale, xgap: 2, ygap: 2,
      text: hover as unknown as string[], hoverinfo: "text",
      colorbar: {
        title: { text: sym, font: { color: chrome.inkSecondary } },
        tickfont: { color: chrome.muted }, outlinewidth: 0, thickness: 12,
        tickvals: [-1, -0.5, 0, 0.5, 1],
      },
    } as Plotly.Data];
    const layout = baseLayout(chrome, "", "", {
      annotations,
      margin: { l: 90, r: 16, t: 12, b: 80 },
      xaxis: axis(chrome, "", { showgrid: false, ticks: "", tickfont: { color: chrome.ink }, linecolor: chrome.surface }),
      yaxis: axis(chrome, "", { showgrid: false, ticks: "", autorange: "reversed",
        scaleanchor: "x", tickfont: { color: chrome.ink }, linecolor: chrome.surface }),
      dragmode: false,
    });
    return { traces, layout };
  }, [result, dark, s]);

  return pending(result) ?? (fig && (
    <PlotlyChart data={fig.traces} layout={fig.layout} filename="correlation-matrix"
      label="Heat map of the correlation matrix" format={format}
      onFormatChange={onFormatChange} dark={dark} scheme={scheme} />
  ));
}

export function CorrHeatOptions({ graph }: GraphOptionsProps) {
  const [s, set] = useGraphSettings<HeatSettings>(graph, HEAT_DEFAULTS);
  return (
    <>
      <Check label="Show r values" checked={s.values} onChange={(values) => set({ values })} />
      <Check label="Significance marks" checked={s.marks} onChange={(marks) => set({ marks })} />
      <Check label="Lower triangle only" checked={s.lower} onChange={(lower) => set({ lower })} />
      {s.marks && (
        <OptNote>* P ≤ 0.05, ** ≤ 0.01, *** ≤ 0.001, **** ≤ 0.0001</OptNote>
      )}
    </>
  );
}

/* ------------------------------------------------------------ regression */

const ONE_SERIES = ["Observations"];

export function RegActualPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, RegressionResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.predicted) return null;
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const rows = result.predicted.map((_, i) => i)
      .filter((i) => result.predicted[i] !== null && result.residuals[i] !== null);
    const px = rows.map((i) => result.predicted[i] as number);
    const ay = rows.map((i) => (result.predicted[i] as number) + (result.residuals[i] as number));
    const lo = Math.min(...px, ...ay);
    const hi = Math.max(...px, ...ay);
    const traces: Plotly.Data[] = [
      { x: [lo, hi], y: [lo, hi], mode: "lines", name: "Line of identity",
        line: { color: chrome.muted, width: 1.5, dash: "dash" }, hoverinfo: "skip" } as Plotly.Data,
      tagTrace({ x: px, y: ay, mode: "markers", name: result.outcome,
        marker: { color: st.color, symbol: st.symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
        hovertext: rows.map((r, k) => `${rowLabel(table, r)}<br>predicted ${formatSig(px[k])}<br>actual ${formatSig(ay[k])}`),
        hoverinfo: "text" }, { ds: 0, role: "points", rows }) as Plotly.Data,
    ];
    return { traces, layout: baseLayout(chrome, titles.x || `Predicted ${result.outcome}`,
      titles.y || `Actual ${result.outcome}`, { showlegend: false }) };
  }, [result, dark, scheme, table, titles]);
  return pending(result) ?? (fig && <PlotlyChart data={fig.traces} layout={fig.layout}
    filename="actual-vs-predicted" label="Actual against predicted values" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={ONE_SERIES}
    rowTitles={table.rowTitles} />);
}

export function RegResidualPlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, RegressionResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.predicted) return null;
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const rows = result.predicted.map((_, i) => i)
      .filter((i) => result.predicted[i] !== null && result.residuals[i] !== null);
    const px = rows.map((i) => result.predicted[i] as number);
    const res = rows.map((i) => result.residuals[i] as number);
    const traces: Plotly.Data[] = [tagTrace({
      x: px, y: res, mode: "markers", name: "Residuals",
      marker: { color: st.color, symbol: st.symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
      hovertext: rows.map((r, k) => `${rowLabel(table, r)}<br>predicted ${formatSig(px[k])}<br>residual ${formatSig(res[k])}`),
      hoverinfo: "text",
    }, { ds: 0, role: "points", rows }) as Plotly.Data];
    const layout = baseLayout(chrome, titles.x || `Predicted ${result.outcome}`,
      titles.y || "Residual", { showlegend: false });
    layout.yaxis = { ...layout.yaxis, zeroline: true, zerolinecolor: chrome.muted, zerolinewidth: 1.5 };
    return { traces, layout };
  }, [result, dark, scheme, table, titles]);
  return pending(result) ?? (fig && <PlotlyChart data={fig.traces} layout={fig.layout}
    filename="residuals" label="Residuals against predicted values" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={ONE_SERIES}
    rowTitles={table.rowTitles} />);
}

interface ForestSettings { intercept: boolean }

const FOREST_DEFAULTS: ForestSettings = { intercept: false };

function Forest({ graph, coefs, ratio, level, titles, filename, scheme, format,
  onFormatChange }: {
  graph: PlotProps["graph"];
  coefs: { name: string; value: number; lo: number | null; hi: number | null; p: number }[];
  ratio: boolean;
  level: number;
  titles: { x: string; y: string };
  filename: string;
  scheme: PlotProps["scheme"];
  format: PlotProps["format"];
  onFormatChange: PlotProps["onFormatChange"];
}) {
  const dark = useDark();
  const [s] = useGraphSettings<ForestSettings>(graph, FOREST_DEFAULTS);
  const fig = useMemo(() => {
    const chrome = chromeFor(dark);
    const shown = coefs.filter((c) => s.intercept || c.name !== "Intercept");
    if (!shown.length) return null;
    const ref = ratio ? 1 : 0;
    const y = shown.map((c) => c.name);
    const traces: Plotly.Data[] = [{
      x: shown.map((c) => c.value), y, mode: "markers", type: "scatter",
      marker: { color: chrome.ink, symbol: "square", size: 10 },
      error_x: {
        type: "data", symmetric: false, color: chrome.ink, thickness: 1.5, width: 6,
        array: shown.map((c) => (c.hi === null ? 0 : c.hi - c.value)),
        arrayminus: shown.map((c) => (c.lo === null ? 0 : c.value - c.lo)),
      },
      hovertext: shown.map((c) => `${c.name}: ${formatSig(c.value)} (${Math.round(level * 100)}% CI `
        + `${c.lo === null ? "n/a" : formatSig(c.lo)} to ${c.hi === null ? "n/a" : formatSig(c.hi)}), P = ${formatSig(c.p)}`),
      hoverinfo: "text",
    } as Plotly.Data];
    const layout = baseLayout(chrome,
      titles.x || `${ratio ? "Odds ratio" : "Coefficient"} (${Math.round(level * 100)}% CI)`, titles.y, {
        showlegend: false,
        margin: { l: 120, r: 24, t: 12, b: 52 },
        shapes: [{ type: "line", xref: "x", yref: "paper", x0: ref, x1: ref, y0: 0, y1: 1,
          line: { color: chrome.muted, width: 1.5, dash: "dash" } }],
      });
    layout.xaxis = { ...layout.xaxis, type: ratio ? "log" : "linear" };
    layout.yaxis = { ...layout.yaxis, autorange: "reversed", showgrid: false,
      tickfont: { color: chrome.ink } };
    return { traces, layout };
  }, [coefs, s, ratio, level, dark, titles]);
  return fig ? <PlotlyChart data={fig.traces} layout={fig.layout} filename={filename}
    label={ratio ? "Odds ratios with confidence intervals" : "Coefficients with confidence intervals"}
    format={format} onFormatChange={onFormatChange} dark={dark} scheme={scheme} />
    : <PlotMessage>No coefficients to show.</PlotMessage>;
}

/** Settings panel of both forest plots. */
export function ForestOptions({ graph }: GraphOptionsProps) {
  const [s, set] = useGraphSettings<ForestSettings>(graph, FOREST_DEFAULTS);
  return (
    <Check label="Include the intercept" checked={s.intercept}
      onChange={(intercept) => set({ intercept })} />
  );
}

export function RegForestPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, RegressionResult>) {
  const wait = pending(result);
  if (wait || !result) return wait;
  return <Forest graph={graph} titles={titles} ratio={false} level={result.ci_level}
    filename="coefficients" scheme={scheme} format={format} onFormatChange={onFormatChange}
    coefs={result.coefficients.map((c) => ({ name: c.name, value: c.estimate,
      lo: c.ci[0], hi: c.ci[1], p: c.p }))} />;
}

/* ------------------------------------------------------------ logistic */

export function LogitOddsPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, LogisticResult>) {
  const wait = pending(result);
  if (wait || !result) return wait;
  return <Forest graph={graph} titles={titles} ratio level={result.ci_level}
    filename="odds-ratios" scheme={scheme} format={format} onFormatChange={onFormatChange}
    coefs={result.coefficients.map((c) => ({ name: c.name, value: c.odds_ratio ?? Math.exp(c.estimate),
      lo: c.odds_ratio_ci?.[0] ?? null, hi: c.odds_ratio_ci?.[1] ?? null, p: c.p }))} />;
}

const LOGIT_SERIES = ["Fit and observations"];

export function LogitCurvePlot({ table, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, LogisticResult>) {
  const dark = useDark();
  const { col } = useVars(table);
  const simple = !!result && !result.error && result.x_at_50_percent !== undefined
    && result.predictors?.length === 1;
  const fig = useMemo(() => {
    if (!simple || !result) return null;
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const name = result.predictors![0];
    const xs = col(name);
    const rows = result.observed.map((_, i) => i)
      .filter((i) => result.observed[i] !== null && isNum(xs[i]));
    const px = rows.map((i) => xs[i] as number);
    const lo = Math.min(...px);
    const hi = Math.max(...px);
    const pad = (hi - lo) * 0.05 || 1;
    const [b0, b1] = result.coefficients.map((c) => c.estimate);
    const grid = Array.from({ length: 121 }, (_, k) => lo - pad + ((hi - lo + 2 * pad) * k) / 120);
    const x50 = result.x_at_50_percent;
    const traces: Plotly.Data[] = [
      tagTrace({ x: grid, y: grid.map((x) => 1 / (1 + Math.exp(-(b0 + b1 * x)))), mode: "lines",
        name: "Fitted probability", line: { color: st.color, width: 2 },
        hovertemplate: `${name} = %{x:.4g}<br>P(${result.outcome} = 1) = %{y:.3f}<extra></extra>` },
      { ds: 0, role: "fit" }) as Plotly.Data,
      tagTrace({ x: px, y: rows.map((i) => result.observed[i] as number), mode: "markers",
        name: "Observed (0 or 1)",
        marker: { color: withAlpha(st.color, "99"), symbol: st.symbol, size: 9,
          line: { color: chrome.surface, width: 1.5 } },
        hovertext: rows.map((r, k) => `${rowLabel(table, r)}<br>${name} = ${formatSig(px[k])}<br>`
          + `observed ${result.observed[r]}, predicted ${formatSig(result.predicted_probability[r] ?? null)}`),
        hoverinfo: "text" }, { ds: 0, role: "points", rows }) as Plotly.Data,
    ];
    const layout = baseLayout(chrome, titles.x || name,
      titles.y || `Probability ${result.outcome} = 1`, { showlegend: false });
    layout.yaxis = { ...layout.yaxis, range: [-0.05, 1.05] };
    if (typeof x50 === "number" && x50 >= lo - pad && x50 <= hi + pad) {
      layout.shapes = [{ type: "line", xref: "x", yref: "y", x0: x50, x1: x50, y0: -0.05, y1: 0.5,
        line: { color: chrome.muted, width: 1.5, dash: "dash" } }];
      layout.annotations = [{ x: x50, y: 0.5, xref: "x", yref: "y", showarrow: false,
        xanchor: "left", yanchor: "top", xshift: 6,
        text: `X at 50% = ${formatSig(x50)}`, font: { color: chrome.inkSecondary, size: 12 } }];
    }
    return { traces, layout };
  }, [simple, result, dark, scheme, col, table, titles]);
  const wait = pending(result);
  if (wait) return wait;
  if (!fig) {
    return (
      <PlotMessage>
        The fitted curve is drawn for a model with one continuous predictor
        and no interactions. Use the ROC curve or the odds-ratio graph for
        this model.
      </PlotMessage>
    );
  }
  return <PlotlyChart data={fig.traces} layout={fig.layout} filename="logistic-fit"
    label="Fitted logistic curve with the observed outcomes" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={LOGIT_SERIES}
    rowTitles={table.rowTitles} />;
}

const ROC_SERIES = ["ROC curve"];

export function LogitRocPlot({ result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, LogisticResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.roc) return null;
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const pts = result.roc.points;
    const traces: Plotly.Data[] = [
      { x: [0, 100], y: [0, 100], mode: "lines", line: { color: chrome.muted, width: 1.5, dash: "dash" },
        hoverinfo: "skip" } as Plotly.Data,
      tagTrace({ x: pts.map((p) => 100 * (1 - p.specificity)), y: pts.map((p) => 100 * p.sensitivity),
        mode: "lines+markers", line: { color: st.color, width: 2, shape: "linear" },
        marker: { color: st.color, size: 6 },
        hovertext: pts.map((p) => `cutoff ${formatSig(p.cutoff)}<br>sensitivity ${formatSig(100 * p.sensitivity, 3)}%`
          + `<br>specificity ${formatSig(100 * p.specificity, 3)}%`),
        hoverinfo: "text" }, { ds: 0, role: "line" }) as Plotly.Data,
    ];
    const auc = result.roc.auc;
    const layout = baseLayout(chrome, titles.x || "100% − specificity%",
      titles.y || "Sensitivity%", {
        showlegend: false,
        annotations: [{ x: 98, y: 4, xref: "x", yref: "y", showarrow: false, xanchor: "right",
          yanchor: "bottom", font: { color: chrome.ink, size: 13 },
          text: `AUC = ${formatSig(auc.value, 3)} (${formatSig(auc.ci[0], 3)} to ${formatSig(auc.ci[1], 3)})` }],
      });
    layout.xaxis = { ...layout.xaxis, range: [-2, 102] };
    layout.yaxis = { ...layout.yaxis, range: [-2, 102], scaleanchor: "x" };
    return { traces, layout };
  }, [result, dark, scheme, titles]);
  return pending(result) ?? (fig && <PlotlyChart data={fig.traces} layout={fig.layout}
    filename="roc-curve" label="ROC curve of the logistic model" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={ROC_SERIES} />);
}

/* ------------------------------------------------------------ PCA */

const pctOf = (r: PcaResult, i: number) =>
  `${formatSig(100 * (r.proportion_of_variance[i] ?? 0), 3)}%`;

const SCREE_SERIES = ["Eigenvalues"];

export function ScreePlot({ result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, PcaResult>) {
  const dark = useDark();
  const fig = useMemo(() => {
    if (!result || result.error || !result.eigenvalues) return null;
    const chrome = chromeFor(dark);
    const st = seriesStyle(0, dark, scheme);
    const pcs = result.eigenvalues.map((_, i) => i + 1);
    const sel = result.n_selected;
    const traces: Plotly.Data[] = [tagTrace({
      x: pcs, y: result.eigenvalues, mode: "lines+markers", name: "Eigenvalue",
      line: { color: st.color, width: 2 },
      marker: {
        color: pcs.map((p) => (p <= sel ? st.color : chrome.surface)),
        line: { color: st.color, width: 2 }, size: 10, symbol: "circle",
      },
      hovertext: pcs.map((p, i) => `PC${p}: eigenvalue ${formatSig(result.eigenvalues[i])}, `
        + `${pctOf(result, i)} of variance${p <= sel ? " (selected)" : ""}`),
      hoverinfo: "text",
    }, { ds: 0, role: "line" }) as Plotly.Data];
    const pa = result.parallel_analysis;
    if (pa) {
      traces.push({
        x: pcs, y: pa.upper, mode: "lines", name: `Parallel analysis (${formatSig(pa.percentile, 3)}th percentile)`,
        line: { color: chrome.muted, width: 1.5, dash: "dash" },
        hovertemplate: `PC%{x}: simulated ${formatSig(pa.percentile, 3)}th percentile %{y:.4g}<extra></extra>`,
      } as Plotly.Data);
    }
    const layout = baseLayout(chrome, titles.x || "Principal component",
      titles.y || "Eigenvalue", {
        showlegend: !!pa,
        legend: { x: 1, xanchor: "right", y: 1, font: { color: chrome.ink, size: 12 }, bgcolor: "rgba(0,0,0,0)" },
      });
    layout.xaxis = { ...layout.xaxis, tickvals: pcs, ticktext: pcs.map((p) => `PC${p}`), showgrid: false };
    layout.yaxis = { ...layout.yaxis, rangemode: "tozero" };
    if (result.selection === "kaiser" && result.standardized) {
      layout.shapes = [{ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 1, y1: 1,
        line: { color: chrome.muted, width: 1.5, dash: "dot" } }];
    }
    return { traces, layout };
  }, [result, dark, scheme, titles]);
  return pending(result) ?? (fig && <PlotlyChart data={fig.traces} layout={fig.layout}
    filename="scree-plot" label="Scree plot of eigenvalues" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={SCREE_SERIES} />);
}

function PcPickers({ result, s, set, info, color }: {
  result: PcaResult | null; s: PcSettings; set: (p: Partial<PcSettings>) => void;
  info?: VarInfo[]; color?: boolean;
}) {
  if (!result || result.error || !result.components) {
    return <OptNote>Choices appear once the analysis has run.</OptNote>;
  }
  const opts = result.components.map((c, i) => ({ value: String(i), label: `${c} (${pctOf(result, i)})` }));
  return (
    <>
      <Pick label="X axis" value={String(s.pcX)} options={opts} onChange={(v) => set({ pcX: Number(v) })} />
      <Pick label="Y axis" value={String(s.pcY)} options={opts} onChange={(v) => set({ pcY: Number(v) })} />
      {color && info && (
        <Pick label="Color by" value={info.some((v) => v.name === s.colorBy && v.kind === "categorical") ? s.colorBy : ""}
          none="None" options={names(info, (v) => v.kind === "categorical")}
          onChange={(colorBy) => set({ colorBy })} />
      )}
    </>
  );
}

function arrows(xs: number[], ys: number[], color: string): Partial<Plotly.Annotations>[] {
  return xs.map((x, i) => ({
    x, y: ys[i], ax: 0, ay: 0, xref: "x", yref: "y", axref: "x", ayref: "y",
    showarrow: true, arrowhead: 2, arrowsize: 1, arrowwidth: 1.5, arrowcolor: color, text: "",
  }));
}

const PC_DEFAULTS: PcSettings = { pcX: 0, pcY: 1, colorBy: "" };

export function LoadingsPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, PcaResult>) {
  const dark = useDark();
  const [s] = useGraphSettings<PcSettings>(graph, PC_DEFAULTS);
  const fig = useMemo(() => {
    if (!result || result.error || !result.loadings) return null;
    const chrome = chromeFor(dark);
    const k = result.components.length;
    const px = Math.min(s.pcX, k - 1);
    const py = Math.min(s.pcY, k - 1);
    const lx = result.loadings.map((row) => row[px]);
    const ly = result.loadings.map((row) => row[py]);
    const lim = Math.max(1, ...lx.map(Math.abs), ...ly.map(Math.abs)) * 1.15;
    const traces: Plotly.Data[] = [{
      x: lx, y: ly, mode: "markers+text", text: result.names, textposition: "top center",
      textfont: { color: chrome.ink, size: 12 },
      marker: { color: chrome.ink, size: 7 },
      hovertext: result.names.map((n, i) => `${n}: ${formatSig(lx[i])}, ${formatSig(ly[i])}`),
      hoverinfo: "text",
    } as Plotly.Data];
    const layout = baseLayout(chrome,
      titles.x || `${result.components[px]} loading (${pctOf(result, px)})`,
      titles.y || `${result.components[py]} loading (${pctOf(result, py)})`, {
        showlegend: false,
        annotations: arrows(lx, ly, chrome.inkSecondary),
      });
    layout.xaxis = { ...layout.xaxis, range: [-lim, lim], zeroline: true, zerolinecolor: chrome.axis };
    layout.yaxis = { ...layout.yaxis, range: [-lim, lim], zeroline: true, zerolinecolor: chrome.axis, scaleanchor: "x" };
    if (result.standardized) {
      // unit circle: a variable fully explained by the two PCs reaches it
      layout.shapes = [{ type: "circle", xref: "x", yref: "y", x0: -1, x1: 1, y0: -1, y1: 1,
        line: { color: chrome.axis, width: 1, dash: "dot" } }];
    }
    return { traces, layout };
  }, [result, s, dark, titles]);
  const wait = pending(result);
  if (wait || !result) return wait;
  return fig && <PlotlyChart data={fig.traces} layout={fig.layout} filename="pca-loadings"
    label="Loadings of each variable on two principal components" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} />;
}

export function LoadingsOptions({ graph, result }: GraphOptionsProps<unknown, PcaResult>) {
  const [s, set] = useGraphSettings<PcSettings>(graph, PC_DEFAULTS);
  return <PcPickers result={result} s={s} set={set} />;
}

export function BiplotPlot({ graph, table, result, titles, scheme, format, onFormatChange }:
  PlotProps<unknown, PcaResult>) {
  const dark = useDark();
  const { info, col } = useVars(table);
  const [s] = useGraphSettings<PcSettings>(graph, biplotDefaults(info));
  const fig = useMemo(() => {
    if (!result || result.error || !result.eigenvectors) return null;
    const chrome = chromeFor(dark);
    const k = result.components.length;
    const px = Math.min(s.pcX, k - 1);
    const py = Math.min(s.pcY, k - 1);
    const scores = pcaScores(table, result);
    const rows = scores.map((_, i) => i).filter((i) => scores[i] !== null);
    const cv = info.find((v) => v.name === s.colorBy && v.kind === "categorical");
    const levels = cv ? cv.levels : [""];
    const cvals = cv ? col(cv.name) : [];
    const traces: Plotly.Data[] = [];
    levels.forEach((lev, li) => {
      const st = seriesStyle(li, dark, scheme);
      const g = cv ? rows.filter((r) => cvals[r] === lev) : rows;
      if (!g.length) return;
      traces.push(tagTrace({
        x: g.map((r) => scores[r]![px]), y: g.map((r) => scores[r]![py]), mode: "markers",
        name: cv ? lev : "Scores", showlegend: !!cv,
        marker: { color: st.color, symbol: st.symbol, size: 9, line: { color: chrome.surface, width: 1.5 } },
        hovertext: g.map((r) => `${rowLabel(table, r)}${cv ? ` (${lev})` : ""}<br>`
          + `${result.components[px]} ${formatSig(scores[r]![px])}, ${result.components[py]} ${formatSig(scores[r]![py])}`),
        hoverinfo: "text",
      }, { ds: li, role: "points", rows: g }) as Plotly.Data);
    });
    // loading vectors scaled to the score cloud
    const sx = rows.map((r) => Math.abs(scores[r]![px]));
    const sy = rows.map((r) => Math.abs(scores[r]![py]));
    const lx = result.loadings.map((row) => row[px]);
    const ly = result.loadings.map((row) => row[py]);
    const lmax = Math.max(1e-12, ...lx.map(Math.abs), ...ly.map(Math.abs));
    const f = (0.85 * Math.max(...sx, ...sy, 1e-12)) / lmax;
    traces.push({
      x: lx.map((v) => v * f), y: ly.map((v) => v * f), mode: "text", text: result.names,
      textposition: "top center", textfont: { color: chrome.ink, size: 12 }, showlegend: false,
      hovertext: result.names.map((n, i) => `${n} loadings: ${formatSig(lx[i])}, ${formatSig(ly[i])}`),
      hoverinfo: "text",
    } as Plotly.Data);
    const layout = baseLayout(chrome,
      titles.x || `${result.components[px]} score (${pctOf(result, px)})`,
      titles.y || `${result.components[py]} score (${pctOf(result, py)})`, {
        showlegend: !!cv,
        annotations: arrows(lx.map((v) => v * f), ly.map((v) => v * f), chrome.inkSecondary),
      });
    layout.xaxis = { ...layout.xaxis, zeroline: true, zerolinecolor: chrome.axis };
    layout.yaxis = { ...layout.yaxis, zeroline: true, zerolinecolor: chrome.axis };
    return { traces, layout, names: biplotGroups(info, s) };
  }, [result, s, dark, scheme, table, info, col, titles]);
  const wait = pending(result);
  if (wait || !result) return wait;
  return fig && <PlotlyChart data={fig.traces} layout={fig.layout} filename="pca-biplot"
    label="Biplot of principal component scores with loading vectors" format={format}
    onFormatChange={onFormatChange} dark={dark} scheme={scheme} names={fig.names}
    rowTitles={table.rowTitles} />;
}

export function BiplotOptions({ graph, table, result }: GraphOptionsProps<unknown, PcaResult>) {
  const { info } = useVars(table);
  const [s, set] = useGraphSettings<PcSettings>(graph, biplotDefaults(info));
  return <PcPickers result={result} s={s} set={set} info={info} color />;
}
