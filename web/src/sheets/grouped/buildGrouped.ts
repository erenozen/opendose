// Traces and layout for the raw-table grouped graphs: interleaved,
// stacked and separated bars, grouped scatter, interleaved box plots,
// connected lines across rows, and the two-panel three-way graph.
import type Plotly from "plotly.js-dist-min";
import { seriesStyle, type Chrome, type SchemeId } from "../../lib/palette";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";
import {
  defaultAssign, G_BOX, G_LINES, G_SCATTER, G_SEPARATED, G_STACKED, G_THREE_WAY,
  type GroupedGraphSettings, type ThreeWayOptions,
} from "./options";
import { baseLayout, categoryAxis, jitter, valueAxis, withAlpha } from "./plotting";
import {
  barPositions, errorExtent, grandValue, ordered, type CellStat,
} from "./stats";

export interface BuildInput {
  kind: string;
  table: DataTableModel;
  cells: (CellStat | null)[][];
  settings: GroupedGraphSettings;
  scheme: SchemeId;
  dark: boolean;
  chrome: Chrome;
  yTitle: string;
  /** Three-way layout from the bound three-way results sheet, if any. */
  threeWay: ThreeWayOptions | null;
}

export const rowLabels = (t: DataTableModel) =>
  t.rowTitles.map((r, i) => r.trim() || `Row ${i + 1}`);
export const datasetLabels = (t: DataTableModel) =>
  t.datasets.map((d, i) => d.name.trim() || `Dataset ${i + 1}`);

/** Which variable forms the clusters on the X axis for a graph kind. */
export function clusterByFor(kind: string, s: GroupedGraphSettings): "rows" | "datasets" {
  return s.clusterBy ?? (kind === G_SEPARATED ? "datasets" : "rows");
}

function errorText(c: CellStat, s: GroupedGraphSettings): string {
  const [lo, hi] = errorExtent(c, s.error);
  if (s.error === "none" || (lo === 0 && hi === 0)) return `mean ${formatSig(c.mean)}`;
  if (s.error === "sd" || s.error === "sem") {
    return `mean ${formatSig(c.mean)} ± ${s.error.toUpperCase()} ${formatSig(hi)}`;
  }
  return `mean ${formatSig(c.mean)} (${formatSig(c.mean - lo)} to ${formatSig(c.mean + hi)})`;
}

interface Cluster { label: string; get: (s: number) => CellStat | null }

/** Bars, points, box or scatter marks of one panel. `xAxis` names the
 *  Plotly axis ("x" or "x2"); `legend` controls legend entries. */
