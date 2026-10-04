// Volcano plot of a multiple-variables table holding results (one row per
// gene or protein: a fold change, a P or adjusted P, a name): log2 fold
// change against −log10 P, threshold lines, up / down / not significant
// colours and the top-N rows labelled. Columns are guessed from their
// names and chosen in the graph's Settings panel (volcanoModel.ts).
import { useMemo } from "react";
import type Plotly from "plotly.js-dist-min";
import { OptCheck, OptInput, OptNote, OptSelect } from "../../components/GraphOptionControls";
import { tagTrace } from "../../graph";
import { seriesStyle } from "../../lib/palette";
import type { DataTableModel, GraphSheet } from "../../project/types";
import type { GraphOptionsProps, PlotProps } from "../types";
import { axis, baseLayout, chromeFor, useDark, useGraphSettings } from "./chart";
import { mvVariables, rowLabel, variableInfo } from "./model";
import { PlotMessage, PlotlyChart } from "./plotkit";
import {
  ROW_TITLE_KEY, topPoints, VOLCANO_GROUPS, volcanoDefaults, volcanoPoints,
  type VolcanoSettings,
} from "./volcanoModel";

function useVolcano(graph: GraphSheet, table: DataTableModel) {
  const info = useMemo(() => variableInfo(table), [table]);
  const [s, set, editable] = useGraphSettings<VolcanoSettings>(graph, volcanoDefaults(info));
  return { info, s, set, editable };
}

export function MvVolcanoPlot({ graph, table, titles, scheme, format, onFormatChange }: PlotProps) {
  const dark = useDark();
  const { s } = useVolcano(graph, table);
  const fig = useMemo(() => {
    const chrome = chromeFor(dark);
    const vars = mvVariables(table);
    const col = (name: string) => vars.find((v) => v.name === name)?.values ?? [];
    const labels = s.label === ROW_TITLE_KEY
      ? table.rowTitles.map((_, r) => rowLabel(table, r))
      : col(s.label).map((v, r) => (v === null ? rowLabel(table, r) : String(v)));
    const { points, fcT, pT, dropped } = volcanoPoints(col(s.fc), col(s.p), labels, s);
    const top = topPoints(points, Number(s.topN) || 0);
    const pal = scheme === "mono" ? "default" : scheme;
    const colorOf = { down: seriesStyle(0, dark, pal).color, up: seriesStyle(1, dark, pal).color,
      ns: chrome.muted };
    const traces: Plotly.Data[] = (["down", "up", "ns"] as const).map((cls, ds) => {
      const pts = points.filter((p) => p.cls === cls);
      return tagTrace({
        type: "scatter", mode: "markers",
        x: pts.map((p) => p.x), y: pts.map((p) => p.y),
        name: `${VOLCANO_GROUPS[ds]} (${pts.length})`,
        marker: { color: colorOf[cls], size: cls === "ns" ? 6 : 8,
          symbol: cls === "down" ? "triangle-down" : cls === "up" ? "triangle-up" : "circle",
          line: { color: chrome.surface, width: cls === "ns" ? 0 : 1 } },
        text: pts.map((p) => p.label),
        customdata: pts.map((p) => p.p),
        hovertemplate: "%{text}<br>log2 fold change %{x:.3g}<br>P = %{customdata:.3g}<extra></extra>",
      }, { ds, role: "points" }) as Plotly.Data;
    });
    const yTop = Math.max(1, ...points.map((p) => p.y));
    const thr = { color: chrome.inkSecondary, width: 1, dash: "dash" as const };
    const shapes: Partial<Plotly.Shape>[] = [
      { type: "line", xref: "x", yref: "paper", x0: -fcT, x1: -fcT, y0: 0, y1: 1, line: thr,
        name: "volcano-threshold" } as Partial<Plotly.Shape>,
      { type: "line", xref: "x", yref: "paper", x0: fcT, x1: fcT, y0: 0, y1: 1, line: thr,
        name: "volcano-threshold" } as Partial<Plotly.Shape>,
      { type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: -Math.log10(pT), y1: -Math.log10(pT),
        line: thr, name: "volcano-threshold" } as Partial<Plotly.Shape>,
    ];
    const annotations: Partial<Plotly.Annotations>[] = top.map((p) => ({
      x: p.x, y: p.y, text: p.label, showarrow: true, arrowhead: 0, arrowwidth: 0.8,
      arrowcolor: chrome.muted, ax: p.x > 0 ? 18 : -18, ay: -16,
      font: { size: 11, color: chrome.ink }, name: "volcano-label",
    }));
    if (!points.length) {
      annotations.push({ xref: "paper", yref: "paper", x: 0.5, y: 0.6, showarrow: false,
        text: "No rows with a fold change and a P value between 0 and 1:"
          + "<br>choose the columns in Settings → Graph options",
        font: { size: 12, color: chrome.muted } });
    }
    const xMax = Math.max(fcT * 1.5, ...points.map((p) => Math.abs(p.x))) * 1.08;
    return {
      traces, dropped, n: points.length,
      layout: baseLayout(chrome, titles.x || "log2 fold change",
        titles.y || `−log10 ${/adj|fdr|q/i.test(s.p) ? "adjusted P" : "P"}`, {
          xaxis: axis(chrome, titles.x || "log2 fold change", { range: [-xMax, xMax], zeroline: false }),
          yaxis: axis(chrome, titles.y || `−log10 ${/adj|fdr|q/i.test(s.p) ? "adjusted P" : "P"}`,
            { range: [0, yTop * 1.1], zeroline: false }),
          shapes, annotations, showlegend: true,
          legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom",
            font: { color: chrome.ink, size: 12 }, bgcolor: "rgba(0,0,0,0)" },
          margin: { l: 64, r: 16, t: 36, b: 52 },
        }),
    };
  }, [table, s, dark, scheme, titles.x, titles.y]);
  if (!s.fc || !s.p) {
    return (
      <PlotMessage>
        A volcano plot needs two continuous variables: a fold change and a P value per row.
      </PlotMessage>
    );
  }
  return (
    <PlotlyChart data={fig.traces} layout={fig.layout} filename="volcano-plot"
      label={`Volcano plot of ${fig.n} rows`} format={format} onFormatChange={onFormatChange}
      dark={dark} scheme={scheme} names={VOLCANO_GROUPS} />
  );
}

