// Heat map of a grouped table: one rectangle per row × dataset cell,
// colored by the cell's mean (or median, geometric mean, SD, SEM, %CV).
import type Plotly from "plotly.js-dist-min";
import { SCHEMES, seriesStyle, type Chrome, type SchemeId } from "../../lib/palette";
import { parseCell } from "../../project/table";
import type { DataTableModel } from "../../project/types";
import { formatSig } from "../../types";
import { datasetLabels, rowLabels } from "./buildGrouped";
import { DEFAULT_HEAT, HEAT_VALUE_LABEL, type HeatSettings } from "./options";
import { baseLayout } from "./plotting";
import { colorAt, heatStops, inkOn, zscoreMatrix, type CellStat } from "./stats";

export function heatValue(c: CellStat | null, v: HeatSettings["value"]): number | null {
  if (!c) return null;
  switch (v) {
    case "mean": return c.mean;
    case "median": return c.median ?? (c.values.length ? null : c.mean);
    case "geomean": return c.geoMean;
    case "sd": return c.sd;
    case "sem": return c.sem;
    case "cv": return c.sd !== null && c.mean !== 0 ? 100 * c.sd / Math.abs(c.mean) : null;
    default: return null;
  }
}

/** Lead and second colors a heat map takes from the graph's scheme. */
export function heatColors(scheme: SchemeId): [string, string] {
  if (scheme === "sequential") {
    return [SCHEMES.sequential.light[3], SCHEMES.default.light[1]];
  }
  return [seriesStyle(0, false, scheme).color, seriesStyle(1, false, scheme).color];
}

/** The matrix a heat map colours, with its row and column labels, after
 *  transposing and z-scoring (before any clustering order). */
export function heatMatrix(table: DataTableModel, cells: (CellStat | null)[][], h: HeatSettings):
  { z: (number | null)[][]; yLabels: string[]; xLabels: string[] } {
  const rows = rowLabels(table);
  const dss = datasetLabels(table);
  let z = cells.map((r) => r.map((c) => heatValue(c, h.value)));
  let yLabels = rows;
  let xLabels = dss;
  if (h.transpose) {
    z = dss.map((_, d) => rows.map((__, r) => z[r]?.[d] ?? null));
    yLabels = dss;
    xLabels = rows;
  }
  if (h.zscore !== "none") z = zscoreMatrix(z, h.zscore);
  return { z, yLabels, xLabels };
}

export function buildHeat(table: DataTableModel, cells: (CellStat | null)[][],
  h: HeatSettings, scheme: SchemeId, chrome: Chrome, dark: boolean,
  yTitle: string, order?: { rows: number[]; cols: number[] } | null):
  { traces: Plotly.Data[]; layout: Partial<Plotly.Layout> } {
  let { z, yLabels, xLabels } = heatMatrix(table, cells, h);
  if (order && order.rows.length === yLabels.length && order.cols.length === xLabels.length) {
    z = order.rows.map((i) => order.cols.map((j) => z[i]?.[j] ?? null));
    yLabels = order.rows.map((i) => yLabels[i]);
    xLabels = order.cols.map((j) => xLabels[j]);
  }
  const zs = h.zscore !== "none";
  const finite = z.flat().filter((v): v is number => v !== null && Number.isFinite(v));
  const big = finite.length ? Math.max(...finite.map(Math.abs)) || 1 : 1;
  const autoMin = zs ? -big : finite.length ? Math.min(...finite) : 0;
  const autoMax = zs ? big : finite.length ? Math.max(...finite) : 1;
  let zmin = parseCell(h.min) ?? autoMin;
  let zmax = parseCell(h.max) ?? autoMax;
  if (zmax <= zmin) zmax = zmin + (Math.abs(zmin) || 1);
  const centerVal = parseCell(h.center) ?? (zs ? 0 : null);
  const center = centerVal !== null ? (centerVal - zmin) / (zmax - zmin) : 0.5;
  const [lead, second] = heatColors(scheme);
  const stops = heatStops(h.palette, lead, second, h.reverse, center);
  const missingColor = dark && h.missing === DEFAULT_HEAT.missing ? "#3a3a3c" : h.missing;

  const traces: Plotly.Data[] = [];
  const missingZ = z.map((r) => r.map((v) => (v === null ? 1 : null)));
  if (missingZ.some((r) => r.some((v) => v !== null))) {
    traces.push({
      type: "heatmap", z: missingZ, x: xLabels.map((_, i) => i), y: yLabels.map((_, i) => i),
      colorscale: [[0, missingColor], [1, missingColor]], showscale: false,
      xgap: h.gap, ygap: h.gap, hoverinfo: "skip", zmin: 0, zmax: 1,
    } as unknown as Plotly.Data);
  }
  const label = zs ? `z-score of the ${HEAT_VALUE_LABEL[h.value].toLowerCase()} (by ${h.zscore === "rows" ? "row" : "column"})`
    : HEAT_VALUE_LABEL[h.value];
  const hover = z.map((r, i) => r.map((v, j) => `${yLabels[i]} · ${xLabels[j]}: `
    + (v === null ? "no value" : `${label.toLowerCase()} ${formatSig(v)}`)));
  traces.push({
    type: "heatmap", z, x: xLabels.map((_, i) => i), y: yLabels.map((_, i) => i),
    colorscale: stops, zmin, zmax, zauto: false,
    xgap: h.gap, ygap: h.gap,
    text: hover, hovertemplate: "%{text}<extra></extra>",
    showscale: h.legend,
    colorbar: {
      title: { text: h.legendTitle.trim() || (zs ? "z-score" : label), side: "right",
        font: { color: chrome.inkSecondary } },
      outlinewidth: 0, thickness: 14,
      tickfont: { color: chrome.muted },
    },
  } as unknown as Plotly.Data);

  const annotations: Partial<Plotly.Annotations>[] = [];
  z.forEach((r, i) => r.forEach((v, j) => {
    if (v === null) {
      if (h.crossMissing) {
        annotations.push({ x: j, y: i, text: "×", showarrow: false,
          font: { size: 18, color: inkOn(missingColor) } });
      }
      return;
    }
    if (!h.labels) return;
    const bg = colorAt(stops, (v - zmin) / (zmax - zmin));
    annotations.push({
      x: j, y: i, text: Number(v.toPrecision(h.digits)).toString(),
      showarrow: false, font: { size: 12, color: inkOn(bg) },
    });
  }));

  const axis = (labels: string[]): Partial<Plotly.LayoutAxis> => ({
    tickvals: labels.map((_, i) => i), ticktext: labels,
    showgrid: false, zeroline: false, showline: false, ticks: "",
    tickfont: { color: chrome.ink }, automargin: true,
  });
  return {
    traces,
    layout: {
      ...baseLayout(chrome),
      xaxis: { ...axis(xLabels), side: h.xTop ? "top" : "bottom",
        range: [-0.5, xLabels.length - 0.5] },
      yaxis: { ...axis(yLabels), autorange: "reversed",
        title: yTitle ? { text: yTitle, font: { color: chrome.inkSecondary } } : undefined },
      annotations,
      margin: { l: 64, r: 16, t: h.xTop ? 44 : 16, b: h.xTop ? 16 : 52 },
      dragmode: false,
    } as Partial<Plotly.Layout>,
  };
}