function panelTraces(inp: BuildInput, clusters: Cluster[], series: string[],
  colorOf: (cluster: number, series: number) => number, xAxis: string,
  legend: boolean): { traces: Plotly.Data[]; tickvals: number[]; ticktext: string[];
    centers: number[]; nSlots: number } {
  const { kind, settings: s, dark, chrome, scheme } = inp;
  const cOrder = ordered(clusters.length, s.clustersReverse);
  const sOrder = ordered(series.length, s.seriesReverse);
  const stacked = kind === G_STACKED;
  const separated = kind === G_SEPARATED;
  const { width, x } = stacked
    ? { width: 1 - s.clusterGap, x: cOrder.map((_, i) => series.map(() => i)) }
    : barPositions(clusters.length, series.length, s.clusterGap, s.barGap);
  const traces: Plotly.Data[] = [];
  const tickvals: number[] = [];
  const ticktext: string[] = [];
  const errVisible = s.error !== "none";

  sOrder.forEach((si, slotS) => {
    const xs: number[] = [];
    const ys: number[] = [];
    const plus: number[] = [];
    const minus: number[] = [];
    const fills: string[] = [];
    const lines: string[] = [];
    const hover: string[] = [];
    const ptX: number[] = [];
    const ptY: number[] = [];
    const ptC: string[] = [];
    const box = { q1: [] as number[], med: [] as number[], q3: [] as number[],
      lo: [] as number[], hi: [] as number[], x: [] as number[], fill: [] as string[] };
    const meanLineX: (number | null)[] = [];
    const meanLineY: (number | null)[] = [];
    cOrder.forEach((ci, slotC) => {
      const st = clusters[ci].get(si);
      const xpos = x[slotC][slotS];
      if (separated) {
        tickvals.push(xpos);
        ticktext.push(series[si]);
      }
      if (!st) return;
      const { color } = seriesStyle(colorOf(ci, si), dark, scheme);
      const [lo, hi] = errorExtent(st, s.error);
      xs.push(xpos);
      ys.push(st.mean);
      plus.push(hi);
      minus.push(stacked || s.errorDir === "above" ? 0 : lo);
      fills.push(withAlpha(color, "55"));
      lines.push(color);
      hover.push(`${clusters[ci].label} · ${series[si]}: ${errorText(st, s)}`
        + (st.n ? ` (n = ${st.n})` : ""));
      if (st.values.length && !stacked) {
        const jit = jitter(st.values.length, Math.min(width * 0.28, 0.12));
        st.values.forEach((v, j) => { ptX.push(xpos + jit[j]); ptY.push(v); ptC.push(color); });
      }
      if (kind === G_BOX && st.values.length && st.q1 !== null) {
        box.x.push(xpos); box.q1.push(st.q1); box.med.push(st.median!);
        box.q3.push(st.q3!); box.lo.push(st.min!); box.hi.push(st.max!);
        box.fill.push(color);
      }
      if (kind === G_SCATTER) {
        meanLineX.push(xpos - width * 0.42, xpos + width * 0.42, null);
        meanLineY.push(st.mean, st.mean, null);
      }
    });
    const style = seriesStyle(colorOf(0, si), dark, scheme);
    const name = series[si];
    const showLegend = legend && !separated && slotS >= 0;
    const common = { xaxis: xAxis, yaxis: "y", legendgroup: `s${si}` };

    if (kind === G_BOX) {
      if (!box.x.length) return;
      traces.push({
        ...common, type: "box", name, x: box.x,
        q1: box.q1, median: box.med, q3: box.q3,
        lowerfence: box.lo, upperfence: box.hi,
        width: width * 0.9,
        marker: { color: style.color },
        line: { color: style.color, width: 2 },
        fillcolor: withAlpha(style.color, "33"),
        boxpoints: false, showlegend: showLegend,
        hoverinfo: "y",
      } as unknown as Plotly.Data);
    } else if (kind === G_SCATTER) {
      traces.push({
        ...common, type: "scatter", mode: "lines", x: meanLineX, y: meanLineY,
        line: { color: chrome.ink, width: 2.5 }, hoverinfo: "skip", showlegend: false,
      } as Plotly.Data);
      traces.push({
        ...common, type: "scatter", mode: "markers", x: xs, y: ys,
        marker: { color: "rgba(0,0,0,0)", size: 1 },
        error_y: { type: "data", array: plus, arrayminus: minus, symmetric: false,
          visible: errVisible, color: chrome.ink, thickness: 1.5, width: 6 },
        text: hover, hovertemplate: "%{text}<extra></extra>", showlegend: false,
      } as Plotly.Data);
    } else {
      traces.push({
        ...common, type: "bar", name, x: xs, y: ys, width,
        marker: { color: fills, line: { color: lines, width: 1.5 } },
        error_y: { type: "data", array: plus, arrayminus: minus, symmetric: false,
          visible: errVisible, color: chrome.ink, thickness: 1.5, width: 6 },
        text: hover, textposition: "none",
        hovertemplate: "%{text}<extra></extra>", showlegend: showLegend,
      } as Plotly.Data);
    }
    const pointsShown = kind === G_SCATTER || (s.points && !stacked);
    if (pointsShown && ptX.length) {
      traces.push({
        ...common, type: "scatter", mode: "markers", x: ptX, y: ptY, name,
        marker: {
          color: kind === G_SCATTER ? ptC : ptC, symbol: style.symbol,
          size: kind === G_SCATTER ? 8 : 6,
          line: { color: chrome.surface, width: 1.2 },
        },
        hovertemplate: `${name}: %{y:.4g}<extra></extra>`,
        showlegend: legend && kind === G_SCATTER && !separated,
      } as Plotly.Data);
    }
  });

  const centers = cOrder.map((_, i) => i);
  return { traces, tickvals, ticktext, centers, nSlots: clusters.length };
}

