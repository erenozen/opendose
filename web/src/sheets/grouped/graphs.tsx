// Plot panels of the grouped table: the raw-table graphs (bars, scatter,
// box, lines, three-way, heat map) and the volcano plot of multiple
// t tests. They draw through the graph-format layer (FormattedPlot); their
// own options (error bars, clustering, gaps, heat-map colours, ...) are
// stored on the graph sheet and edited in the graph's Settings panel
// (GroupedOptions, HeatOptions, VolcanoOptions). Comparisons of the bound
// two-way, three-way or multiple t test results feed the brackets.
import { useEffect, useMemo, useState } from "react";
import type Plotly from "plotly.js-dist-min";
import {
  OptCheck, OptInput, OptNote, OptSelect, OptSlider,
} from "../../components/GraphOptionControls";
import { tagTrace, type GroupPos } from "../../graph";
import FormattedPlot from "../../graph/FormattedPlot";
import { useDarkMode } from "../../graph/useDarkMode";
import { CHROME_DARK, CHROME_LIGHT, seriesStyle, type Chrome } from "../../lib/palette";
import { formatSig } from "../../types";
import type { GraphOptionsProps, PlotProps } from "../types";
import { buildGrouped, clusterByFor } from "./buildGrouped";
import GraphCaption from "../../graph/GraphCaption";
import { legendSentence } from "../../graph/legend";
import { POINT_SPREADS } from "../../graph/swarm";
import { areaScale, estimateArea, usePlotArea } from "../../graph/usePlotArea";
import { parseCell } from "../../project/table";
import {
  groupedCellReplicates, groupedReplicateMeanTable, superPlotOn,
} from "../common/superplot";
import { superTraces } from "../common/superplotTraces";
import { CAPTION_LABELS } from "../column/graphSettings";
import { SmallNAdvice } from "../column/graphOptions";
import SuperPlotOptions from "../common/SuperPlotOptions";
import { A_REPLICATE_MEANS } from "./options";
import { groupedFormatDatasets, isThreeWayOptions, rowsFromX } from "./graphData";
import { buildHeat, heatMatrix } from "./buildHeat";
import { clusterAvailable, clusterOrder, type ClusterOrder } from "./heatCluster";
import {
  groupedComparisons, groupedDatasetLabels, groupedRowLabels, threeWayCells,
} from "./comparisons";
import {
  G_BOX, G_INTERLEAVED, G_LINES, G_SCATTER, G_SEPARATED, G_STACKED, G_THREE_WAY,
  HEAT_VALUE_LABEL, normalizeGraph, normalizeHeat,
  type GroupedGraphSettings, type HeatSettings, type HeatValue,
  LOG_TESTS, type MultiTOptions,
} from "./options";
import { baseLayout, useGraphSetting, valueAxis } from "./plotting";
import { cellStats, ERROR_LABELS, type ErrorKind } from "./stats";
import "./grouped.css";

const chromeOf = (dark: boolean): Chrome => (dark ? CHROME_DARK : CHROME_LIGHT);

// ------------------------------------------------------------ raw-table graphs

/** Grouped graph kinds that can be drawn as a SuperPlot. */
const SUPER_KINDS = [G_INTERLEAVED, G_SEPARATED, G_SCATTER];