export function MvVolcanoOptions({ graph, table }: GraphOptionsProps) {
  const { info, s, set, editable } = useVolcano(graph, table);
  if (!editable) return null;
  const cont = info.filter((v) => v.kind === "continuous").map((v) => [v.name, v.name] as const);
  const labels = [[ROW_TITLE_KEY, "Row titles"] as const,
    ...info.filter((v) => v.kind === "categorical").map((v) => [v.name, v.name] as const)];
  return (
    <>
      <OptSelect label="Fold change" value={s.fc} options={cont} onChange={(fc) => set({ fc })} />
      <OptCheck label="Fold change is already log2" checked={s.fcLog2}
        onChange={(fcLog2) => set({ fcLog2 })} />
      <OptSelect label="P value (or adjusted P)" value={s.p} options={cont}
        onChange={(p) => set({ p })} />
      <OptCheck label="That column holds −log10 P" checked={s.pIsNegLog}
        onChange={(pIsNegLog) => set({ pIsNegLog })} />
      <OptSelect label="Label rows by" value={s.label} options={labels}
        onChange={(label) => set({ label })} />
      <OptInput label="|log2 fold change| ≥" inputMode="decimal" value={s.fcThreshold}
        onChange={(fcThreshold) => set({ fcThreshold })} />
      <OptInput label="P below" inputMode="decimal" value={s.pThreshold}
        onChange={(pThreshold) => set({ pThreshold })} />
      <OptInput label="Label the top" type="number" min={0} max={100} value={s.topN} suffix="rows"
        onChange={(topN) => set({ topN })} />
      <OptNote>Up and down are coloured from the scheme and also differ by symbol
        (triangle up, triangle down), so the plot reads in grayscale.</OptNote>
    </>
  );
}