function grandShapes(inp: BuildInput, yref = "y"): {
  shapes: Partial<Plotly.Shape>[]; annotations: Partial<Plotly.Annotations>[];
} {
  if (inp.settings.grand === "none") return { shapes: [], annotations: [] };
  const g = grandValue(inp.cells, inp.settings.grand);
  if (g === null) return { shapes: [], annotations: [] };
  const color = inp.chrome.muted;
  return {
    shapes: [{
      type: "line", xref: "paper", x0: 0, x1: 1, yref: yref as "y", y0: g, y1: g,
      line: { color, width: 1.5, dash: "dash" }, layer: "above",
    }],
    annotations: [{
      xref: "paper", x: 1, xanchor: "right", yref: yref as "y", y: g, yanchor: "bottom",
      text: `Grand ${inp.settings.grand} ${formatSig(g)}`, showarrow: false,
      font: { size: 11, color },
    }],
  };
}

function legendLayout(chrome: Chrome): Partial<Plotly.Legend> {
  return {
    orientation: "h", x: 0, y: 1.02, yanchor: "bottom",
    font: { color: chrome.ink, size: 12 }, bgcolor: "rgba(0,0,0,0)",
  };
}

/** The two-panel three-way graph: one panel per level of factor C;
 *  within each, rows are clusters and factor B levels are the bars. */
function buildThreeWay(inp: BuildInput): { traces: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const { table, cells, chrome, settings } = inp;
  const tw = inp.threeWay;
  const assign = tw?.assign ?? defaultAssign(table.datasets.length);
  const bNames = tw?.bLevels ?? ["B1", "B2"];
  const cNames = tw?.cLevels ?? ["C1", "C2"];
  const fNames = tw?.factorNames ?? ["Row factor", "Factor B", "Factor C"];
  const rows = rowLabels(table);
  const dsFor = (b: number, c: number) =>
    assign.findIndex((a) => a !== null && a[0] === b && a[1] === c);
  const traces: Plotly.Data[] = [];
  const layout: Partial<Plotly.Layout> = { ...baseLayout(chrome) };
  const annotations: Partial<Plotly.Annotations>[] = [];
  const domains: [number, number][] = [[0, 0.47], [0.53, 1]];
  [0, 1].forEach((c) => {
    const clusters: Cluster[] = rows.map((label, r) => ({
      label,
      get: (b: number) => {
        const d = dsFor(b, c);
        return d >= 0 ? cells[r]?.[d] ?? null : null;
      },
    }));
    const axis = c === 0 ? "x" : "x2";
    const p = panelTraces({ ...inp, kind: "grouped_interleaved" }, clusters,
      bNames.map((n, i) => n.trim() || `B${i + 1}`), (_, b) => b, axis, c === 0 && settings.legend);
    traces.push(...p.traces);
    const cOrder = ordered(rows.length, settings.clustersReverse);
    const ax = categoryAxis(chrome, p.centers, cOrder.map((i) => rows[i]),
      [-0.5, rows.length - 0.5], fNames[0]);
    (layout as Record<string, unknown>)[c === 0 ? "xaxis" : "xaxis2"] = {
      ...ax, domain: domains[c], anchor: "y",
    };
    annotations.push({
      xref: "paper", yref: "paper", x: (domains[c][0] + domains[c][1]) / 2, y: 1,
      yanchor: "bottom", showarrow: false,
      text: `<b>${(cNames[c] ?? "").trim() || `C${c + 1}`}</b>`,
      font: { size: 13, color: chrome.ink },
    });
  });
  const grand = grandShapes(inp);
  layout.yaxis = { ...valueAxis(chrome, inp.yTitle), rangemode: "tozero" };
  layout.barmode = "overlay";
  layout.shapes = grand.shapes;
  layout.annotations = [...annotations, ...grand.annotations];
  layout.showlegend = settings.legend;
  layout.legend = { ...legendLayout(chrome), y: -0.18, yanchor: "top",
    title: { text: `${fNames[1]}:` } };
  layout.margin = { l: 64, r: 16, t: 34, b: 90 };
  return { traces, layout };
}