export function GroupedPlot({ graph, table, options, result, titles, scheme, format,
  onFormatChange }: PlotProps) {
  const dark = useDarkMode();
  const raw = graph.settings.grouped;
  const base = useMemo(() => normalizeGraph(raw), [raw]);
  const kind = graph.graphType;
  const superOn = table.subcolumnFormat === "replicates" && SUPER_KINDS.includes(kind)
    && superPlotOn(base.superplot, result);
  // SuperPlot: bars, means and error bars summarise the experiment means;
  // the values are drawn by the overlay, coloured by experiment.
  const settings = useMemo(() => (superOn
    ? { ...base, points: false, error: base.superplot.error } : base), [superOn, base]);
  const cells = useMemo(() => cellStats(superOn
    ? groupedReplicateMeanTable(table, base.superplot.center) : table),
  [table, superOn, base.superplot.center]);
  const threeWay = isThreeWayOptions(options) ? options : null;
  const [area, measure] = usePlotArea();
  const wantScale = settings.spread !== "jitter" || superOn;
  const scale = useMemo(() => {
    if (!wantScale) return null;
    const all = table.datasets.flatMap((d) => d.rows.flatMap((r) => r.map(parseCell)))
      .filter((v): v is number => v !== null);
    const n = clusterByFor(kind, settings) === "rows" ? table.rowTitles.length : table.datasets.length;
    return areaScale(area ?? estimateArea(null, Math.min(0, ...all), Math.max(...all),
      [-0.5, n - 0.5], { l: 64, r: 16, t: 36, b: 52 }), 7.5);
  }, [wantScale, area, table, kind, settings]);
  const built0 = useMemo(() => buildGrouped({
    kind, table, cells, settings, scheme, dark, chrome: chromeOf(dark),
    yTitle: titles.y, threeWay, scale,
  }), [kind, table, cells, settings, scheme, dark, titles.y, threeWay, scale]);
  const built = useMemo(() => {
    if (!superOn || !built0.place) return built0;
    const place = built0.place;
    const { info, cells: reps } = groupedCellReplicates(table, base.superplot.center);
    const slots = reps.flatMap((row, r) => row.map((g, d) => {
      const pos = place.cell(r, d);
      return pos && g.points.length ? { group: g, x: pos.x, xaxis: pos.xref, half: place.half * 0.9,
        ds: place.byRows ? d : r } : null;
    })).filter((x): x is NonNullable<typeof x> => x !== null);
    const overlay = superTraces({ slots, names: info.names, settings: base.superplot,
      spread: base.spread, scale, scheme, dark, chrome: chromeOf(dark), grand: false,
      legend: true,
      colorOffset: kind === G_SCATTER ? 0 : (place.byRows ? table.datasets.length : table.rowTitles.length) });
    const traces = [...built0.traces.filter((t) =>
      (t as { meta?: { odTag?: { role?: string } } }).meta?.odTag?.role !== "points"),
    ...overlay] as Plotly.Data[];
    const layout = { ...built0.layout, showlegend: true,
      margin: { ...(built0.layout.margin ?? {}), t: 36 } } as Partial<Plotly.Layout>;
    return { ...built0, traces, layout };
  }, [built0, superOn, table, base.superplot, base.spread, scale, scheme, dark, kind]);
  const sentence = useMemo(() => (settings.caption === "off" ? ""
    : legendSentence(graph, table, result)), [settings.caption, graph, table, result]);
  const cmp = useMemo(() => groupedComparisons(result, table), [result, table]);
  const names = useMemo(() => groupedFormatDatasets(table, graph, options),
    [table, graph, options]);

  const ctx = useMemo(() => {
    const place = built.place;
    const rows = groupedRowLabels(table);
    const dss = groupedDatasetLabels(table);
    const rIdx = (n: string) => rows.indexOf(n);
    const dIdx = (n: string) => {
      const i = dss.indexOf(n);
      return i >= 0 ? i : table.datasets.findIndex((d) => d.name === n);
    };
    const cellsByLabel = kind === G_THREE_WAY ? threeWayCells(result) : null;
    const groupX = (name: string, family?: string): GroupPos => {
      if (!place) return null;
      if (cellsByLabel) {
        const c = cellsByLabel.get(name);
        return c ? place.cell(c[0], c[1], c[2]) : null;
      }
      if (!family) {
        // Column (data set) main effect: the cluster of that data set.
        const d = dIdx(name);
        return d >= 0 && !place.byRows ? place.cluster(d) : null;
      }
      if (family === "Row main effect") {
        const r = rIdx(name);
        return r >= 0 && place.byRows ? place.cluster(r) : null;
      }
      // Within one row (groups are data sets) or within one data set.
      let r = rIdx(family), d = dIdx(name);
      if (r < 0 || d < 0) { r = rIdx(name); d = dIdx(family); }
      return r >= 0 && d >= 0 ? place.cell(r, d) : null;
    };
    return {
      dark, scheme, datasets: names, rowTitles: table.rowTitles,
      comparisons: cmp?.comparisons, groupX, groupHalf: place?.half ?? 0.2,
      caption: settings.caption === "figure" ? sentence : undefined,
    };
  }, [built.place, table, kind, result, dark, scheme, names, cmp, settings.caption, sentence]);

  return (
    <>
      <FormattedPlot traces={built.traces} layout={built.layout} format={format}
        onFormatChange={onFormatChange} ctx={ctx} filename="grouped-graph"
        onDrawn={wantScale ? measure : undefined} />
      {settings.caption === "below" && sentence && <GraphCaption text={sentence} />}
    </>
  );
}