function buildLines(inp: BuildInput): { traces: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  const { table, cells, settings: s, chrome, dark, scheme } = inp;
  const byRows = clusterByFor(inp.kind, s) === "rows";
  const rows = rowLabels(table);
  const dss = datasetLabels(table);
  const xLabels = byRows ? rows : dss;
  const lineLabels = byRows ? dss : rows;
  const xOrder = ordered(xLabels.length, s.clustersReverse);
  const lOrder = ordered(lineLabels.length, s.seriesReverse);
  const get = (xi: number, li: number) => (byRows ? cells[xi]?.[li] : cells[li]?.[xi]) ?? null;
  const traces: Plotly.Data[] = [];
  lOrder.forEach((li) => {
    const st = seriesStyle(li, dark, scheme);
    const name = lineLabels[li];
    if (s.lineMode === "subjects" && table.subcolumnFormat === "replicates") {
      // One thin line per subcolumn (subject) of this series.
      const nSub = Math.max(0, ...xOrder.map((xi) => {
        const d = byRows ? table.datasets[li] : table.datasets[xi];
        return d?.rows[0]?.length ?? 0;
      }));
      for (let k = 0; k < nSub; k++) {
        const xs: number[] = [];
        const ys: (number | null)[] = [];
        xOrder.forEach((xi, slot) => {
          const d = byRows ? table.datasets[li] : table.datasets[xi];
          const r = byRows ? xi : li;
          const raw = d?.rows[r]?.[k] ?? "";
          const v = raw.trim() === "" ? null : Number(raw);
          xs.push(slot);
          ys.push(v !== null && Number.isFinite(v) ? v : null);
        });
        if (ys.every((v) => v === null)) continue;
        traces.push({
          type: "scatter", mode: "lines+markers", x: xs, y: ys, name,
          legendgroup: `l${li}`, showlegend: false, connectgaps: false,
          line: { color: st.color, width: 1, dash: st.dash },
          marker: { color: st.color, symbol: st.symbol, size: 5 },
          opacity: 0.55,
          hovertemplate: `${name}, subject ${k + 1}: %{y:.4g}<extra></extra>`,
        } as Plotly.Data);
      }
    }
    const xs: number[] = [];
    const ys: number[] = [];
    const plus: number[] = [];
    const minus: number[] = [];
    const hover: string[] = [];
    xOrder.forEach((xi, slot) => {
      const c = get(xi, li);
      if (!c) return;
      const [lo, hi] = errorExtent(c, s.error);
      xs.push(slot); ys.push(c.mean); plus.push(hi);
      minus.push(s.errorDir === "above" ? 0 : lo);
      hover.push(`${xLabels[xi]} · ${name}: ${errorText(c, s)}`);
    });
    traces.push({
      type: "scatter", mode: "lines+markers", x: xs, y: ys, name,
      legendgroup: `l${li}`, showlegend: s.legend,
      line: { color: st.color, width: 2.5, dash: st.dash },
      marker: { color: st.color, symbol: st.symbol, size: 9,
        line: { color: chrome.surface, width: 1.5 } },
      error_y: { type: "data", array: plus, arrayminus: minus, symmetric: false,
        visible: s.error !== "none", color: st.color, thickness: 1.5, width: 6 },
      text: hover, hovertemplate: "%{text}<extra></extra>",
    } as Plotly.Data);
  });
  const grand = grandShapes(inp);
  return {
    traces,
    layout: {
      ...baseLayout(chrome),
      xaxis: categoryAxis(chrome, xOrder.map((_, i) => i), xOrder.map((i) => xLabels[i]),
        [-0.4, xLabels.length - 0.6]),
      yaxis: valueAxis(chrome, inp.yTitle),
      showlegend: s.legend,
      legend: legendLayout(chrome),
      margin: { l: 64, r: 16, t: s.legend ? 36 : 16, b: 52 },
      shapes: grand.shapes, annotations: grand.annotations,
    },
  };
}