// ------------------------------------------------------------ on XY tables

/** Grouped graphs of an XY table (no grouped analysis behind them, so no
 *  brackets). */
export function XYGroupedPlot(props: PlotProps) {
  const table = useMemo(() => rowsFromX(props.table), [props.table]);
  return <GroupedPlot {...props} table={table} options={null} result={null} />;
}

/** Settings panel: error bars, clustering, gaps, order, legend. */
export function GroupedOptions({ graph, table, result }: GraphOptionsProps) {
  const [s, set] = useGraphSetting(graph, "grouped", normalizeGraph);
  if (!set) return null;
  const kind = graph.graphType;
  const raw = table.subcolumnFormat === "replicates";
  const superOn = raw && SUPER_KINDS.includes(kind) && superPlotOn(s.superplot, result);
  const smallN = Math.min(...cellStats(table).flat().filter((c) => c && c.n > 0)
    .map((c) => c!.n), Infinity);
  const up = (patch: Partial<GroupedGraphSettings>) => set({ ...s, ...patch });
  const bars = kind !== G_SCATTER && kind !== G_BOX && kind !== G_LINES;
  const lines = kind === G_LINES;
  const threeWay = kind === G_THREE_WAY;
  const clusterBy = clusterByFor(kind, s);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <>
      {kind !== G_BOX && !superOn && (
        <OptSelect label="Error bars" value={s.error}
          options={(Object.keys(ERROR_LABELS) as ErrorKind[]).map((k) => [k, ERROR_LABELS[k]] as const)}
          onChange={(error) => up({ error })} />
      )}
      {kind !== G_BOX && kind !== G_STACKED && s.error !== "none" && (
        <OptSelect label="Direction" value={s.errorDir}
          options={[["both", "Above and below"], ["above", "Above only"]]}
          onChange={(errorDir) => up({ errorDir })} />
      )}
      {!threeWay && (
        <OptSelect label={lines ? "X axis shows" : "Group bars by"} value={clusterBy}
          options={[["rows", lines ? "Rows (one line per dataset)"
            : "Rows: row titles under groups"],
          ["datasets", lines ? "Datasets (one line per row)"
            : "Datasets: dataset titles under groups"]]}
          onChange={(v) => up({ clusterBy: v })} />
      )}
      <OptSelect label="Grand line" value={s.grand}
        options={[["none", "None"], ["mean", "Grand mean"], ["median", "Grand median"]]}
        onChange={(grand) => up({ grand })} />
      {lines && (
        <OptSelect label="Lines connect" value={s.lineMode}
          options={[["means", "Means"], ["subjects", "Means and each subcolumn (before-after)"]]}
          onChange={(lineMode) => up({ lineMode })} />
      )}
      {!lines && (
        <OptSlider label={kind === G_STACKED ? "Gap between stacks" : "Gap between groups"}
          value={s.clusterGap} min={0} max={0.8} step={0.05} format={pct}
          onChange={(v) => up({ clusterGap: v })} />
      )}
      {!lines && kind !== G_STACKED && (
        <OptSlider label="Gap between bars" value={s.barGap} min={0} max={1}
          step={0.02} format={(v) => `${Math.round(v * 100)}% of a bar`}
          onChange={(v) => up({ barGap: v })} />
      )}
      {(bars || kind === G_BOX) && kind !== G_STACKED && !superOn && (
        <OptCheck label="Show individual values" checked={s.points}
          onChange={(points) => up({ points })} />
      )}
      {bars && kind !== G_STACKED && !s.points && !superOn && smallN > 0 && smallN < 10 && (
        <SmallNAdvice n={smallN} onShow={() => up({ points: true })} />
      )}
      {raw && (kind === G_SCATTER || ((bars || kind === G_BOX) && s.points) || superOn)
        && kind !== G_STACKED && (
        <OptSelect label="Point layout" value={s.spread} options={POINT_SPREADS}
          onChange={(spread) => up({ spread })} />
      )}
      <OptSelect label="Legend sentence" value={s.caption} options={CAPTION_LABELS}
        onChange={(caption) => up({ caption })} />
      <OptCheck label={lines || threeWay ? "Reverse order on the X axis" : "Reverse group order"}
        checked={s.clustersReverse} onChange={(v) => up({ clustersReverse: v })} />
      <OptCheck label={kind === G_SEPARATED ? "Reverse bar order within groups"
        : "Reverse dataset (series) order"}
      checked={s.seriesReverse} onChange={(v) => up({ seriesReverse: v })} />
      {kind !== G_SEPARATED && (
        <OptCheck label="Legend" checked={s.legend} onChange={(legend) => up({ legend })} />
      )}
      {kind === G_STACKED && (
        <OptNote>Stacked bars show error bars above each segment only.</OptNote>
      )}
      {raw && SUPER_KINDS.includes(kind) && table.type === "grouped" && (
        <SuperPlotOptions graph={graph} table={table} result={result} s={s.superplot}
          on={superOn} onChange={(superplot) => up({ superplot })}
          analysis={A_REPLICATE_MEANS} settingsKey="grouped" />
      )}
    </>
  );
}