export function buildGrouped(inp: BuildInput): {
  traces: Plotly.Data[]; layout: Partial<Plotly.Layout>;
} {
  if (inp.kind === G_THREE_WAY) return buildThreeWay(inp);
  if (inp.kind === G_LINES) return buildLines(inp);
  const { table, cells, settings: s, chrome } = inp;
  const byRows = clusterByFor(inp.kind, s) === "rows";
  const rows = rowLabels(table);
  const dss = datasetLabels(table);
  const clusterNames = byRows ? rows : dss;
  const series = byRows ? dss : rows;
  const clusters: Cluster[] = clusterNames.map((label, c) => ({
    label,
    get: (si: number) => (byRows ? cells[c]?.[si] : cells[si]?.[c]) ?? null,
  }));
  const separated = inp.kind === G_SEPARATED;
  // Separated bars take the color of their group (no legend needed);
  // otherwise each series keeps one color across groups.
  const colorOf = separated ? (c: number) => c : (_: number, si: number) => si;
  const p = panelTraces(inp, clusters, series, colorOf, "x", s.legend);
  const cOrder = ordered(clusters.length, s.clustersReverse);
  const grand = grandShapes(inp);
  const annotations = [...grand.annotations];
  let xaxis = categoryAxis(chrome, p.centers, cOrder.map((i) => clusterNames[i]),
    [-0.5, clusters.length - 0.5]);
  if (separated) {
    xaxis = { ...categoryAxis(chrome, p.tickvals, p.ticktext, [-0.5, clusters.length - 0.5]),
      tickfont: { color: chrome.inkSecondary, size: 11 } };
    cOrder.forEach((ci, slot) => annotations.push({
      xref: "x", yref: "paper", x: slot, y: 0, yanchor: "top", yshift: -30,
      showarrow: false, text: `<b>${clusterNames[ci]}</b>`,
      font: { size: 12.5, color: chrome.ink },
    }));
  }
  const bars = inp.kind !== G_SCATTER && inp.kind !== G_BOX;
  const legendOn = s.legend && !separated && series.length > 1;
  const noValues = inp.kind === G_BOX && !cells.some((r) => r.some((c) => c?.values.length));
  if (noValues) {
    annotations.push({
      xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false,
      text: "Box plots need replicate values", font: { color: chrome.muted, size: 13 },
    });
  }
  return {
    traces: p.traces,
    layout: {
      ...baseLayout(chrome),
      xaxis,
      yaxis: { ...valueAxis(chrome, inp.yTitle), ...(bars ? { rangemode: "tozero" } : {}) },
      barmode: inp.kind === G_STACKED ? "relative" : "overlay",
      boxmode: "overlay",
      showlegend: legendOn,
      legend: legendLayout(chrome),
      margin: { l: 64, r: 16, t: legendOn ? 36 : 16, b: separated ? 84 : 52 },
      shapes: grand.shapes,
      annotations,
    } as Partial<Plotly.Layout>,
  };
}