// ------------------------------------------------------------ heat map

export function HeatMapPlot({ graph, table, titles, scheme, format, onFormatChange }: PlotProps) {
  const dark = useDarkMode();
  const raw = graph.settings.heat;
  const h = useMemo(() => normalizeHeat(raw), [raw]);
  const cells = useMemo(() => cellStats(table), [table]);
  // Clustered order from the engine (heatCluster.ts), when asked for and
  // the engine has the handler; null = table order.
  const [order, setOrder] = useState<ClusterOrder | null>(null);
  const wantCluster = h.clusterRows || h.clusterCols;
  useEffect(() => {
    if (!wantCluster) return;
    let live = true;
    const m = heatMatrix(table, cells, h);
    void clusterOrder(m.z, m.yLabels, m.xLabels, { rows: h.clusterRows, cols: h.clusterCols })
      .then((o) => { if (live) setOrder(o); });
    return () => { live = false; };
  }, [wantCluster, table, cells, h]);
  const built = useMemo(() => buildHeat(table, cells, h, scheme, chromeOf(dark), dark, titles.y,
    wantCluster ? order : null), [table, cells, h, scheme, dark, titles.y, wantCluster, order]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: table.datasets.map((d) => d.name) }),
    [dark, scheme, table.datasets]);
  return (
    <FormattedPlot traces={built.traces} layout={built.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="heat-map" scrollZoom={false} />
  );
}

export function HeatOptions({ graph }: GraphOptionsProps) {
  const [h, set] = useGraphSetting(graph, "heat", normalizeHeat);
  const [canCluster, setCanCluster] = useState<boolean | null>(null);
  useEffect(() => { void clusterAvailable().then(setCanCluster); }, []);
  if (!set) return null;
  const up = (patch: Partial<HeatSettings>) => set({ ...h, ...patch });
  return (
    <>
      <OptSelect label="Each cell shows" value={h.value}
        options={(Object.keys(HEAT_VALUE_LABEL) as HeatValue[]).map((k) => [k, HEAT_VALUE_LABEL[k]] as const)}
        onChange={(value) => up({ value })} />
      <OptSelect label="Color map" value={h.palette}
        options={[["sequential", "Single hue (from the color scheme)"],
          ["diverging", "Diverging (two hues around a center)"], ["grayscale", "Grayscale"]]}
        onChange={(palette) => up({ palette })} />
      <OptInput label="Lowest value" inputMode="decimal" placeholder="auto" value={h.min}
        onChange={(min) => up({ min })} />
      <OptInput label="Highest value" inputMode="decimal" placeholder="auto" value={h.max}
        onChange={(max) => up({ max })} />
      {h.palette === "diverging" && (
        <OptInput label="Center value" inputMode="decimal" placeholder="halfway"
          value={h.center} onChange={(center) => up({ center })} />
      )}
      <OptSelect label="Standardise (z-score)" value={h.zscore}
        options={[["none", "No"], ["rows", "Each row"], ["columns", "Each column"]]}
        onChange={(zscore) => up({ zscore, ...(zscore !== "none" && h.palette !== "diverging"
          ? { palette: "diverging" as const } : {}) })} />
      <OptCheck label="Cluster rows" checked={h.clusterRows && !!canCluster}
        disabled={!canCluster} onChange={(clusterRows) => up({ clusterRows })} />
      <OptCheck label="Cluster columns" checked={h.clusterCols && !!canCluster}
        disabled={!canCluster} onChange={(clusterCols) => up({ clusterCols })} />
      {canCluster === false && (
        <OptNote>Hierarchical clustering (with dendrograms, linkage and distance choices)
          arrives with the next engine update; until then rows and columns keep the
          table&apos;s order.</OptNote>
      )}
      <OptCheck label="Reverse colors" checked={h.reverse} onChange={(reverse) => up({ reverse })} />
      <OptCheck label="Show values in cells" checked={h.labels}
        onChange={(labels) => up({ labels })} />
      {h.labels && (
        <OptInput label="Significant digits" type="number" min={1} max={8} value={h.digits}
          onChange={(v) => up({ digits: Number(v) || 3 })} />
      )}
      <OptSlider label="Gap between cells" value={h.gap} min={0} max={12} step={1}
        format={(v) => `${v} px`} onChange={(gap) => up({ gap })} />
      <OptInput label="Blank cells" type="color" value={h.missing}
        ariaLabel="Color of blank or excluded cells" onChange={(missing) => up({ missing })} />
      <OptCheck label="Cross out blank cells" checked={h.crossMissing}
        onChange={(crossMissing) => up({ crossMissing })} />
      <OptCheck label="Legend (color bar)" checked={h.legend}
        onChange={(legend) => up({ legend })} />
      {h.legend && (
        <OptInput label="Legend title" value={h.legendTitle}
          placeholder={HEAT_VALUE_LABEL[h.value]}
          onChange={(legendTitle) => up({ legendTitle })} />
      )}
      <OptCheck label="Datasets as rows (transpose)" checked={h.transpose}
        onChange={(transpose) => up({ transpose })} />
      <OptCheck label="Column labels on top" checked={h.xTop}
        onChange={(xTop) => up({ xTop })} />
    </>
  );
}

// ------------------------------------------------------------ volcano

interface VolcanoSettings { labels: "flagged" | "all" | "none" }
const normalizeVolcano = (raw: unknown): VolcanoSettings => {
  const v = (raw && typeof raw === "object" ? raw as Record<string, unknown> : {}).labels;
  return { labels: v === "all" || v === "none" ? v : "flagged" };
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export function VolcanoPlot({ graph, result, titles, scheme, format, onFormatChange }:
  PlotProps<MultiTOptions, any>) {
  const dark = useDarkMode();
  const vs = normalizeVolcano(graph.settings.volcano);
  const fig = useMemo(() => {
    const chrome = chromeOf(dark);
    const layout: Partial<Plotly.Layout> = { ...baseLayout(chrome) };
    if (!result || result.error || !Array.isArray(result.rows)) {
      return { traces: [] as Plotly.Data[], layout: {
        ...layout, xaxis: { visible: false }, yaxis: { visible: false },
        annotations: [{ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false,
          text: result?.error ? "No volcano plot: the analysis did not run"
            : "The volcano plot draws the results of multiple t tests",
          font: { color: chrome.muted } }],
      } as Partial<Plotly.Layout> };
    }
    const ratio = LOG_TESTS.includes(result.test);
    const rows = (result.rows as any[]).filter((r) => !r.omitted && r.p != null
      && (ratio ? r.ratio > 0 : r.difference != null));
    const accent = seriesStyle(0, dark, scheme === "mono" ? "default" : scheme).color;
    const pick = (flag: boolean) => rows.filter((r) => !!r.significant === flag);
    const trace = (rs: any[], flag: boolean): Plotly.Data => tagTrace({
      type: "scatter",
      mode: (vs.labels === "all" || (vs.labels === "flagged" && flag))
        ? "text+markers" : "markers",
      x: rs.map((r) => (ratio ? r.ratio : r.difference)),
      y: rs.map((r) => r.neg_log10_p),
      text: rs.map((r) => r.row),
      textposition: "top center",
      textfont: { size: 11, color: flag ? chrome.ink : chrome.muted },
      name: flag ? result.flag_label?.replace("?", "") || "Flagged" : "Not flagged",
      marker: {
        color: flag ? accent : chrome.muted, size: flag ? 10 : 7,
        symbol: flag ? "circle" : "circle-open",
        line: { color: flag ? chrome.surface : chrome.muted, width: flag ? 1.2 : 1.5 },
      },
      customdata: rs.map((r) => [r.p, r.p_adjusted]),
      hovertemplate: `%{text}<br>${ratio ? "ratio" : "difference"} %{x:.4g}`
        + "<br>P = %{customdata[0]:.4g}"
        + (result.method !== "none" ? "<br>adjusted %{customdata[1]:.4g}" : "")
        + "<extra></extra>",
    }, { ds: flag ? 1 : 0, role: "decor" }) as Plotly.Data;
    const shapes: Partial<Plotly.Shape>[] = [{
      type: "line", xref: "x", x0: ratio ? 1 : 0, x1: ratio ? 1 : 0, yref: "paper",
      y0: 0, y1: 1, line: { color: chrome.axis, width: 1 },
    }];
    const flagged = pick(true);
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (flagged.length) {
      // Threshold drawn at the largest P value that was still flagged.
      const ymin = Math.min(...flagged.map((r) => r.neg_log10_p));
      shapes.push({ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: ymin, y1: ymin,
        line: { color: chrome.muted, width: 1, dash: "dot" } });
      annotations.push({ xref: "paper", x: 1, xanchor: "right", y: ymin, yanchor: "bottom",
        showarrow: false, font: { size: 11, color: chrome.muted },
        text: `largest flagged P = ${formatSig(10 ** -ymin)}` });
    }
    return {
      traces: [trace(pick(false), false), trace(flagged, true)],
      layout: {
        ...layout,
        xaxis: { ...valueAxis(chrome, titles.x), type: ratio ? "log" : "linear" },
        yaxis: { ...valueAxis(chrome, titles.y), rangemode: "tozero" },
        shapes, annotations,
        showlegend: true,
        legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom",
          font: { color: chrome.ink, size: 12 } },
        margin: { l: 64, r: 16, t: 36, b: 52 },
      } as Partial<Plotly.Layout>,
    };
  }, [result, vs.labels, dark, scheme, titles.x, titles.y]);
  const ctx = useMemo(() => ({ dark, scheme, datasets: ["Not flagged", "Flagged"] }),
    [dark, scheme]);
  return (
    <FormattedPlot traces={fig.traces} layout={fig.layout} format={format}
      onFormatChange={onFormatChange} ctx={ctx} filename="volcano-plot" />
  );
}

export function VolcanoOptions({ graph }: GraphOptionsProps) {
  const [vs, set] = useGraphSetting(graph, "volcano", normalizeVolcano);
  if (!set) return null;
  return (
    <OptSelect label="Label points" value={vs.labels}
      options={[["flagged", "Flagged rows"], ["all", "Every row"], ["none", "None"]]}
      onChange={(labels) => set({ labels })} />
  );
}
